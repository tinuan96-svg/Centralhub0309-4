import { createClient } from '@supabase/supabase-js';
import {
  getWebPushConfigStatus,
  sendWebPush,
} from '../../lib/server/webPush';
import type { StoredPushSubscription } from '../../lib/server/webPush';

export const config = {
  // 22:00 London is 21:00 UTC during BST and 22:00 UTC during GMT.
  // The runtime guard below keeps only the correct local-time execution.
  schedule: '*/15 21,22 * * *',
};

const TIME_ZONE = 'Europe/London';
const SUMMARY_HOUR = 22;

function getLocalParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);

  const read = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return {
    date: `${read('year')}-${read('month')}-${read('day')}`,
    hour: Number(read('hour')),
  };
}

function toAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(value);
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async function dailyPushSummary() {
  const now = new Date();
  const local = getLocalParts(now);

  if (local.hour !== SUMMARY_HOUR) {
    return json({ success: true, skipped: true, reason: 'Outside configured UK summary hour.', hour: local.hour });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceRoleKey = (
    process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ success: false, error: 'Supabase service configuration is missing.' }, 500);
  }

  const pushConfig = getWebPushConfigStatus();
  if (!pushConfig.configured) {
    return json({ success: false, error: 'Web Push configuration is missing.', missing: pushConfig.missing }, 500);
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const queryStart = new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString();
  const { data: existingNotifications, error: existingError } = await db
    .from('system_notifications')
    .select('id, metadata')
    .eq('category', 'daily_summary')
    .gte('created_at', queryStart)
    .limit(20);

  if (existingError) return json({ success: false, error: existingError.message }, 500);

  const alreadySent = (existingNotifications || []).some((item: any) => item.metadata?.summary_date === local.date);
  if (alreadySent) {
    return json({ success: true, skipped: true, reason: 'Summary already sent.', summary_date: local.date });
  }

  const { data: summary, error: summaryError } = await db
    .rpc('get_daily_paid_order_summary', {
      p_local_date: local.date,
      p_timezone: TIME_ZONE,
    })
    .single();

  if (summaryError || !summary) {
    return json({ success: false, error: summaryError?.message || 'Could not calculate daily summary.' }, 500);
  }

  const paidOrderCount = Number((summary as any).paid_order_count || 0);
  const sales = toAmount((summary as any).sales);
  const profit = toAmount((summary as any).profit);

  const title = 'Today’s CentralHub summary';
  const message = [
    `${local.date} paid-order summary`,
    `Paid orders: ${paidOrderCount}`,
    `Sales: ${formatMoney(sales)}`,
    `Profit: ${formatMoney(profit)}`,
  ].join(' • ');

  const { data: notification, error: notificationError } = await db
    .from('system_notifications')
    .insert({
      user_id: null,
      title,
      message,
      severity: 'info',
      category: 'daily_summary',
      action_url: '/dashboard',
      is_read: false,
      metadata: {
        source: 'centralhub-daily-summary',
        basis: 'payment_status_paid_only',
        summary_date: local.date,
        paid_order_count: paidOrderCount,
        sales,
        profit,
      },
    })
    .select('id, title, message, action_url, severity, category')
    .single();

  if (notificationError || !notification) {
    return json({ success: false, error: notificationError?.message || 'Could not save daily summary.' }, 500);
  }

  const { data: subscriptions, error: subscriptionError } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('is_enabled', true);

  if (subscriptionError) return json({ success: false, error: subscriptionError.message }, 500);

  const results = [];
  for (const subscription of subscriptions as StoredPushSubscription[]) {
    const result = await sendWebPush(subscription, {
      title: notification.title,
      body: notification.message,
      url: notification.action_url || '/dashboard',
      notificationId: notification.id,
      tag: `centralhub-daily-summary-${local.date}`,
      severity: notification.severity,
      category: notification.category,
      renotify: true,
    }, { ttl: 24 * 60 * 60, urgency: 'normal' });

    results.push({ id: subscription.id, ...result });

    if (result.status === 404 || result.status === 410) {
      await db.from('push_subscriptions').update({ is_enabled: false }).eq('id', subscription.id);
    }
  }

  return json({
    success: results.some((result) => result.ok),
    summary_date: local.date,
    paid_order_count: paidOrderCount,
    sales,
    profit,
    sent: results.filter((result) => result.ok).length,
    attempted: results.length,
  });
}

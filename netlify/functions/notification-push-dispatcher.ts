import { createClient } from '@supabase/supabase-js';

declare const Netlify: {
  env: {
    get(name: string): string | undefined;
  };
};

export const config = {
  schedule: '* * * * *',
};

const PUSH_CATEGORIES = [
  'support',
  'customer_message',
  'order_received',
  'order_confirmed',
  'daily_summary',
];
const MAX_AGE_MS = 30 * 60 * 1000;
const DIRECT_SEND_GRACE_MS = 75 * 1000;
const RETRY_BACKOFF_MS = 4 * 60 * 1000;

type NotificationRow = {
  id: string;
  category: string | null;
  created_at: string;
  metadata: Record<string, any> | null;
};

function env(name: string) {
  return (Netlify.env.get(name) || '').trim();
}

function shouldRetry(row: NotificationRow, now: number) {
  const metadata = row.metadata || {};
  const state = String(metadata.push_delivery_state || '');
  if (state === 'accepted') return false;

  const lastAttempt = Date.parse(String(metadata.push_last_attempt_at || ''));
  if (Number.isFinite(lastAttempt) && now - lastAttempt < RETRY_BACKOFF_MS) return false;
  return true;
}

export default async function notificationPushDispatcher() {
  const supabaseUrl = env('NEXT_PUBLIC_SUPABASE_URL') || env('SUPABASE_URL');
  const serviceRoleKey = env('CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY');
  const siteUrl = (env('CENTRALHUB_SITE_URL') || 'https://centralhub.network').replace(/\/$/, '');
  const pushSecret = env('CENTRALHUB_PUSH_API_SECRET');

  if (!supabaseUrl || !serviceRoleKey || !pushSecret) {
    console.error('[notification-push-dispatcher] configuration is missing');
    return;
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const now = Date.now();
  const earliest = new Date(now - MAX_AGE_MS).toISOString();
  const matureBefore = new Date(now - DIRECT_SEND_GRACE_MS).toISOString();

  const { data, error } = await db
    .from('system_notifications')
    .select('id, category, created_at, metadata')
    .in('category', PUSH_CATEGORIES)
    .gte('created_at', earliest)
    .lte('created_at', matureBefore)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) {
    console.error('[notification-push-dispatcher] notification query failed:', error.message);
    return;
  }

  const rows = ((data || []) as NotificationRow[]).filter((row) => shouldRetry(row, now));
  let delivered = 0;
  let partial = 0;
  let failed = 0;

  for (const row of rows) {
    const metadata = row.metadata || {};
    const nativeOnly = String(metadata.push_delivery_state || '') === 'partial';

    try {
      const response = await fetch(`${siteUrl}/api/push/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pushSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notificationId: row.id, nativeOnly }),
      });
      const payload: any = await response.json().catch(() => null);
      const state = String(payload?.delivery_state || '');
      if (state === 'accepted') delivered += 1;
      else if (state === 'partial') partial += 1;
      else failed += 1;

      if (!response.ok || payload?.success === false) {
        console.error(
          '[notification-push-dispatcher] push retry incomplete:',
          row.id,
          response.status,
          payload?.error || payload?.message || state || 'unknown error',
        );
      }
    } catch (pushError: any) {
      failed += 1;
      await db
        .from('system_notifications')
        .update({
          metadata: {
            ...metadata,
            push_delivery_state: 'failed',
            push_last_attempt_at: new Date().toISOString(),
            push_dispatcher_error: String(pushError?.message || pushError || 'dispatcher request failed').slice(0, 300),
          },
        })
        .eq('id', row.id);
    }
  }

  console.log('[notification-push-dispatcher]', JSON.stringify({ inspected: rows.length, delivered, partial, failed }));
}

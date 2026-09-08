import { NextResponse } from 'next/server';
import { sendWebPush, getWebPushConfigStatus, StoredPushSubscription } from '@/lib/server/webPush';
import { getServiceClient, jsonError } from '../_utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function hasInternalAccess(req: Request) {
  const configuredSecret = process.env.CENTRALHUB_PUSH_API_SECRET?.trim();
  if (!configuredSecret) return false;

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  return token === configuredSecret;
}

function getAutomaticOrderDedupeKey(body: any) {
  const metadata = body?.metadata && typeof body.metadata === 'object' ? body.metadata : {};
  const eventType = String(metadata.event_type || body?.event_type || '').trim();
  const orderId = String(metadata.order_id || body?.orderId || body?.order_id || '').trim();

  if (!['ORDER_RECEIVED', 'PAYMENT_CONFIRMED'].includes(eventType) || !orderId) {
    return null;
  }

  return String(metadata.dedupe_key || `${eventType}:${orderId}`).trim();
}

export async function POST(req: Request) {
  if (process.env.NEXT_OUTPUT?.trim() === 'export') {
    return new Response('Not available in static export', { status: 404 });
  }

  if (!hasInternalAccess(req)) {
    return jsonError('Unauthorized push sender request.', 401);
  }

  const config = getWebPushConfigStatus();
  if (!config.configured) {
    return jsonError('Web Push keys are missing from the deployment environment.', 500, config.missing);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body.');
  }

  const supabase = getServiceClient();
  const automaticOrderDedupeKey = getAutomaticOrderDedupeKey(body);
  const incomingMetadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
  const notificationMetadata = automaticOrderDedupeKey
    ? {
        ...incomingMetadata,
        source: 'centralhub-automatic-order-push',
        dedupe_key: automaticOrderDedupeKey,
      }
    : incomingMetadata;
  let notification = null;

  if (automaticOrderDedupeKey) {
    const { data: existing, error: existingError } = await supabase
      .from('system_notifications')
      .select('id')
      .eq('metadata->>dedupe_key', automaticOrderDedupeKey)
      .maybeSingle();

    if (existingError) return jsonError(existingError.message, 500);
    if (existing) {
      return NextResponse.json({
        success: true,
        deduped: true,
        notification_id: existing.id,
        sent: 0,
        attempted: 0,
        message: 'Duplicate automatic order notification ignored.',
      });
    }
  }

  if (body.notificationId) {
    const { data, error } = await supabase
      .from('system_notifications')
      .select('id, user_id, title, message, action_url, severity, category')
      .eq('id', body.notificationId)
      .single();

    if (error || !data) return jsonError(error?.message || 'Notification not found.', 404);
    notification = data;
  } else {
    const title = String(body.title || '').trim();
    const message = String(body.message || body.body || '').trim();

    if (!title || !message) {
      return jsonError('title and message are required when notificationId is not supplied.');
    }

    const { data, error } = await supabase
      .from('system_notifications')
      .insert({
        user_id: body.userId || null,
        store_id: body.storeId || null,
        title,
        message,
        severity: body.severity || 'info',
        category: body.category || 'phone_push',
        action_url: body.url || body.action_url || '/dashboard',
        is_read: false,
        metadata: notificationMetadata,
      })
      .select('id, user_id, title, message, action_url, severity, category')
      .single();

    if (error || !data) {
      if (automaticOrderDedupeKey && error?.code === '23505') {
        const { data: existing } = await supabase
          .from('system_notifications')
          .select('id')
          .eq('metadata->>dedupe_key', automaticOrderDedupeKey)
          .maybeSingle();

        if (existing) {
          return NextResponse.json({
            success: true,
            deduped: true,
            notification_id: existing.id,
            sent: 0,
            attempted: 0,
            message: 'Duplicate automatic order notification ignored.',
          });
        }
      }

      return jsonError(error?.message || 'Could not create notification.', 500);
    }
    notification = data;
  }

  let subscriptionQuery = supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .eq('is_enabled', true);

  if (notification.user_id) {
    subscriptionQuery = subscriptionQuery.eq('user_id', notification.user_id);
  }

  const { data: subscriptions, error: subscriptionError } = await subscriptionQuery;
  if (subscriptionError) return jsonError(subscriptionError.message, 500);

  if (!subscriptions?.length) {
    return NextResponse.json({
      success: true,
      notification_id: notification.id,
      sent: 0,
      attempted: 0,
      message: 'Notification saved, but no enabled phone subscriptions matched it.',
    });
  }

  const results = [];
  for (const subscription of subscriptions as StoredPushSubscription[]) {
    const result = await sendWebPush(subscription, {
      title: notification.title,
      body: notification.message,
      url: notification.action_url || '/dashboard',
      notificationId: notification.id,
      tag: `centralhub-${notification.id}`,
      severity: notification.severity,
      category: notification.category,
      renotify: true,
    }, { ttl: Number(body.ttl || 60 * 60), urgency: body.urgency || 'normal' });

    results.push({ id: subscription.id, ...result });

    if (result.status === 404 || result.status === 410) {
      await supabase
        .from('push_subscriptions')
        .update({ is_enabled: false })
        .eq('id', subscription.id);
    }
  }

  const sent = results.filter((result) => result.ok).length;

  return NextResponse.json({
    success: sent > 0,
    notification_id: notification.id,
    sent,
    attempted: results.length,
    results,
  }, { status: sent > 0 ? 200 : 502 });
}

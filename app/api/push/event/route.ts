import { NextResponse } from 'next/server';
import { sendWebPush, getWebPushConfigStatus, StoredPushSubscription } from '@/lib/server/webPush';
import { getServiceClient, getUserFromRequest, jsonError } from '../_utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type PushEventType = 'ORDER_RECEIVED' | 'PAYMENT_CONFIRMED';

function buildNotification(eventType: PushEventType, body: any) {
  const orderNumber = String(body.orderNumber || body.order_number || 'new order').trim();
  const customerName = String(body.customerName || body.customer_name || 'Customer').trim();
  const orderTotal = body.orderTotal ?? body.order_total;

  if (eventType === 'ORDER_RECEIVED') {
    return {
      title: 'New order received',
      message: `Order ${orderNumber} from ${customerName}${orderTotal ? ` — £${Number(orderTotal).toFixed(2)}` : ''}.`,
      url: '/orders',
      category: 'order_received',
    };
  }

  return {
    title: 'Order confirmed',
    message: `Order ${orderNumber} has been confirmed${orderTotal ? ` — £${Number(orderTotal).toFixed(2)}` : ''}.`,
    url: '/orders',
    category: 'order_confirmed',
  };
}

export async function POST(req: Request) {
  if (process.env.NEXT_OUTPUT?.trim() === 'export') {
    return new Response('Not available in static export', { status: 404 });
  }

  const config = getWebPushConfigStatus();
  if (!config.configured) {
    return jsonError('Web Push keys are missing from the deployment environment.', 500, config.missing);
  }

  const { user, error } = await getUserFromRequest(req);
  if (error || !user) return jsonError(error || 'Unauthorized', 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body.');
  }

  const eventType = String(body.eventType || body.event_type || '').trim() as PushEventType;
  if (!['ORDER_RECEIVED', 'PAYMENT_CONFIRMED'].includes(eventType)) {
    return jsonError('Unsupported automatic phone notification event.');
  }

  const notificationDetails = buildNotification(eventType, body);
  const supabase = getServiceClient();

  const { data: notification, error: notificationError } = await supabase
    .from('system_notifications')
    .insert({
      user_id: user.id,
      store_id: body.storeId || body.store_id || null,
      title: notificationDetails.title,
      message: notificationDetails.message,
      severity: 'info',
      category: notificationDetails.category,
      action_url: notificationDetails.url,
      is_read: false,
      metadata: {
        source: 'centralhub-automatic-phone-push',
        event_type: eventType,
        order_id: body.orderId || body.order_id || null,
        order_number: body.orderNumber || body.order_number || null,
      },
    })
    .select('id, title, message, action_url, severity, category')
    .single();

  if (notificationError || !notification) {
    return jsonError(notificationError?.message || 'Could not create automatic notification.', 500);
  }

  const { data: subscriptions, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', user.id)
    .eq('is_enabled', true);

  if (subscriptionError) return jsonError(subscriptionError.message, 500);

  if (!subscriptions?.length) {
    return NextResponse.json({
      success: true,
      notification_id: notification.id,
      sent: 0,
      attempted: 0,
      message: 'Notification saved, but this admin has no enabled phone subscription.',
    });
  }

  const results = [];
  for (const subscription of subscriptions as StoredPushSubscription[]) {
    const result = await sendWebPush(subscription, {
      title: notification.title,
      body: notification.message,
      url: notification.action_url || '/orders',
      notificationId: notification.id,
      tag: `centralhub-${notification.id}`,
      severity: notification.severity,
      category: notification.category,
      renotify: true,
    }, { ttl: 60 * 60, urgency: 'high' });

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

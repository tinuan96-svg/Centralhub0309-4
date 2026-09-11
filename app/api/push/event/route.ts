import { NextResponse } from 'next/server';
import { sendWebPush, getWebPushConfigStatus, StoredPushSubscription } from '@/lib/server/webPush';
import { getFirebaseMessagingConfigStatus, sendFirebasePush } from '@/lib/server/firebaseMessaging';
import { getServiceClient, getUserFromRequest, jsonError } from '../_utils';
import { getStoreNotificationBrand } from '@/lib/notifications/storeNotificationBrand';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type PushEventType = 'ORDER_RECEIVED' | 'PAYMENT_CONFIRMED';

function isInvalidFirebaseToken(result: { status?: number; error?: string }) {
  return result.status === 404 || /UNREGISTERED|registration-token-not-registered|not a valid FCM registration token/i.test(result.error || '');
}

function buildNotification(eventType: PushEventType, body: any) {
  const orderNumber = String(body.orderNumber || body.order_number || 'new order').trim();
  const customerName = String(body.customerName || body.customer_name || 'Customer').trim();
  const rawOrderTotal = body.orderTotal ?? body.order_total;
  const parsedOrderTotal = Number(String(rawOrderTotal ?? '').replace(/[^0-9.-]/g, ''));
  const orderTotalText = Number.isFinite(parsedOrderTotal) && parsedOrderTotal > 0
    ? ` — £${parsedOrderTotal.toFixed(2)}`
    : '';

  if (eventType === 'ORDER_RECEIVED') {
    return {
      title: 'New order received',
      message: `Order ${orderNumber} from ${customerName}${orderTotalText}.`,
      url: '/orders',
      category: 'order_received',
    };
  }

  return {
    title: 'Order confirmed',
    message: `Order ${orderNumber} has been confirmed${orderTotalText}.`,
    url: '/orders',
    category: 'order_confirmed',
  };
}

export async function POST(req: Request) {
  if (process.env.NEXT_OUTPUT?.trim() === 'export') {
    return new Response('Not available in static export', { status: 404 });
  }

  const webConfig = getWebPushConfigStatus();
  const firebaseConfig = getFirebaseMessagingConfigStatus();
  if (!webConfig.configured && !firebaseConfig.configured) {
    return jsonError('No push provider is configured for CentralHub.', 500, {
      web_missing: webConfig.missing,
      native_missing: firebaseConfig.missing,
    });
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

  const supabase = getServiceClient();
  const orderId = String(body.orderId || body.order_id || '').trim();
  if (!orderId) {
    return jsonError('orderId is required for automatic order notifications.', 400);
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('payment_status, order_status, store_id')
    .eq('id', orderId)
    .maybeSingle();

  if (orderError) return jsonError(orderError.message, 500);
  if (!order) return jsonError('Order not found.', 404);

  // Fail closed: both automatic order events require a paid order. This
  // protects this legacy authenticated route as well as the internal sender.
  if (order.payment_status !== 'paid') {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'Order notification withheld until payment is successful.',
      sent: 0,
      attempted: 0,
    }, { status: 202 });
  }

  const canonicalStoreId = order.store_id || body.storeId || body.store_id || null;
  const { data: store } = canonicalStoreId
    ? await supabase.from('stores').select('slug, name').eq('id', canonicalStoreId).maybeSingle()
    : { data: null };
  const storeBrand = getStoreNotificationBrand(store?.slug, store?.name);
  const notificationDetails = buildNotification(eventType, body);
  const dedupeKey = `${eventType}:${orderId}`;

  if (dedupeKey) {
    const { data: existing, error: existingError } = await supabase
      .from('system_notifications')
      .select('id')
      .eq('metadata->>dedupe_key', dedupeKey)
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

  const notificationMetadata = {
    source: 'centralhub-automatic-order-push',
    event_type: eventType,
    order_id: orderId || null,
    order_number: body.orderNumber || body.order_number || null,
    store_slug: storeBrand.slug,
    store_name: storeBrand.name,
    store_logo_url: storeBrand.webIcon,
    ...(dedupeKey ? { dedupe_key: dedupeKey } : {}),
  };

  const { data: notification, error: notificationError } = await supabase
    .from('system_notifications')
    .insert({
      user_id: user.id,
      store_id: canonicalStoreId,
      title: notificationDetails.title,
      message: notificationDetails.message,
      severity: 'info',
      category: notificationDetails.category,
      action_url: notificationDetails.url,
      is_read: false,
      metadata: notificationMetadata,
    })
    .select('id, store_id, title, message, action_url, severity, category, metadata')
    .single();

  if (notificationError || !notification) {
    if (dedupeKey && notificationError?.code === '23505') {
      const { data: existing } = await supabase
        .from('system_notifications')
        .select('id')
        .eq('metadata->>dedupe_key', dedupeKey)
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

    return jsonError(notificationError?.message || 'Could not create automatic notification.', 500);
  }

  const { data: subscriptions, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', user.id)
    .eq('is_enabled', true);

  if (subscriptionError) return jsonError(subscriptionError.message, 500);

  const { data: nativeDevices, error: nativeError } = await supabase
    .from('native_push_devices')
    .select('id, token')
    .eq('user_id', user.id)
    .eq('is_enabled', true);

  if (nativeError) return jsonError(nativeError.message, 500);

  if (!subscriptions?.length && !nativeDevices?.length) {
    return NextResponse.json({
      success: true,
      notification_id: notification.id,
      sent: 0,
      attempted: 0,
      message: 'Notification saved, but this admin has no enabled phone subscription.',
    });
  }

  const webResults = [];
  if (webConfig.configured) {
    for (const subscription of (subscriptions || []) as StoredPushSubscription[]) {
      const result = await sendWebPush(subscription, {
        title: notification.title,
        body: notification.message,
        url: notification.action_url || '/orders',
        notificationId: notification.id,
        tag: `centralhub-${notification.id}`,
        severity: notification.severity,
        category: notification.category,
        icon: storeBrand.webIcon,
        badge: storeBrand.webIcon,
        storeId: notification.store_id,
        storeName: storeBrand.name,
        storeSlug: storeBrand.slug,
        renotify: true,
      }, { ttl: 60 * 60, urgency: 'high' });

      webResults.push({ id: subscription.id, ...result });

      if (result.status === 404 || result.status === 410) {
        await supabase
          .from('push_subscriptions')
          .update({ is_enabled: false })
          .eq('id', subscription.id);
      }
    }
  }

  const nativeResults = [];
  if (firebaseConfig.configured) {
    for (const device of nativeDevices || []) {
      const result = await sendFirebasePush(device.token, {
        title: notification.title,
        body: notification.message,
        url: notification.action_url || '/orders',
        notificationId: notification.id,
        category: notification.category,
        severity: notification.severity,
        dedupeKey,
        storeId: notification.store_id,
        storeSlug: storeBrand.slug,
      });

      nativeResults.push({ id: device.id, ...result });

      if (isInvalidFirebaseToken(result)) {
        await supabase
          .from('native_push_devices')
          .update({ is_enabled: false, updated_at: new Date().toISOString() })
          .eq('id', device.id);
      }
    }
  }

  const sent = webResults.filter((result) => result.ok).length
    + nativeResults.filter((result) => result.ok).length;
  const attempted = (webConfig.configured ? webResults.length : 0) + (firebaseConfig.configured ? nativeResults.length : 0);
  return NextResponse.json({
    success: sent > 0,
    notification_id: notification.id,
    sent,
    attempted,
    web_sent: webResults.filter((result) => result.ok).length,
    native_sent: nativeResults.filter((result) => result.ok).length,
    web_configured: webConfig.configured,
    native_configured: firebaseConfig.configured,
    enabled_web_subscriptions: subscriptions?.length || 0,
    enabled_native_devices: nativeDevices?.length || 0,
    web_results: webResults,
    native_results: nativeResults,
  }, { status: sent > 0 ? 200 : 502 });
}

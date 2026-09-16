import { NextResponse } from 'next/server';
import { sendWebPush, getWebPushConfigStatus, StoredPushSubscription } from '@/lib/server/webPush';
import { getFirebaseMessagingConfigStatus, sendFirebasePush } from '@/lib/server/firebaseMessaging';
import { getServiceClient, jsonError } from '../_utils';
import { getStoreNotificationBrand } from '@/lib/notifications/storeNotificationBrand';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function hasInternalAccess(req: Request) {
  const configuredSecret = process.env.CENTRALHUB_PUSH_API_SECRET?.trim();
  if (!configuredSecret) return false;
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  return token === configuredSecret;
}

function getNotificationDedupeKey(body: any) {
  const metadata = body?.metadata && typeof body.metadata === 'object' ? body.metadata : {};
  const eventType = String(metadata.event_type || body?.event_type || '').trim();
  const orderId = String(metadata.order_id || body?.orderId || body?.order_id || '').trim();
  if (['ORDER_RECEIVED', 'PAYMENT_CONFIRMED'].includes(eventType) && orderId) {
    return String(metadata.dedupe_key || `${eventType}:${orderId}`).trim();
  }

  const category = String(body?.category || metadata.category || '').trim();
  const messageId = String(metadata.message_id || body?.message_id || '').trim();
  if (category === 'customer_message' && messageId) {
    return String(metadata.dedupe_key || `CUSTOMER_MESSAGE:${messageId}`).trim();
  }
  if (category === 'support' && metadata.dedupe_key) return String(metadata.dedupe_key).trim();
  return null;
}

function isInvalidFirebaseToken(result: { status?: number; error?: string }) {
  return result.status === 404 || /UNREGISTERED|registration-token-not-registered|not a valid FCM registration token/i.test(result.error || '');
}

function summarizeProviderResult(result: any) {
  return {
    id: result?.id || null,
    ok: Boolean(result?.ok),
    status: Number.isFinite(Number(result?.status)) ? Number(result.status) : null,
    error: result?.error ? String(result.error).slice(0, 300) : null,
  };
}

export async function POST(req: Request) {
  if (process.env.NEXT_OUTPUT?.trim() === 'export') {
    return new Response('Not available in static export', { status: 404 });
  }
  if (!hasInternalAccess(req)) return jsonError('Unauthorized push sender request.', 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body.');
  }

  const webConfig = getWebPushConfigStatus();
  const firebaseConfig = getFirebaseMessagingConfigStatus();
  if (!webConfig.configured && !firebaseConfig.configured) {
    return jsonError('No push provider is configured for CentralHub.', 500, {
      web_missing: webConfig.missing,
      native_missing: firebaseConfig.missing,
    });
  }

  const supabase = getServiceClient();
  const notificationDedupeKey = getNotificationDedupeKey(body);
  const incomingMetadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
  const storeId = body.storeId || body.store_id || incomingMetadata.store_id || null;
  let requestedStore: { slug?: string | null; name?: string | null } | null = null;

  if (storeId) {
    const { data } = await supabase.from('stores').select('slug, name').eq('id', storeId).maybeSingle();
    requestedStore = data;
  }

  const requestedStoreBrand = getStoreNotificationBrand(requestedStore?.slug, requestedStore?.name);
  const notificationMetadata = notificationDedupeKey
    ? {
        ...incomingMetadata,
        source: incomingMetadata.source || 'centralhub-automatic-notification',
        dedupe_key: notificationDedupeKey,
        store_slug: requestedStoreBrand.slug,
        store_name: requestedStoreBrand.name,
        store_logo_url: requestedStoreBrand.webIcon,
      }
    : incomingMetadata;

  let notification: any = null;

  if (notificationDedupeKey && !body.notificationId) {
    const { data: existing, error: existingError } = await supabase
      .from('system_notifications')
      .select('id')
      .eq('metadata->>dedupe_key', notificationDedupeKey)
      .maybeSingle();
    if (existingError) return jsonError(existingError.message, 500);
    if (existing) {
      return NextResponse.json({
        success: true,
        deduped: true,
        notification_id: existing.id,
        sent: 0,
        attempted: 0,
        message: 'Duplicate automatic notification ignored.',
      });
    }
  }

  if (body.notificationId) {
    const { data, error } = await supabase
      .from('system_notifications')
      .select('id, user_id, store_id, title, message, action_url, severity, category, metadata')
      .eq('id', body.notificationId)
      .single();
    if (error || !data) return jsonError(error?.message || 'Notification not found.', 404);
    notification = data;

    const priorState = String(notification.metadata?.push_delivery_state || '');
    const nativeOnly = body.nativeOnly === true;
    if (!body.force && priorState === 'accepted' && !nativeOnly) {
      return NextResponse.json({
        success: true,
        deduped: true,
        notification_id: notification.id,
        sent: 0,
        attempted: 0,
        delivery_state: 'accepted',
        message: 'Notification was already delivered to a phone provider.',
      });
    }
    if (!body.force && nativeOnly && Number(notification.metadata?.push_native_sent || 0) > 0) {
      return NextResponse.json({
        success: true,
        deduped: true,
        notification_id: notification.id,
        sent: 0,
        attempted: 0,
        delivery_state: priorState || 'accepted',
        message: 'Native notification was already delivered.',
      });
    }
  } else {
    const title = String(body.title || '').trim();
    const message = String(body.message || body.body || '').trim();
    if (!title || !message) return jsonError('title and message are required when notificationId is not supplied.');

    const { data, error } = await supabase
      .from('system_notifications')
      .insert({
        user_id: body.userId || null,
        store_id: storeId,
        title,
        message,
        severity: body.severity || 'info',
        category: body.category || 'phone_push',
        action_url: body.url || body.action_url || '/dashboard',
        is_read: false,
        metadata: notificationMetadata,
      })
      .select('id, user_id, store_id, title, message, action_url, severity, category, metadata')
      .single();

    if (error || !data) {
      if (notificationDedupeKey && error?.code === '23505') {
        const { data: existing } = await supabase
          .from('system_notifications')
          .select('id')
          .eq('metadata->>dedupe_key', notificationDedupeKey)
          .maybeSingle();
        if (existing) {
          return NextResponse.json({
            success: true,
            deduped: true,
            notification_id: existing.id,
            sent: 0,
            attempted: 0,
            message: 'Duplicate automatic notification ignored.',
          });
        }
      }
      return jsonError(error?.message || 'Could not create notification.', 500);
    }
    notification = data;
  }

  const notificationStoreId = notification.store_id || storeId || null;
  let notificationStore: { slug?: string | null; name?: string | null } | null = requestedStore;
  if ((!notificationStore || notificationStoreId !== storeId) && notificationStoreId) {
    const { data } = await supabase.from('stores').select('slug, name').eq('id', notificationStoreId).maybeSingle();
    notificationStore = data;
  }
  const storeBrand = getStoreNotificationBrand(notificationStore?.slug, notificationStore?.name);

  let subscriptionQuery = supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .eq('is_enabled', true);
  if (notification.user_id) subscriptionQuery = subscriptionQuery.eq('user_id', notification.user_id);
  const { data: subscriptions, error: subscriptionError } = await subscriptionQuery;
  if (subscriptionError) return jsonError(subscriptionError.message, 500);

  let nativeQuery = supabase
    .from('native_push_devices')
    .select('id, user_id, token')
    .eq('is_enabled', true);
  if (notification.user_id) nativeQuery = nativeQuery.eq('user_id', notification.user_id);
  const { data: nativeDevices, error: nativeError } = await nativeQuery;
  if (nativeError) return jsonError(nativeError.message, 500);

  const nativeOnly = body.nativeOnly === true;
  const webResults: any[] = [];
  if (webConfig.configured && !nativeOnly) {
    for (const subscription of (subscriptions || []) as StoredPushSubscription[]) {
      const result = await sendWebPush(subscription, {
        title: notification.title,
        body: notification.message,
        url: notification.action_url || '/dashboard',
        notificationId: notification.id,
        tag: `centralhub-${notification.id}`,
        severity: notification.severity,
        category: notification.category,
        icon: storeBrand.webIcon,
        badge: storeBrand.webIcon,
        storeId: notificationStoreId,
        storeName: storeBrand.name,
        storeSlug: storeBrand.slug,
        silent: false,
        vibrate: notification.category === 'customer_message' ? [350, 100, 350, 100, 350] : [200, 100, 200],
        requireInteraction: notification.category === 'customer_message',
        renotify: true,
      }, {
        ttl: Number(body.ttl || 60 * 60),
        urgency: body.urgency || (notification.category === 'customer_message' ? 'high' : 'normal'),
      });
      webResults.push({ id: subscription.id, ...result });
      if (result.status === 404 || result.status === 410) {
        await supabase.from('push_subscriptions').update({ is_enabled: false }).eq('id', subscription.id);
      }
    }
  }

  const nativeResults: any[] = [];
  if (firebaseConfig.configured) {
    for (const device of nativeDevices || []) {
      const result = await sendFirebasePush(device.token, {
        title: notification.title,
        body: notification.message,
        url: notification.action_url,
        notificationId: notification.id,
        category: notification.category,
        severity: notification.severity,
        dedupeKey: notification.metadata?.dedupe_key || null,
        storeId: notificationStoreId,
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

  const webSent = webResults.filter((result) => result.ok).length;
  const nativeSent = nativeResults.filter((result) => result.ok).length;
  const sent = webSent + nativeSent;
  const attempted = webResults.length + nativeResults.length;
  const enabledNativeDevices = nativeDevices?.length || 0;
  const enabledWebSubscriptions = subscriptions?.length || 0;
  const previousMetadata = notification.metadata && typeof notification.metadata === 'object' ? notification.metadata : {};
  const previousWebSent = Number(previousMetadata.push_web_sent || 0);
  const previousNativeSent = Number(previousMetadata.push_native_sent || 0);
  const cumulativeWebSent = Math.max(previousWebSent, webSent);
  const cumulativeNativeSent = Math.max(previousNativeSent, nativeSent);

  let deliveryState: 'accepted' | 'partial' | 'failed';
  if (nativeOnly) {
    deliveryState = cumulativeNativeSent > 0
      ? 'accepted'
      : cumulativeWebSent > 0
        ? 'partial'
        : 'failed';
  } else if (enabledNativeDevices > 0 && cumulativeNativeSent === 0 && (sent > 0 || cumulativeWebSent > 0)) {
    deliveryState = 'partial';
  } else {
    deliveryState = sent > 0 || cumulativeWebSent > 0 || cumulativeNativeSent > 0 ? 'accepted' : 'failed';
  }

  const auditMetadata = {
    ...previousMetadata,
    push_delivery_state: deliveryState,
    push_provider_accepted: sent > 0 || Boolean(previousMetadata.push_provider_accepted),
    push_attempted: attempted,
    push_sent: Math.max(Number(previousMetadata.push_sent || 0), cumulativeWebSent + cumulativeNativeSent, sent),
    push_web_sent: cumulativeWebSent,
    push_native_sent: cumulativeNativeSent,
    push_web_configured: webConfig.configured,
    push_native_configured: firebaseConfig.configured,
    push_enabled_web_subscriptions: enabledWebSubscriptions,
    push_enabled_native_devices: enabledNativeDevices,
    push_native_only_attempt: nativeOnly,
    push_last_attempt_at: new Date().toISOString(),
    push_web_results: webResults.map(summarizeProviderResult),
    push_native_results: nativeResults.map(summarizeProviderResult),
  };

  const { error: auditError } = await supabase
    .from('system_notifications')
    .update({ metadata: auditMetadata })
    .eq('id', notification.id);

  if (!attempted) {
    return NextResponse.json({
      success: false,
      notification_id: notification.id,
      sent: 0,
      attempted: 0,
      delivery_state: deliveryState,
      native_configured: firebaseConfig.configured,
      web_configured: webConfig.configured,
      enabled_web_subscriptions: enabledWebSubscriptions,
      enabled_native_devices: enabledNativeDevices,
      delivery_audit_saved: !auditError,
      message: 'Notification saved, but no enabled phone subscription matched a configured provider.',
    });
  }

  return NextResponse.json({
    success: sent > 0,
    notification_id: notification.id,
    sent,
    attempted,
    delivery_state: deliveryState,
    web_sent: webSent,
    native_sent: nativeSent,
    native_configured: firebaseConfig.configured,
    web_configured: webConfig.configured,
    enabled_web_subscriptions: enabledWebSubscriptions,
    enabled_native_devices: enabledNativeDevices,
    delivery_audit_saved: !auditError,
    web_results: webResults,
    native_results: nativeResults,
  }, { status: sent > 0 ? 200 : 502 });
}

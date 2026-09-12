import { NextResponse } from 'next/server';
import { sendWebPush, getWebPushConfigStatus, StoredPushSubscription } from '@/lib/server/webPush';
import { getFirebaseMessagingConfigStatus, sendFirebasePush } from '@/lib/server/firebaseMessaging';
import { getServiceClient, getUserFromRequest, jsonError } from '../_utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isInvalidFirebaseToken(result: { status?: number; error?: string }) {
  return result.status === 404 || /UNREGISTERED|registration-token-not-registered|not a valid FCM registration token/i.test(result.error || '');
}

function summarizePushResult(result: any) {
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

  const supabase = getServiceClient();
  const createdAt = new Date().toISOString();
  const title = 'CentralHub phone notifications are working';
  const message = 'This test reached your CentralHub device.';
  const { data: notification, error: notificationError } = await supabase
    .from('system_notifications')
    .insert({
      user_id: user.id,
      title,
      message,
      severity: 'info',
      category: 'phone_push_test',
      action_url: '/dashboard',
      is_read: false,
      metadata: {
        source: 'centralhub-push-test',
        created_at: createdAt,
        delivery_state: 'attempting',
        tap_target: '/dashboard',
      },
    })
    .select('id, title, message, action_url, severity, category')
    .single();

  if (notificationError) return jsonError(notificationError.message, 500);

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

  const webResults: any[] = [];
  if (webConfig.configured) {
    for (const subscription of (subscriptions || []) as StoredPushSubscription[]) {
      const result = await sendWebPush(subscription, {
        title: notification.title,
        body: notification.message,
        url: notification.action_url || '/dashboard',
        notificationId: notification.id,
        tag: 'centralhub-test-' + notification.id,
        renotify: true,
      }, { ttl: 300, urgency: 'high' });

      webResults.push({ id: subscription.id, ...result });

      if (result.status === 404 || result.status === 410) {
        await supabase
          .from('push_subscriptions')
          .update({ is_enabled: false })
          .eq('id', subscription.id);
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
        storeId: null,
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
  const attempted = (webConfig.configured ? webResults.length : 0) + (firebaseConfig.configured ? nativeResults.length : 0);
  const completedAt = new Date().toISOString();

  // Persist the provider acknowledgement so a push test can be verified later
  // from Supabase instead of relying only on the transient browser response.
  const { error: auditError } = await supabase
    .from('system_notifications')
    .update({
      metadata: {
        source: 'centralhub-push-test',
        created_at: createdAt,
        completed_at: completedAt,
        delivery_state: sent > 0 ? 'accepted' : 'failed',
        provider_accepted: sent > 0,
        attempted,
        sent,
        web_configured: webConfig.configured,
        native_configured: firebaseConfig.configured,
        web_attempted: webResults.length,
        web_sent: webSent,
        native_attempted: nativeResults.length,
        native_sent: nativeSent,
        tap_target: '/dashboard',
        web_results: webResults.map(summarizePushResult),
        native_results: nativeResults.map(summarizePushResult),
      },
    })
    .eq('id', notification.id);

  return NextResponse.json({
    success: sent > 0,
    notification_id: notification.id,
    sent,
    attempted,
    web_sent: webSent,
    native_sent: nativeSent,
    native_configured: firebaseConfig.configured,
    web_configured: webConfig.configured,
    enabled_native_devices: nativeDevices?.length || 0,
    enabled_web_subscriptions: subscriptions?.length || 0,
    delivery_audit_saved: !auditError,
    web_results: webResults,
    native_results: nativeResults,
    error: sent > 0 ? undefined : 'No configured push provider accepted the test.',
  }, { status: sent > 0 ? 200 : 502 });
}

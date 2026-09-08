import { NextResponse } from 'next/server';
import { sendWebPush, getWebPushConfigStatus, StoredPushSubscription } from '@/lib/server/webPush';
import { getFirebaseMessagingConfigStatus, sendFirebasePush } from '@/lib/server/firebaseMessaging';
import { getServiceClient, getUserFromRequest, jsonError } from '../_utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isInvalidFirebaseToken(result: { status?: number; error?: string }) {
  return result.status === 404 || /UNREGISTERED|registration-token-not-registered|not a valid FCM registration token/i.test(result.error || '');
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
      action_url: '/settings/notifications',
      is_read: false,
      metadata: {
        source: 'centralhub-push-test',
        created_at: createdAt,
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
  for (const subscription of (subscriptions || []) as StoredPushSubscription[]) {
    const result = await sendWebPush(subscription, {
      title: notification.title,
      body: notification.message,
      url: notification.action_url || '/settings/notifications',
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

  const nativeResults: any[] = [];
  if (getFirebaseMessagingConfigStatus().configured) {
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

  const sent = webResults.filter((result) => result.ok).length
    + nativeResults.filter((result) => result.ok).length;
  const attempted = webResults.length + nativeResults.length;

  return NextResponse.json({
    success: sent > 0,
    notification_id: notification.id,
    sent,
    attempted,
    web_sent: webResults.filter((result) => result.ok).length,
    native_sent: nativeResults.filter((result) => result.ok).length,
    native_configured: getFirebaseMessagingConfigStatus().configured,
    web_results: webResults,
    native_results: nativeResults,
    error: sent > 0 ? undefined : 'No configured push provider accepted the test.',
  }, { status: sent > 0 ? 200 : 502 });
}

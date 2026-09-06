import { NextResponse } from 'next/server';
import { sendWebPush, getWebPushConfigStatus, StoredPushSubscription } from '@/lib/server/webPush';
import { getServiceClient, getUserFromRequest, jsonError } from '../_utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
  const message = 'This test reached your installed CentralHub web app on this device.';

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
        source: 'centralhub-pwa-push-test',
        created_at: createdAt,
      },
    })
    .select('id, title, message, action_url')
    .single();

  if (notificationError) return jsonError(notificationError.message, 500);

  const { data: subscriptions, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', user.id)
    .eq('is_enabled', true);

  if (subscriptionError) return jsonError(subscriptionError.message, 500);

  if (!subscriptions?.length) {
    return jsonError('No enabled phone notification subscription found for this user.', 404);
  }

  const results = [];
  for (const subscription of subscriptions as StoredPushSubscription[]) {
    const result = await sendWebPush(subscription, {
      title: notification.title,
      body: notification.message,
      url: notification.action_url || '/settings/notifications',
      notificationId: notification.id,
      tag: `centralhub-test-${notification.id}`,
      renotify: true,
    }, { ttl: 300, urgency: 'high' });

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
    error: sent > 0 ? undefined : 'Push provider rejected all registered subscriptions.',
  }, { status: sent > 0 ? 200 : 502 });
}

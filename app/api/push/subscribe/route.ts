import { NextResponse } from 'next/server';
import { getServiceClient, getUserFromRequest, jsonError } from '../_utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function normalizeSubscription(body: any) {
  const subscription = body?.subscription || body;
  const endpoint = String(subscription?.endpoint || '').trim();
  const p256dh = String(subscription?.keys?.p256dh || '').trim();
  const auth = String(subscription?.keys?.auth || '').trim();

  if (!endpoint || !p256dh || !auth) {
    throw new Error('Invalid push subscription payload.');
  }

  return { endpoint, p256dh, auth };
}

export async function GET(req: Request) {
  if (process.env.NEXT_OUTPUT?.trim() === 'export') {
    return new Response('Not available in static export', { status: 404 });
  }

  const { user, error } = await getUserFromRequest(req);
  if (error || !user) return jsonError(error || 'Unauthorized', 401);

  const supabase = getServiceClient();
  const { data, count, error: dbError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, is_enabled, last_seen_at, platform', { count: 'exact' })
    .eq('user_id', user.id)
    .eq('is_enabled', true)
    .order('last_seen_at', { ascending: false });

  if (dbError) return jsonError(dbError.message, 500);

  return NextResponse.json({
    success: true,
    count: count ?? data?.length ?? 0,
    subscriptions: (data || []).map((item: any) => ({
      id: item.id,
      endpoint: item.endpoint,
      is_enabled: item.is_enabled,
      last_seen_at: item.last_seen_at,
      platform: item.platform,
    })),
  });
}

export async function POST(req: Request) {
  if (process.env.NEXT_OUTPUT?.trim() === 'export') {
    return new Response('Not available in static export', { status: 404 });
  }

  const { user, error } = await getUserFromRequest(req);
  if (error || !user) return jsonError(error || 'Unauthorized', 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body.');
  }

  let subscription;
  try {
    subscription = normalizeSubscription(body);
  } catch (err: any) {
    return jsonError(err.message);
  }

  const now = new Date().toISOString();
  const supabase = getServiceClient();
  const { data, error: dbError } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      user_agent: body?.userAgent || req.headers.get('user-agent') || null,
      platform: body?.platform || 'centralhub-pwa',
      is_enabled: true,
      last_seen_at: now,
      updated_at: now,
    }, { onConflict: 'endpoint' })
    .select('id')
    .single();

  if (dbError) return jsonError(dbError.message, 500);

  return NextResponse.json({ success: true, id: data?.id });
}

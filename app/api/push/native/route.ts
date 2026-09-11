import { NextResponse } from 'next/server';
import { getServiceClient, getUserFromRequest, jsonError } from '../_utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const APP_ID = 'com.centralhub.network';

function normalizeVersionCode(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.trunc(parsed);
}

export async function GET(req: Request) {
  if (process.env.NEXT_OUTPUT?.trim() === 'export') {
    return new Response('Not available in static export', { status: 404 });
  }

  const { user, error } = await getUserFromRequest(req);
  if (error || !user) return jsonError(error || 'Unauthorized', 401);

  const { data, count, error: dbError } = await getServiceClient()
    .from('native_push_devices')
    .select('id, platform, app_id, device_name, is_enabled, last_seen_at, app_version_name, app_version_code, app_version_reported_at', { count: 'exact' })
    .eq('user_id', user.id)
    .eq('is_enabled', true)
    .order('last_seen_at', { ascending: false });

  if (dbError) return jsonError(dbError.message, 500);

  return NextResponse.json({
    success: true,
    count: count ?? data?.length ?? 0,
    devices: data || [],
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

  const token = String(body?.token || '').trim();
  if (token.length < 20 || token.length > 4096) {
    return jsonError('A valid Firebase device token is required.');
  }

  const now = new Date().toISOString();
  const versionName = String(body?.appVersionName ?? body?.app_version_name ?? '').trim().slice(0, 64) || null;
  const versionCode = normalizeVersionCode(body?.appVersionCode ?? body?.app_version_code);
  const supabase = getServiceClient();
  const { data, error: dbError } = await supabase
    .from('native_push_devices')
    .upsert({
      user_id: user.id,
      token,
      platform: String(body?.platform || 'android').trim().slice(0, 32),
      app_id: APP_ID,
      device_name: String(body?.deviceName || body?.device_name || '').trim().slice(0, 160) || null,
      app_version_name: versionName,
      app_version_code: versionCode,
      app_version_reported_at: versionName || versionCode !== null ? now : null,
      is_enabled: true,
      last_seen_at: now,
      updated_at: now,
    }, { onConflict: 'token' })
    .select('id, app_version_name, app_version_code, app_version_reported_at')
    .single();

  if (dbError) return jsonError(dbError.message, 500);

  return NextResponse.json({
    success: true,
    id: data?.id,
    platform: 'android',
    appVersionName: data?.app_version_name || null,
    appVersionCode: data?.app_version_code ?? null,
    appVersionReportedAt: data?.app_version_reported_at || null,
  });
}

export async function DELETE(req: Request) {
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

  const token = String(body?.token || '').trim();
  if (!token) return jsonError('A device token is required.');

  const { error: dbError } = await getServiceClient()
    .from('native_push_devices')
    .update({ is_enabled: false, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('token', token);

  if (dbError) return jsonError(dbError.message, 500);
  return NextResponse.json({ success: true });
}

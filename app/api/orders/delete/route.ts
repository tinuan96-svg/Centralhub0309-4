import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireVerifiedSuperAdmin } from '@/lib/access-control/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const storeEnvironment: Record<string, [string, string]> = {
  malluspices: ['MALLUSPICES_SUPABASE_URL', 'MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY'],
  pocketgrocery: ['POCKET_SUPABASE_URL', 'POCKET_SUPABASE_SERVICE_ROLE_KEY'],
  keralagrocery: ['SOURCE3_SUPABASE_URL', 'SOURCE3_SUPABASE_SERVICE_ROLE_KEY'],
  keralagroceries: ['SOURCE3_SUPABASE_URL', 'SOURCE3_SUPABASE_SERVICE_ROLE_KEY'],
};
const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

export async function POST(req: Request) {
  if (process.env.NEXT_OUTPUT?.trim() === 'export') return fail('Unavailable', 404);
  const bearer = req.headers.get('authorization');
  if (!bearer?.startsWith('Bearer ')) return fail('Authentication required', 401);
  const centralUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!centralUrl || !serviceKey) return fail('Service unavailable', 503);

  // Remote deletion is destructive and cannot be rolled back if the following
  // CentralHub delete fails. It remains Super Admin only until a coordinated,
  // audited multi-store deletion workflow has been designed and tested.
  try { await requireVerifiedSuperAdmin(req); }
  catch { return fail('Verified Super Admin access required',403); }
  const centralAdmin = createClient(centralUrl, serviceKey,
    { auth: { autoRefreshToken:false,persistSession:false } });
  let payload: { orderId?: unknown; storeSlug?: unknown };
  try { payload = await req.json(); } catch { return fail('Invalid JSON', 400); }
  const orderId = typeof payload.orderId === 'string' ? payload.orderId : '';
  const storeSlug = typeof payload.storeSlug === 'string' ? payload.storeSlug.toLowerCase() : '';
  if (!uuid.test(orderId) || !storeEnvironment[storeSlug]) return fail('Invalid order or store', 400);

  // Make sure this order really belongs to the claimed store before using
  // privileged remote credentials; never trust a storeSlug provided by UI alone.
  const { data: order, error: orderError } = await centralAdmin.from('orders')
    .select('id,store_id').eq('id', orderId).maybeSingle();
  const { data: store, error: storeError } = await centralAdmin.from('stores')
    .select('id,slug').eq('slug',storeSlug).maybeSingle();
  if (orderError || storeError) return fail('Could not verify store ownership', 503);
  // Existing client deletes the central row first, so missing rows need the
  // remote lookup by ID: however there is no trustworthy store binding then.
  // Fail closed instead of allowing deletion of an arbitrary remote order.
  if (!order || !store || order.store_id !== store.id) return fail('Order/store verification failed', 409);
  const [urlKey, tokenKey] = storeEnvironment[storeSlug];
  const remoteUrl = process.env[urlKey] || (storeSlug.startsWith('kerala') ? process.env.KERALA_SUPABASE_URL : undefined);
  const remoteKey = process.env[tokenKey] || (storeSlug.startsWith('kerala') ? process.env.KERALA_SUPABASE_SERVICE_ROLE_KEY : undefined);
  if (!remoteUrl || !remoteKey) return fail('Remote store not configured', 503);
  const remote = createClient(remoteUrl, remoteKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: remoteError } = await remote.from('orders').delete().eq('id', orderId);
  if (remoteError) return fail('Remote delete failed', 502);
  return NextResponse.json({ success: true });
}

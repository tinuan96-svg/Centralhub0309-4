import { NextResponse } from 'next/server';
import { getServiceClient, jsonError } from '../../push/_utils';
import { requireVerifiedSuperAdmin } from '@/lib/access-control/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STORE_SLUGS = ['malluspices', 'pocketgrocery', 'keralagrocery', 'tamilretail'];

export async function GET(req: Request) {
  if (process.env.NEXT_OUTPUT?.trim() === 'export') {
    return new Response('Not available in static export', { status: 404 });
  }

  try {
    await requireVerifiedSuperAdmin(req);
  } catch {
    return jsonError('Verified Super Admin access required', 403);
  }

  try {
    const supabase = getServiceClient();
    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('id, slug')
      .in('slug', STORE_SLUGS);

    if (storesError) return jsonError(storesError.message, 500);

    const entries = await Promise.all((stores || []).map(async (store) => {
      const { data, error } = await supabase
        .from('orders')
        .select('last_synced_at')
        .eq('store_id', store.id)
        .not('last_synced_at', 'is', null)
        .order('last_synced_at', { ascending: false })
        .limit(1);

      if (error) {
        return [store.slug, { last_synced_at: null, error: error.message }] as const;
      }

      return [store.slug, { last_synced_at: data?.[0]?.last_synced_at || null }] as const;
    }));

    const status = Object.fromEntries(entries);
    for (const slug of STORE_SLUGS) {
      if (!status[slug]) status[slug] = { last_synced_at: null };
    }

    return NextResponse.json({
      success: true,
      checked_at: new Date().toISOString(),
      stores: status,
    });
  } catch (error: any) {
    return jsonError(error?.message || 'Could not read order sync status.', 500);
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin, forbiddenResponse, unauthorizedResponse } from "@/lib/utils/auth-helpers";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getCentralHubClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
  );
}

export async function POST(req: Request) {
  if (process.env.NEXT_OUTPUT?.trim() === 'export') {
    return new Response('Not available in static export', { status: 404 });
  }

  try {
    // SECURITY: Enforce Admin access
    await requireAdmin();
  } catch (err: any) {
    if (err.message === 'Unauthorized') return unauthorizedResponse();
    return forbiddenResponse(err.message);
  }

  try {
    const { orderId, status, notes } = await req.json();
    const centralHub = getCentralHubClient();

    // 1. Get the order and store info
    const { data: order, error: orderError } = await centralHub
      .from('orders')
      .select('id, store_id, order_number')
      .eq('id', orderId)
      .single();

    if (orderError || !order) throw new Error("Order not found");

    const { data: store, error: storeError } = await centralHub
      .from('stores')
      .select('slug')
      .eq('id', order.store_id)
      .single();

    if (storeError || !store) throw new Error("Store not found for this order");

    // 2. Identify the remote store credentials
    let remoteUrl: string | undefined;
    let remoteKey: string | undefined;

    if (store.slug === 'malluspices') {
      remoteUrl = process.env.MALLUSPICES_SUPABASE_URL;
      remoteKey = process.env.MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY;
    } else if (store.slug === 'pocketgrocery') {
      remoteUrl = process.env.POCKET_SUPABASE_URL;
      remoteKey = process.env.POCKET_SUPABASE_SERVICE_ROLE_KEY;
    } else if (store.slug === 'keralagrocery' || store.slug === 'keralagroceries') {
      remoteUrl = process.env.SOURCE3_SUPABASE_URL || process.env.KERALA_SUPABASE_URL;
      remoteKey = process.env.SOURCE3_SUPABASE_SERVICE_ROLE_KEY || process.env.KERALA_SUPABASE_SERVICE_ROLE_KEY;
    }

    // 3. Push to remote if credentials exist
    if (remoteUrl && remoteKey) {
      console.log(`Pushing status update (${status}) to remote store: ${store.slug}`);
      const remoteSupabase = createClient(remoteUrl, remoteKey);

      // Standardize status field names for different store versions
      const updatePayload: any = {
          updated_at: new Date().toISOString()
      };
      updatePayload.order_status = status;
      updatePayload.status = status; // Fallback for some store versions

      // Update order status in the remote store
      const { error: remoteError } = await remoteSupabase
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId); // Assuming IDs are synced

      if (remoteError) {
        console.error(`Failed to update remote order: ${remoteError.message}`);
        // We don't necessarily want to fail the local update if the remote one fails,
        // but we should probably log it.
      }
    }

    return NextResponse.json({ success: true, message: "Status sync initiated" });
  } catch (err: any) {
    console.error("Order status sync error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

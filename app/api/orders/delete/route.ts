import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (process.env.NEXT_OUTPUT?.trim() === 'export') {
    return new Response('Not available in static export', { status: 404 });
  }
  try {
    const { orderId, storeSlug } = await req.json();

    // 1. Identify the remote store credentials
    let remoteUrl: string | undefined;
    let remoteKey: string | undefined;

    if (storeSlug === 'malluspices') {
      remoteUrl = process.env.MALLUSPICES_SUPABASE_URL;
      remoteKey = process.env.MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY;
    } else if (storeSlug === 'pocketgrocery') {
      remoteUrl = process.env.POCKET_SUPABASE_URL;
      remoteKey = process.env.POCKET_SUPABASE_SERVICE_ROLE_KEY;
    } else if (storeSlug === 'keralagrocery' || storeSlug === 'keralagroceries') {
      remoteUrl = process.env.SOURCE3_SUPABASE_URL || process.env.KERALA_SUPABASE_URL;
      remoteKey = process.env.SOURCE3_SUPABASE_SERVICE_ROLE_KEY || process.env.KERALA_SUPABASE_SERVICE_ROLE_KEY;
    }

    // 2. Push to remote if credentials exist
    if (remoteUrl && remoteKey) {
      console.log(`Pushing order delete (${orderId}) to remote store: ${storeSlug}`);
      const remoteSupabase = createClient(remoteUrl, remoteKey);

      const { error: remoteError } = await remoteSupabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (remoteError) {
        console.error(`Failed to delete remote order: ${remoteError.message}`);
      }
    }

    return NextResponse.json({ success: true, message: "Delete sync completed" });
  } catch (err: any) {
    console.error("Order delete sync error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

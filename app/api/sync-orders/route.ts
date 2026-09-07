import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


function getSyncHeaders() {
  const secret = process.env.CENTRALHUB_PUSH_API_SECRET?.trim();
  if (!secret) return null;
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

export async function GET(req: Request) {
  if (process.env.NEXT_OUTPUT?.trim() === 'export') {
    return new Response('Not available in static export', { status: 404 });
  }
  try {
    const syncHeaders = getSyncHeaders();
    if (!syncHeaders) {
      return NextResponse.json({ success: false, error: "Sync authorization is not configured." }, { status: 503 });
    }
    const url = new URL(req.url);
    const orderId = url.searchParams.get('orderId');
    const storeSlug = url.searchParams.get('storeSlug');

    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-orders`;
    const queryString = new URLSearchParams();
    if (orderId) queryString.set('orderId', orderId);
    if (storeSlug) queryString.set('storeSlug', storeSlug);

    const response = await fetch(`${functionUrl}?${queryString.toString()}`, {
      headers: syncHeaders,

    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err: any) {
    console.error('Sync route proxy error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Unknown error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (process.env.NEXT_OUTPUT?.trim() === 'export') {
    return new Response('Not available in static export', { status: 404 });
  }
  try {
    const syncHeaders = getSyncHeaders();
    if (!syncHeaders) {
      return NextResponse.json({ success: false, error: "Sync authorization is not configured." }, { status: 503 });
    }
    const body = await req.json();
    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-orders`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: syncHeaders,

      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err: any) {
    console.error('Sync route POST proxy error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Unknown error' }, { status: 500 });
  }
}

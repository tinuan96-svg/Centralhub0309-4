import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getSyncHeaders() {
  const secret = process.env.CENTRALHUB_PUSH_API_SECRET?.trim() || process.env.CENTRALHUB_WEBHOOK_SECRET?.trim();
  if (!secret) return null;
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

function shouldUseCanonicalSync(input: Record<string, unknown>) {
  const mode = String(input.mode || '').trim().toLowerCase();
  return Boolean(
    input.orderId ||
    input.legacyRepair === true ||
    input.legacyRepairAll === true ||
    mode.startsWith('legacy_')
  );
}

function functionUrl(slug: 'sync-orders' | 'sync-orders-browser') {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (!baseUrl) throw new Error('Supabase URL is not configured.');
  return `${baseUrl}/functions/v1/${slug}`;
}

async function proxySyncResponse(response: Response) {
  const raw = await response.text();
  let data: Record<string, unknown> | null = null;

  try {
    data = raw ? JSON.parse(raw) as Record<string, unknown> : null;
  } catch {
    data = null;
  }

  if (!data) {
    const preview = raw.replace(/\s+/g, ' ').trim().slice(0, 240);
    return NextResponse.json({
      success: false,
      error: `Order sync worker returned an unreadable response (HTTP ${response.status})${preview ? `: ${preview}` : '.'}`,
    }, { status: response.ok ? 502 : response.status });
  }

  return NextResponse.json(data, { status: response.status });
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
    const input: Record<string, unknown> = {
      orderId: url.searchParams.get('orderId') || undefined,
      storeSlug: url.searchParams.get('storeSlug') || undefined,
      mode: url.searchParams.get('mode') || undefined,
      legacyRepair: url.searchParams.get('legacyRepair') === 'true',
      legacyRepairAll: url.searchParams.get('legacyRepairAll') === 'true',
    };
    const worker = shouldUseCanonicalSync(input) ? 'sync-orders' : 'sync-orders-browser';
    const queryString = new URLSearchParams();
    if (input.orderId) queryString.set('orderId', String(input.orderId));
    if (input.storeSlug) queryString.set('storeSlug', String(input.storeSlug));
    if (input.mode) queryString.set('mode', String(input.mode));
    if (input.legacyRepair) queryString.set('legacyRepair', 'true');
    if (input.legacyRepairAll) queryString.set('legacyRepairAll', 'true');

    const response = await fetch(`${functionUrl(worker)}?${queryString.toString()}`, {
      headers: syncHeaders,
      cache: 'no-store',
    });

    return await proxySyncResponse(response);
  } catch (err: any) {
    console.error('Sync route proxy error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Unknown error' }, { status: 500 });
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

    const body = await req.json().catch(() => ({}));
    const worker = shouldUseCanonicalSync(body) ? 'sync-orders' : 'sync-orders-browser';
    const response = await fetch(functionUrl(worker), {
      method: 'POST',
      headers: syncHeaders,
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    return await proxySyncResponse(response);
  } catch (err: any) {
    console.error('Sync route POST proxy error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}

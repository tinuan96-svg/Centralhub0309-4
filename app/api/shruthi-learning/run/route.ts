import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) return NextResponse.json({ success: false, error: 'missing_auth' }, { status: 401 });

    const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
    if (!supabaseUrl) return NextResponse.json({ success: false, error: 'server_not_configured' }, { status: 500 });

    const body = await request.json().catch(() => ({}));
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/shruthi-continuous-learning`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ force: true, ...(typeof body?.track === 'string' ? { track: body.track } : {}) }),
    });
    const payload = await response.json().catch(() => ({ success: false, error: `Learning worker returned HTTP ${response.status}` }));
    return NextResponse.json(payload, { status: response.ok ? 200 : response.status });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Learning trigger failed.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runShruthiLearning } from '@/lib/server/shruthiLearning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serverClient() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  if (!url || !key) throw new Error('Server database configuration is missing.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) return NextResponse.json({ success: false, error: 'missing_auth' }, { status: 401 });

    const db = serverClient();
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return NextResponse.json({ success: false, error: 'invalid_auth' }, { status: 401 });
    if (String(data.user.app_metadata?.role || '').toLowerCase() !== 'admin') {
      return NextResponse.json({ success: false, error: 'admin_required' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const track = typeof body?.track === 'string' ? body.track : undefined;
    const result = await runShruthiLearning(db, { source: 'manual', force: true, track });
    return NextResponse.json(result, { status: result.success ? 200 : 207 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Learning trigger failed.' }, { status: 500 });
  }
}

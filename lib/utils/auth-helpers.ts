import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function getAuthenticatedUser() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function requireAdmin() {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Check role in user metadata or custom table
  const role = user.user_metadata?.role || user.app_metadata?.role;
  const isAdmin = role === 'admin' || role === 'superadmin';

  if (!isAdmin) {
    // Double check via DB function if needed
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: is_admin } = await supabaseAdmin.rpc('is_admin', { user_id: user.id });
    if (!is_admin) {
        throw new Error('Forbidden: Admin access required');
    }
  }

  return user;
}

export function unauthorizedResponse() {
  return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
}

export function forbiddenResponse(message = 'Forbidden') {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

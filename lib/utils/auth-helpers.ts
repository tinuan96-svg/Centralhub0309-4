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

  // Authorization must only use trusted app_metadata or server-side profile data.
  const role = String(user.app_metadata?.role || '').toLowerCase();
  let isAdmin = role === 'admin' || role === 'superadmin' || role === 'administrator';

  if (!isAdmin) {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('profile_role,is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      throw new Error('Forbidden: Admin access required');
    }

    isAdmin = profile?.is_active !== false && ['admin', 'superadmin', 'administrator'].includes(String(profile?.profile_role || '').toLowerCase());
    if (!isAdmin) {
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

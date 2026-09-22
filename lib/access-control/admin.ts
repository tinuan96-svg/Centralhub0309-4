import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type VerifiedAdmin = { admin: SupabaseClient; actorId: string };
export class AccessDenied extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

/** Only a verified, active legacy Super Admin can operate the staff directory.
 * Do not accept user_metadata, client-selected roles, or a decoded JWT claim. */
export async function requireVerifiedSuperAdmin(request: Request): Promise<VerifiedAdmin> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new AccessDenied('Sign in required', 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const privateKey = process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !privateKey) throw new AccessDenied('Authentication is not configured', 503);
  const client = createClient(url, publicKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error } = await client.auth.getUser(authorization.slice(7));
  if (error || !user) throw new AccessDenied('Session expired', 401);
  const admin = createClient(url, privateKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: identity, error: identityError } = await admin.auth.admin.getUserById(user.id);
  if (identityError || identity.user?.app_metadata?.role !== 'admin') {
    throw new AccessDenied('Super Admin access required', 403);
  }
  const { data: profile, error: profileError } = await admin.from('user_profiles')
    .select('is_active,profile_role').eq('id',user.id).maybeSingle();
  if (profileError || !profile?.is_active || profile.profile_role !== 'admin') {
    throw new AccessDenied('Super Admin access required', 403);
  }
  return { admin, actorId: user.id };
}

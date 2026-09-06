import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dhl-gmail-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export const env = (name: string) => String(Deno.env.get(name) || '').trim();

export const adminDb = () => createClient(
  env('SUPABASE_URL'),
  env('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export function secureEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function requireAdmin(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (secureEqual(token, env('SUPABASE_SERVICE_ROLE_KEY'))) return;
  if (!token) throw new Error('Authorization required');
  const db = adminDb();
  const { data: auth, error } = await db.auth.getUser(token);
  if (error || !auth.user) throw new Error('Invalid session');
  const { data: profile } = await db.from('user_profiles')
    .select('profile_role,is_active').eq('id', auth.user.id).maybeSingle();
  if (profile?.profile_role !== 'admin' || profile?.is_active === false) throw new Error('Admin access required');
}

export function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const bytes = Uint8Array.from(atob(normalized), c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function configStatus() {
  return {
    gmailOAuthConfigured: !!(env('DHL_GMAIL_CLIENT_ID') && env('DHL_GMAIL_CLIENT_SECRET') && env('DHL_GMAIL_REFRESH_TOKEN')),
    gmailMailboxConfigured: !!env('DHL_GMAIL_MAILBOX'),
    pubSubTopicConfigured: !!env('DHL_GMAIL_PUBSUB_TOPIC'),
    webhookSecretConfigured: !!env('DHL_GMAIL_WEBHOOK_SECRET'),
    expectedSender: env('DHL_GMAIL_SENDER') || 'noreply@documents.dhlparcel.co.uk',
  };
}
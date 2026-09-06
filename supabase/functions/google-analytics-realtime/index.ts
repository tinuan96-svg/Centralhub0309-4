import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const secret = (name: string) => { const value = Deno.env.get(name)?.trim(); if (!value) throw new Error(`Missing Edge Function secret: ${name}`); return value }
const unb64 = (value: string) => { const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4); return Uint8Array.from(atob(padded), c => c.charCodeAt(0)) }
async function key() { const raw = unb64(secret('MARKETING_TOKEN_ENCRYPTION_KEY')); if (raw.length !== 32) throw new Error('MARKETING_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes'); return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']) }
async function decrypt(value: string) { if (!value.startsWith('enc:v1:')) throw new Error('Stored Google credential is not encrypted with the current format'); const raw = unb64(value.slice(7)); const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await key(), raw.slice(12)); return new TextDecoder().decode(plaintext) }
async function requireAdmin(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim(); if (!token) throw new Error('Authorization required')
  const db = admin(); const { data: auth, error } = await db.auth.getUser(token); if (error || !auth.user) throw new Error('Invalid session')
  const { data: profile } = await db.from('user_profiles').select('profile_role,is_active').eq('id', auth.user.id).maybeSingle(); if (profile?.profile_role !== 'admin' || profile?.is_active === false) throw new Error('Admin access required')
  return db
}
async function googleFetch(url: string, access: string, init: RequestInit = {}) { const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${access}`); headers.set('Content-Type', 'application/json'); const response = await fetch(url, { ...init, headers }); const text = await response.text(); let data: any = {}; try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }; if (!response.ok) throw new Error(data?.error?.message || data?.error_description || `Google API ${response.status}`); return data }
async function getAccess(db: any, storeId: string) {
  const { data: connection, error } = await db.from('marketing_connections').select('*').eq('store_id', storeId).eq('provider_id', 'google').maybeSingle(); if (error) throw error; if (!connection?.access_token) throw new Error('Google connection is not configured for this store')
  const { data: config, error: configError } = await db.from('marketing_provider_configs').select('*').eq('store_id', storeId).eq('provider_id', 'google').maybeSingle(); if (configError) throw configError; if (!config) throw new Error('Google provider configuration is missing for this store')
  let access = await decrypt(connection.access_token); const expires = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0
  if (expires && expires <= Date.now() + 60000 && connection.refresh_token) {
    const body = new URLSearchParams({ client_id: config.client_id, client_secret: await decrypt(config.encrypted_client_secret), refresh_token: await decrypt(connection.refresh_token), grant_type: 'refresh_token' })
    const refreshed = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }); const data = await refreshed.json().catch(() => ({})); if (!refreshed.ok || !data.access_token) throw new Error(data?.error_description || 'Google access token refresh failed'); access = String(data.access_token)
  }
  return access
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const db = await requireAdmin(req); const body = await req.json().catch(() => ({})); const storeId = String(body?.storeId || '').trim(); if (!storeId) throw new Error('storeId is required')
    const { data: config, error } = await db.from('analytics_store_configs').select('ga4_property_id').eq('store_id', storeId).maybeSingle(); if (error) throw error; const propertyId = String(config?.ga4_property_id || ''); if (!/^\d+$/.test(propertyId)) throw new Error('No valid GA4 property is selected for this store')
    const access = await getAccess(db, storeId)
    const report = await googleFetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`, access, { method: 'POST', body: JSON.stringify({ dimensions: [{ name: 'eventName' }], metrics: [{ name: 'activeUsers' }, { name: 'eventCount' }, { name: 'screenPageViews' }], returnPropertyQuota: true }) })
    return json({ success: true, storeId, propertyId, rows: report.rows || [], rowCount: Number(report.rowCount || 0), propertyQuota: report.propertyQuota || null, metadata: report.metadata || null, sampled: Boolean(report.metadata?.samplingMetadatas?.length) })
  } catch (error: any) { return json({ success: false, error: error?.message || 'GA4 realtime report failed' }, /Admin|Authorization|Invalid session/.test(error?.message || '') ? 401 : 400) }
})

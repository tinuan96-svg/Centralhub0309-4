import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const secret = (name: string) => {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`)
  return value
}
const b64 = (bytes: Uint8Array) => {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
const unb64 = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  return Uint8Array.from(atob(normalized), c => c.charCodeAt(0))
}
const sha256 = async (value: string) => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))

async function requireAdmin(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new Error('Authorization required')
  const db = admin()
  const { data: auth, error } = await db.auth.getUser(token)
  if (error || !auth.user) throw new Error('Invalid session')
  const { data: profile } = await db.from('user_profiles').select('profile_role,is_active').eq('id', auth.user.id).maybeSingle()
  if (profile?.profile_role !== 'admin' || profile?.is_active === false) throw new Error('Admin access required')
  return { db, user: auth.user }
}

const graph = async (path: string, token: string, fields?: string) => {
  const version = String(Deno.env.get('WHATSAPP_GRAPH_API_VERSION') || 'v26.0').replace(/^v/i, 'v')
  const url = new URL(`https://graph.facebook.com/${version}/${path.replace(/^\//, '')}`)
  if (fields) url.searchParams.set('fields', fields)
  url.searchParams.set('limit', '100')
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const text = await r.text(); let data: any = {}
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
  if (!r.ok) throw new Error(data?.error?.message || `Meta Graph API ${r.status}`)
  return data
}

async function cryptoKey() {
  const raw = unb64(secret('MARKETING_TOKEN_ENCRYPTION_KEY'))
  if (raw.length !== 32) throw new Error('MARKETING_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function encrypt(value: string) {
  const key = await cryptoKey(), iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value)))
  const out = new Uint8Array(iv.length + ciphertext.length); out.set(iv); out.set(ciphertext, iv.length)
  return `enc:v1:${b64(out)}`
}

async function decrypt(value: string) {
  if (!value.startsWith('enc:v1:')) throw new Error('Provider secret is not encrypted with the current format')
  const raw = unb64(value.slice(7)), iv = raw.slice(0, 12), ciphertext = raw.slice(12)
  const key = await cryptoKey()
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(plaintext)
}

async function metaToken(code: string, redirectUri: string, appId: string, appSecret: string) {
  const version = String(Deno.env.get('WHATSAPP_GRAPH_API_VERSION') || 'v26.0').replace(/^v/i, 'v')
  const shortUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`)
  shortUrl.searchParams.set('client_id', appId); shortUrl.searchParams.set('client_secret', appSecret)
  shortUrl.searchParams.set('redirect_uri', redirectUri); shortUrl.searchParams.set('code', code)
  const shortRes = await fetch(shortUrl); const short = await shortRes.json()
  if (!shortRes.ok || !short.access_token) throw new Error(short?.error?.message || 'Meta code exchange failed')

  const longUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`)
  longUrl.searchParams.set('grant_type', 'fb_exchange_token'); longUrl.searchParams.set('client_id', appId)
  longUrl.searchParams.set('client_secret', appSecret); longUrl.searchParams.set('fb_exchange_token', short.access_token)
  const longRes = await fetch(longUrl); const long = await longRes.json()
  if (!longRes.ok || !long.access_token) throw new Error(long?.error?.message || 'Meta long-lived token exchange failed')
  return { token: String(long.access_token), expiresIn: Number(long.expires_in || 0) }
}

async function discover(token: string) {
  const me = await graph('me', token, 'id,name')
  const assets: any[] = []
  const ads = await graph('me/adaccounts', token, 'id,name,account_status,currency,timezone_name')
  for (const a of ads?.data || []) {
    assets.push({ asset_type: 'ad_account', external_id: String(a.id), name: String(a.name || a.id), metadata: a })
    try {
      const pixels = await graph(`${a.id}/adspixels`, token, 'id,name')
      for (const p of pixels?.data || []) assets.push({ asset_type: 'pixel', external_id: String(p.id), name: String(p.name || p.id), metadata: { ...p, ad_account_id: a.id } })
    } catch (e) { console.warn('[marketing-oauth] pixel discovery skipped', e) }
  }
  const pages = await graph('me/accounts', token, 'id,name,category,instagram_business_account{id,username,name}')
  for (const p of pages?.data || []) {
    const { access_token: _pageToken, ...safePage } = p
    assets.push({ asset_type: 'facebook_page', external_id: String(p.id), name: String(p.name || p.id), metadata: safePage })
    const ig = p.instagram_business_account
    if (ig?.id) assets.push({ asset_type: 'instagram_profile', external_id: String(ig.id), name: ig.username ? `@${ig.username}` : String(ig.name || ig.id), metadata: { ...ig, page_id: p.id } })
  }
  try {
    const businesses = await graph('me/businesses', token, 'id,name')
    for (const b of businesses?.data || []) {
      try {
        const catalogs = await graph(`${b.id}/owned_product_catalogs`, token, 'id,name,vertical')
        for (const c of catalogs?.data || []) assets.push({ asset_type: 'catalog', external_id: String(c.id), name: String(c.name || c.id), metadata: { ...c, business_id: b.id } })
      } catch (e) { console.warn('[marketing-oauth] catalog discovery skipped', e) }
    }
  } catch (e) { console.warn('[marketing-oauth] business discovery skipped', e) }
  return { me, assets }
}

async function configure(req: Request) {
  const { db } = await requireAdmin(req)
  const body = await req.json().catch(() => ({}))
  const storeId = String(body?.storeId || '').trim(), providerId = String(body?.providerId || '').trim()
  const clientId = String(body?.clientId || '').trim(), clientSecret = String(body?.clientSecret || '').trim()
  const redirectUri = String(body?.redirectUri || '').trim(), appLabel = String(body?.appLabel || '').trim()
  if (!storeId || !providerId || !clientId || !clientSecret || !redirectUri) return json({ error: 'storeId, providerId, clientId, clientSecret and redirectUri are required' }, 400)
  if (providerId !== 'meta') return json({ error: 'Store-owned configuration is not enabled for this provider yet' }, 400)
  const { data: store } = await db.from('stores').select('id,name,slug,domain').eq('id', storeId).maybeSingle()
  if (!store) return json({ error: 'Store not found' }, 404)
  let parsed: URL
  try { parsed = new URL(redirectUri) } catch { return json({ error: 'redirectUri must be a valid HTTPS URL' }, 400) }
  if (parsed.protocol !== 'https:') return json({ error: 'redirectUri must use HTTPS' }, 400)
  const encryptedSecret = await encrypt(clientSecret)
  const { data, error } = await db.from('marketing_provider_configs').upsert({ store_id: storeId, provider_id: providerId, client_id: clientId, encrypted_client_secret: encryptedSecret, redirect_uri: redirectUri, app_label: appLabel || store.name, status: 'configured', updated_at: new Date().toISOString() }, { onConflict: 'store_id,provider_id' }).select('id,store_id,provider_id,redirect_uri,app_label,status,updated_at').single()
  if (error) throw error
  return json({ success: true, config: data })
}

async function start(req: Request) {
  const { db, user } = await requireAdmin(req)
  const body = await req.json().catch(() => ({}))
  const storeId = String(body?.storeId || '').trim(), providerId = String(body?.providerId || '').trim()
  if (!storeId || !providerId) return json({ error: 'storeId and providerId are required' }, 400)
  if (providerId !== 'meta') return json({ error: 'Live OAuth adapter is not enabled for this provider yet' }, 400)
  const { data: store } = await db.from('stores').select('id,name,slug,domain').eq('id', storeId).maybeSingle()
  if (!store) return json({ error: 'Store not found' }, 404)
  const { data: config } = await db.from('marketing_provider_configs').select('id,client_id,redirect_uri,app_label,status').eq('store_id', storeId).eq('provider_id', providerId).maybeSingle()
  if (!config || config.status !== 'configured') return json({ error: `Configure the ${store.name} store-owned Meta application first. CentralHub does not use a shared Meta application for store connections.` }, 400)
  const state = b64(crypto.getRandomValues(new Uint8Array(32)))
  await db.from('marketing_oauth_states').delete().eq('user_id', user.id).eq('provider_id', providerId)
  const { error } = await db.from('marketing_oauth_states').insert({ state_hash: await sha256(state), user_id: user.id, store_id: storeId, provider_id: providerId, provider_config_id: config.id, redirect_uri: config.redirect_uri, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() })
  if (error) throw error
  const version = String(Deno.env.get('WHATSAPP_GRAPH_API_VERSION') || 'v26.0').replace(/^v/i, 'v')
  const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`)
  url.searchParams.set('client_id', config.client_id); url.searchParams.set('redirect_uri', config.redirect_uri); url.searchParams.set('state', state); url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', ['business_management','ads_read','ads_management','pages_show_list','pages_read_engagement','pages_manage_metadata','instagram_basic','instagram_content_publish','catalog_management'].join(','))
  return json({ success: true, authorization_url: url.toString(), expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), store, provider: providerId })
}

async function callback(req: Request) {
  const u = new URL(req.url), state = u.searchParams.get('state'), code = u.searchParams.get('code'), err = u.searchParams.get('error_description') || u.searchParams.get('error')
  const appUrl = secret('MARKETING_APP_URL').replace(/\/$/, '')
  const finish = (status: string, message?: string, storeId?: string) => { const target = new URL(`${appUrl}/marketing/integrations`); target.searchParams.set('oauth', status); if (storeId) target.searchParams.set('store_id', storeId); if (message) target.searchParams.set('message', message.slice(0, 180)); return new Response(null, { status: 302, headers: { Location: target.toString() } }) }
  if (err) return finish('cancelled', err)
  if (!state || !code) return finish('error', 'Missing OAuth response')
  const db = admin(), { data: record } = await db.from('marketing_oauth_states').select('*').eq('state_hash', await sha256(state)).maybeSingle()
  if (!record || record.consumed_at || new Date(record.expires_at).getTime() < Date.now()) return finish('error', 'OAuth state is invalid or expired')
  const { error: consumeError } = await db.from('marketing_oauth_states').update({ consumed_at: new Date().toISOString() }).eq('id', record.id).is('consumed_at', null)
  if (consumeError) return finish('error', 'Could not consume OAuth state', record.store_id)
  try {
    const { data: config } = await db.from('marketing_provider_configs').select('client_id,encrypted_client_secret,redirect_uri,status').eq('id', record.provider_config_id).eq('store_id', record.store_id).eq('provider_id', record.provider_id).maybeSingle()
    if (!config || config.status !== 'configured') throw new Error('The store-owned provider configuration is missing or disabled')
    if (config.redirect_uri !== record.redirect_uri) throw new Error('OAuth redirect URI changed during authorization')
    const clientSecret = await decrypt(config.encrypted_client_secret)
    const t = await metaToken(code, config.redirect_uri, config.client_id, clientSecret), d = await discover(t.token), encrypted = await encrypt(t.token), now = new Date().toISOString()
    const expiresAt = t.expiresIn > 0 ? new Date(Date.now() + t.expiresIn * 1000).toISOString() : null
    const { data: existing } = await db.from('marketing_connections').select('id').eq('store_id', record.store_id).eq('provider_id', 'meta').maybeSingle()
    const payload = { store_id: record.store_id, provider_id: 'meta', external_account_id: String(d.me?.id || ''), external_account_name: String(d.me?.name || ''), access_token: encrypted, refresh_token: null, token_expires_at: expiresAt, status: 'healthy', health_score: 100, last_sync_at: now, last_error: null, config: { adapter: 'meta_graph', identity_mode: 'store_owned_app', provider_config_id: record.provider_config_id, token_storage: 'aes_gcm_v1', discovered_asset_count: d.assets.length, last_discovery_at: now }, encrypted_credentials: { app_config_id: record.provider_config_id, token_version: 'aes_gcm_v1' }, updated_at: now }
    let connectionId = existing?.id
    if (connectionId) { const { error } = await db.from('marketing_connections').update(payload).eq('id', connectionId); if (error) throw error }
    else { const { data, error } = await db.from('marketing_connections').insert(payload).select('id').single(); if (error) throw error; connectionId = data.id }
    await db.from('marketing_assets').delete().eq('connection_id', connectionId)
    if (d.assets.length) {
      const { error } = await db.from('marketing_assets').insert(d.assets.map(a => ({ ...a, connection_id: connectionId, store_id: record.store_id, is_assigned: false, status: 'active', updated_at: now })))
      if (error) throw error
    }
    await db.from('marketing_sync_jobs').insert({ store_id: record.store_id, connection_id: connectionId, provider_id: 'meta', job_type: 'initial_sync', status: 'completed', progress: 100, started_at: now, completed_at: now, metadata: { discovered_assets: d.assets.length, identity_mode: 'store_owned_app' } })
    return finish('success', `Meta connected for the store and ${d.assets.length} assets discovered`, record.store_id)
  } catch (e: any) { console.error('[marketing-oauth] callback', e?.message || e); return finish('error', e?.message || 'Meta connection failed', record.store_id) }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: cors })
  try {
    const u = new URL(req.url)
    if (req.method === 'GET' && u.searchParams.has('code')) return await callback(req)
    if (req.method === 'POST') {
      const body = await req.clone().json().catch(() => ({}))
      if (body?.action === 'configure') return await configure(req)
      return await start(req)
    }
    return json({ error: 'Use POST to start or configure OAuth' }, 405)
  } catch (e: any) {
    const message = e?.message || 'Marketing OAuth failed'
    return json({ error: message }, /Authorization|session|Admin access/.test(message) ? 401 : 500)
  }
})

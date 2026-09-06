import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const env = (name: string) => {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`)
  return value
}
const b64 = (bytes: Uint8Array) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
const unb64 = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0))
}
const utf8 = (value: string) => new TextEncoder().encode(value)
const b64json = (value: unknown) => b64(utf8(JSON.stringify(value)))
const pemBytes = (pem: string) => unb64(pem.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, ''))

async function cryptoKey() {
  const raw = unb64(env('MARKETING_TOKEN_ENCRYPTION_KEY'))
  if (raw.length !== 32) throw new Error('MARKETING_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
async function encrypt(value: string) {
  const key = await cryptoKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8(value)))
  const out = new Uint8Array(iv.length + ciphertext.length)
  out.set(iv)
  out.set(ciphertext, iv.length)
  return `enc:v1:${b64(out)}`
}
async function decrypt(value: string) {
  if (!value?.startsWith('enc:v1:')) throw new Error('Stored credential is not encrypted with the current format')
  const raw = unb64(value.slice(7))
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await cryptoKey(), raw.slice(12))
  return new TextDecoder().decode(plaintext)
}
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

type Field = { key: string; label?: string; type?: string; required?: boolean; secret?: boolean }
const clean = (value: unknown) => typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
async function providerFor(db: any, providerId: string) {
  const { data, error } = await db.from('marketing_providers').select('id,display_name,connection_mode,adapter_status,credential_schema').eq('id', providerId).eq('is_active', true).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Marketing provider not found or inactive')
  return data
}
async function existingConfig(db: any, storeId: string, providerId: string) {
  const { data, error } = await db.from('marketing_provider_configs').select('*').eq('store_id', storeId).eq('provider_id', providerId).maybeSingle()
  if (error) throw error
  return data
}
function publicResponse(provider: any, config: any) {
  const fields = (provider.credential_schema || []) as Field[]
  const legacy: any = {}
  if (config) {
    if (config.client_id) legacy.client_id = config.client_id
    if (config.redirect_uri) legacy.redirect_uri = config.redirect_uri
    if (config.app_label) legacy.app_label = config.app_label
    if (config.login_customer_id) legacy.login_customer_id = config.login_customer_id
  }
  const stored = fields.filter(f => f.secret).filter(f =>
    Boolean(config?.encrypted_secrets?.[f.key]) ||
    (f.key === 'client_secret' && config?.encrypted_client_secret) ||
    (f.key === 'developer_token' && config?.encrypted_developer_token)
  ).map(f => f.key)
  return {
    id: config?.id || null,
    store_id: config?.store_id || null,
    provider_id: provider.id,
    status: config?.status || 'not_configured',
    public_config: { ...legacy, ...(config?.public_config || {}) },
    stored_secrets: stored,
    last_test_at: config?.last_test_at || null,
    last_test_status: config?.last_test_status || null,
    last_test_error: config?.last_test_error || null,
    created_at: config?.created_at || null,
    updated_at: config?.updated_at || null,
  }
}
async function save(db: any, storeId: string, providerId: string, values: Record<string, unknown>) {
  const provider = await providerFor(db, providerId)
  const fields = (provider.credential_schema || []) as Field[]
  const old = await existingConfig(db, storeId, providerId)
  const publicConfig = { ...(old?.public_config || {}) }
  const encryptedSecrets = { ...(old?.encrypted_secrets || {}) }

  for (const field of fields) {
    const value = clean(values?.[field.key])
    if (field.secret) {
      if (value) encryptedSecrets[field.key] = await encrypt(value)
      else if (field.required && !encryptedSecrets[field.key] && !(field.key === 'client_secret' && old?.encrypted_client_secret) && !(field.key === 'developer_token' && old?.encrypted_developer_token)) throw new Error(`${field.label || field.key} is required`)
    } else {
      if (value) publicConfig[field.key] = value
      else if (field.required && !clean(publicConfig[field.key])) throw new Error(`${field.label || field.key} is required`)
      else if (!field.required && Object.prototype.hasOwnProperty.call(values || {}, field.key)) publicConfig[field.key] = value
    }
  }

  if (publicConfig.redirect_uri && !/^https:\/\//i.test(String(publicConfig.redirect_uri))) throw new Error('Redirect URI must use HTTPS')
  if (providerId === 'google' && publicConfig.login_customer_id) {
    const normalized = String(publicConfig.login_customer_id).replace(/-/g, '')
    if (!/^\d{10}$/.test(normalized)) throw new Error('Google Ads Login Customer ID must contain 10 digits')
    publicConfig.login_customer_id = normalized
  }

  const payload: any = { store_id: storeId, provider_id: providerId, public_config: publicConfig, encrypted_secrets: encryptedSecrets, status: 'configured', updated_at: new Date().toISOString() }
  if (providerId === 'google' || providerId === 'meta') {
    payload.client_id = publicConfig.client_id || old?.client_id || null
    payload.redirect_uri = publicConfig.redirect_uri || old?.redirect_uri || null
    payload.app_label = publicConfig.app_label || old?.app_label || null
    const clientSecret = encryptedSecrets.client_secret || old?.encrypted_client_secret
    if (clientSecret) payload.encrypted_client_secret = clientSecret
    if (providerId === 'google') {
      const developer = encryptedSecrets.developer_token || old?.encrypted_developer_token
      if (developer) payload.encrypted_developer_token = developer
      payload.login_customer_id = publicConfig.login_customer_id || old?.login_customer_id || null
    }
  }
  const { data, error } = await db.from('marketing_provider_configs').upsert(payload, { onConflict: 'store_id,provider_id' }).select('*').single()
  if (error) throw error
  return { provider, config: data }
}

async function googleAccessToken(config: any) {
  const encrypted = config?.encrypted_secrets?.service_account_json
  if (!encrypted) throw new Error('Google service account JSON is not stored')
  let service: any
  try { service = JSON.parse(await decrypt(encrypted)) } catch { throw new Error('Google service account JSON is invalid') }
  if (!service?.client_email || !service?.private_key) throw new Error('Google service account JSON must contain client_email and private_key')
  const now = Math.floor(Date.now() / 1000)
  const header = b64json({ alg: 'RS256', typ: 'JWT' })
  const claim = b64json({ iss: service.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: service.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })
  const signingInput = `${header}.${claim}`
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(service.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, utf8(signingInput)))
  const assertion = `${signingInput}.${b64(signature)}`
  const response = await fetch(service.token_uri || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body?.access_token) throw new Error(body?.error_description || body?.error || `Google OAuth returned ${response.status}`)
  return String(body.access_token)
}

async function appleJwt(config: any) {
  const issuer = clean(config?.public_config?.issuer_id)
  const keyId = clean(config?.public_config?.key_id)
  const encrypted = config?.encrypted_secrets?.private_key
  if (!issuer || !keyId || !encrypted) throw new Error('Apple Issuer ID, Key ID and private key are required')
  const keyPem = await decrypt(encrypted)
  const now = Math.floor(Date.now() / 1000)
  const header = b64json({ alg: 'ES256', kid: keyId, typ: 'JWT' })
  const claim = b64json({ iss: issuer, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })
  const signingInput = `${header}.${claim}`
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(keyPem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(signingInput)))
  if (signature.length !== 64) throw new Error('Apple signing key returned an unexpected signature format')
  return `${signingInput}.${b64(signature)}`
}

async function assertRegisteredApp(db: any, storeId: string, platform: 'android'|'ios', identifier: string) {
  const { data, error } = await db.from('app_marketing_apps').select('id,package_identifier,status,metadata').eq('store_id', storeId).eq('platform', platform).eq('package_identifier', identifier).maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`Configured ${platform === 'android' ? 'package' : 'bundle'} ID is not registered to this store in CentralHub`)
  if (data.metadata?.publishing_enabled === false || data.status === 'needs_native_sync') throw new Error(data.metadata?.blocking_reason || 'Publishing is blocked until this app identity is ready')
  return data
}

async function testGooglePlay(db: any, storeId: string, config: any) {
  const packageName = clean(config?.public_config?.package_name)
  if (!packageName) throw new Error('Android Package Name is required')
  await assertRegisteredApp(db, storeId, 'android', packageName)
  const accessToken = await googleAccessToken(config)
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/edits`
  const create = await fetch(base, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: '{}' })
  const body = await create.json().catch(() => ({}))
  if (!create.ok || !body?.id) throw new Error(body?.error?.message || `Google Play API returned ${create.status}`)
  await fetch(`${base}/${encodeURIComponent(body.id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => undefined)
  return { ok: true, verified: true, status: 'passed', detail: `Google Play publishing access verified for ${packageName}` }
}

async function testAppStoreConnect(db: any, storeId: string, config: any) {
  const appId = clean(config?.public_config?.app_id)
  const bundleId = clean(config?.public_config?.bundle_id)
  if (!appId || !bundleId) throw new Error('App Store Connect App ID and iOS Bundle ID are required')
  await assertRegisteredApp(db, storeId, 'ios', bundleId)
  const token = await appleJwt(config)
  const response = await fetch(`https://api.appstoreconnect.apple.com/v1/apps/${encodeURIComponent(appId)}`, { headers: { Authorization: `Bearer ${token}` } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body?.data) throw new Error(body?.errors?.[0]?.detail || `App Store Connect API returned ${response.status}`)
  const remoteBundle = clean(body?.data?.attributes?.bundleId)
  if (remoteBundle && remoteBundle !== bundleId) throw new Error(`App Store Connect bundle ID ${remoteBundle} does not match CentralHub ${bundleId}`)
  return { ok: true, verified: true, status: 'passed', detail: `App Store Connect publishing access verified for ${bundleId}` }
}

async function testOpenAI(config: any) {
  const encrypted = config?.encrypted_secrets?.api_key
  if (!encrypted) throw new Error('OpenAI API key is not stored')
  const headers: any = { Authorization: `Bearer ${await decrypt(encrypted)}` }
  if (config?.public_config?.project_id) headers['OpenAI-Project'] = String(config.public_config.project_id)
  if (config?.public_config?.organization_id) headers['OpenAI-Organization'] = String(config.public_config.organization_id)
  const model = clean(config?.public_config?.model)
  const url = model ? `https://api.openai.com/v1/models/${encodeURIComponent(model)}` : 'https://api.openai.com/v1/models'
  const response = await fetch(url, { headers })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.error?.message || `OpenAI API returned ${response.status}`)
  return { ok: true, verified: true, status: 'passed', detail: model ? `Authenticated; configured model ${body?.id || model} is accessible` : 'Authenticated with OpenAI API successfully' }
}
async function testConfig(db: any, storeId: string, providerId: string) {
  const provider = await providerFor(db, providerId)
  const config = await existingConfig(db, storeId, providerId)
  if (!config) throw new Error('Save the provider configuration first')
  const result = providerId === 'openai' ? await testOpenAI(config)
    : providerId === 'google_play' ? await testGooglePlay(db, storeId, config)
    : providerId === 'app_store_connect' ? await testAppStoreConnect(db, storeId, config)
    : { ok: true, verified: false, status: 'not_available', detail: provider.adapter_status === 'live' ? 'Credentials are stored securely. Complete the provider authorization flow to verify live API access.' : 'Credentials are stored securely. Live provider-specific validation is unavailable until this adapter is activated.' }
  const now = new Date().toISOString()
  await db.from('marketing_provider_configs').update({ last_test_at: now, last_test_status: result.status, last_test_error: null, updated_at: now }).eq('id', config.id)
  return result
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  try {
    const { db } = await requireAdmin(req)
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || 'get')
    const storeId = clean(body?.storeId)
    const providerId = clean(body?.providerId)
    if (!storeId || !providerId) return json({ error: 'storeId and providerId are required' }, 400)
    const { data: store } = await db.from('stores').select('id').eq('id', storeId).maybeSingle()
    if (!store) return json({ error: 'Store not found' }, 404)
    if (action === 'get') { const provider = await providerFor(db, providerId); return json({ success: true, config: publicResponse(provider, await existingConfig(db, storeId, providerId)) }) }
    if (action === 'save') { const { provider, config } = await save(db, storeId, providerId, body?.values || {}); return json({ success: true, config: publicResponse(provider, config) }) }
    if (action === 'test') {
      try { return json({ success: true, result: await testConfig(db, storeId, providerId) }) }
      catch (e: any) {
        const config = await existingConfig(db, storeId, providerId)
        if (config) await db.from('marketing_provider_configs').update({ last_test_at: new Date().toISOString(), last_test_status: 'failed', last_test_error: e?.message || 'Test failed', updated_at: new Date().toISOString() }).eq('id', config.id)
        throw e
      }
    }
    return json({ error: 'unsupported_action' }, 400)
  } catch (e: any) {
    const message = e?.message || 'Provider configuration failed'
    return json({ success: false, error: message }, /Authorization|session|Admin access/i.test(message) ? 401 : 400)
  }
})

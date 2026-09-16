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
const clean = (value: unknown) => typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
const dbAdmin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const b64urlDecode = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0))
}
const b64urlEncode = (bytes: Uint8Array) => {
  let raw = ''
  for (const byte of bytes) raw += String.fromCharCode(byte)
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
async function encryptionKey() {
  const encoded = Deno.env.get('MARKETING_TOKEN_ENCRYPTION_KEY')?.trim()
  if (!encoded) throw new Error('MARKETING_TOKEN_ENCRYPTION_KEY is not configured')
  const raw = b64urlDecode(encoded)
  if (raw.length !== 32) throw new Error('MARKETING_TOKEN_ENCRYPTION_KEY must decode to 32 bytes')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt'])
}
async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), new TextEncoder().encode(value)))
  const combined = new Uint8Array(iv.length + cipher.length)
  combined.set(iv)
  combined.set(cipher, iv.length)
  return `enc:v1:${b64urlEncode(combined)}`
}
async function requireAdmin(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new Error('Authorization required')
  const db = dbAdmin()
  const { data: auth, error } = await db.auth.getUser(token)
  if (error || !auth.user) throw new Error('Invalid session')
  const { data: profile } = await db.from('user_profiles').select('profile_role,is_active').eq('id', auth.user.id).maybeSingle()
  if (profile?.profile_role !== 'admin' || profile?.is_active === false) throw new Error('Admin access required')
  return db
}
function githubHeaders() {
  const token = Deno.env.get('GITHUB_TOKEN')?.trim()
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'CentralHub-App-Publishing-Discovery/1.0',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}
async function githubJson(url: string) {
  const response = await fetch(url, { headers: githubHeaders(), signal: AbortSignal.timeout(12000) })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.message || `GitHub returned ${response.status}`)
  return body
}
function decodeFile(content: string) {
  const raw = atob(String(content || '').replace(/\s+/g, ''))
  return new TextDecoder().decode(Uint8Array.from(raw, c => c.charCodeAt(0)))
}
async function repositoryFile(repo: string, branch: string, path: string) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const file = await githubJson(`https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`)
  if (file?.type !== 'file' || file?.encoding !== 'base64' || !file?.content) throw new Error('Credential candidate is not a readable file')
  return decodeFile(file.content)
}
const basename = (path: string) => path.split('/').pop() || path
const playCandidate = (path: string) => {
  const lower = path.toLowerCase()
  return lower.endsWith('.json') && !lower.endsWith('google-services.json') && /(service[_-]?account|google[_-]?play|play[_-]?(publisher|service)|android[_-]?publisher|publisher|playstore)/i.test(lower)
}
const appleMetadataCandidate = (path: string) => /(?:app.?store|appstore|asc|issuer|connect)/i.test(path) && /\.json$/i.test(path)

async function discover(db: any, storeId: string, providerId: 'google_play'|'app_store_connect') {
  const platform = providerId === 'google_play' ? 'android' : 'ios'
  const now = new Date().toISOString()
  const [{ data: config, error: configError }, { data: repoConfig, error: repoError }, { data: app, error: appError }] = await Promise.all([
    db.from('marketing_provider_configs').select('*').eq('store_id', storeId).eq('provider_id', providerId).maybeSingle(),
    db.from('site_health_store_configs').select('github_repo').eq('store_id', storeId).maybeSingle(),
    db.from('app_marketing_apps').select('id,package_identifier,external_app_id,status,metadata').eq('store_id', storeId).eq('platform', platform).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (configError) throw configError
  if (repoError) throw repoError
  if (appError) throw appError

  const repo = clean(repoConfig?.github_repo)
  const publicConfig: Record<string, unknown> = { ...(config?.public_config || {}) }
  const encryptedSecrets: Record<string, string> = { ...(config?.encrypted_secrets || {}) }
  if (providerId === 'google_play' && app?.package_identifier) publicConfig.package_name = app.package_identifier
  if (providerId === 'app_store_connect' && app?.package_identifier) publicConfig.bundle_id = app.package_identifier
  if (providerId === 'app_store_connect' && app?.external_app_id) publicConfig.app_id = app.external_app_id
  publicConfig.identity_status = app?.status || 'missing'
  publicConfig.repository = repo || null
  publicConfig.discovered_at = now

  let visibility = 'unknown'
  let firebaseConfigFound = false
  let credentialStatus = Object.keys(encryptedSecrets).length ? 'stored' : 'missing'
  let sourceFile: string | null = null
  let message = repo ? 'No publishing credential was found in the registered store repository.' : 'No GitHub repository is registered for this store.'
  let imported = false
  let exposed = false
  let scanStatus = 'complete'

  if (repo) {
    try {
      const repository = await githubJson(`https://api.github.com/repos/${repo}`)
      const branch = clean(repository?.default_branch) || 'main'
      visibility = repository?.private === true ? 'private' : 'public'
      const tree = await githubJson(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`)
      const files = (Array.isArray(tree?.tree) ? tree.tree : []).filter((item: any) => item?.type === 'blob' && clean(item?.path))
      firebaseConfigFound = files.some((item: any) => clean(item.path).toLowerCase().endsWith('google-services.json'))

      if (providerId === 'google_play') {
        const candidates = files.filter((item: any) => playCandidate(clean(item.path)) && (!item.size || item.size <= 131072)).slice(0, 12)
        let serviceAccount: any = null
        for (const candidate of candidates) {
          try {
            const text = await repositoryFile(repo, branch, clean(candidate.path))
            const parsed = JSON.parse(text)
            if (parsed?.type === 'service_account' && clean(parsed?.client_email) && String(parsed?.private_key || '').includes('BEGIN PRIVATE KEY')) {
              serviceAccount = parsed
              sourceFile = basename(clean(candidate.path))
              break
            }
          } catch { /* Ignore unrelated JSON candidates. */ }
        }
        if (serviceAccount) {
          if (visibility === 'public') {
            exposed = true
            credentialStatus = 'rotation_required'
            message = 'A Google Play service-account credential is committed to a public repository. It was not imported. Rotate it and store the replacement securely.'
          } else if (encryptedSecrets.service_account_json) {
            credentialStatus = 'stored'
            message = 'Google Play credentials are already stored securely. Repository discovery did not overwrite them.'
          } else {
            encryptedSecrets.service_account_json = await encrypt(JSON.stringify(serviceAccount))
            credentialStatus = 'imported_unverified'
            message = 'Google Play service-account credential imported from the private store repository. Test the connection before publishing.'
            imported = true
          }
        } else if (firebaseConfigFound) {
          message = 'Firebase google-services.json was found, but it is not a Google Play publishing credential. A Play service-account JSON is still required.'
        }
      } else {
        const p8Files = files.filter((item: any) => clean(item.path).toLowerCase().endsWith('.p8') && (!item.size || item.size <= 65536)).slice(0, 12)
        const metadataFiles = files.filter((item: any) => appleMetadataCandidate(clean(item.path)) && (!item.size || item.size <= 65536)).slice(0, 12)
        let privateKey = ''
        let keyId = clean(publicConfig.key_id)
        let issuerId = clean(publicConfig.issuer_id)
        for (const candidate of p8Files) {
          const path = clean(candidate.path)
          try {
            const text = await repositoryFile(repo, branch, path)
            if (!text.includes('BEGIN PRIVATE KEY')) continue
            privateKey = text.trim()
            keyId ||= basename(path).match(/^AuthKey_([A-Za-z0-9]+)\.p8$/i)?.[1] || ''
            sourceFile = basename(path)
            break
          } catch { /* Ignore unreadable candidates. */ }
        }
        for (const candidate of metadataFiles) {
          if (keyId && issuerId) break
          try {
            const parsed = JSON.parse(await repositoryFile(repo, branch, clean(candidate.path)))
            keyId ||= clean(parsed?.key_id || parsed?.keyId || parsed?.kid)
            issuerId ||= clean(parsed?.issuer_id || parsed?.issuerId || parsed?.issuer)
          } catch { /* Only structured companion metadata is accepted. */ }
        }
        if (privateKey) {
          if (visibility === 'public') {
            exposed = true
            credentialStatus = 'rotation_required'
            message = 'An App Store Connect .p8 private key is committed to a public repository. It was not imported. Revoke/rotate it and store the replacement securely.'
          } else if (!keyId || !issuerId) {
            credentialStatus = 'incomplete'
            message = 'An App Store Connect .p8 key was found, but both Key ID and Issuer ID could not be identified. Nothing was imported.'
          } else if (encryptedSecrets.private_key) {
            credentialStatus = 'stored'
            message = 'App Store Connect credentials are already stored securely. Repository discovery did not overwrite them.'
          } else {
            publicConfig.key_id = keyId
            publicConfig.issuer_id = issuerId
            encryptedSecrets.private_key = await encrypt(privateKey)
            credentialStatus = 'imported_unverified'
            message = 'App Store Connect credential imported from the private store repository. Test the connection before publishing.'
            imported = true
          }
        }
      }
    } catch (error: any) {
      scanStatus = 'error'
      message = `Repository scan could not complete: ${String(error?.message || 'unknown error').slice(0, 180)}`
    }
  }

  publicConfig.repository_visibility = visibility
  publicConfig.repository_scan_status = scanStatus
  publicConfig.firebase_config_found = firebaseConfigFound
  publicConfig.credential_status = credentialStatus
  publicConfig.credential_source_file = sourceFile
  publicConfig.discovery_message = message
  publicConfig.exposed_repository_credential = exposed

  const payload: Record<string, unknown> = {
    store_id: storeId,
    provider_id: providerId,
    public_config: publicConfig,
    encrypted_secrets: encryptedSecrets,
    status: Object.keys(encryptedSecrets).length ? 'configured' : (config?.status || 'disconnected'),
    updated_at: now,
  }
  if (imported) {
    payload.credentials_updated_at = now
    payload.last_test_at = null
    payload.last_test_status = null
    payload.last_test_error = null
  }
  const { data: saved, error } = await db.from('marketing_provider_configs').upsert(payload, { onConflict: 'store_id,provider_id' }).select('id,store_id,provider_id,status,public_config,last_test_at,last_test_status,last_test_error,updated_at').single()
  if (error) throw error
  return {
    config: saved,
    discovery: {
      provider_id: providerId,
      repository: repo || null,
      repository_visibility: visibility,
      identity_identifier: app?.package_identifier || null,
      identity_status: app?.status || 'missing',
      credential_status: credentialStatus,
      credential_source_file: sourceFile,
      firebase_config_found: firebaseConfigFound,
      imported,
      exposed,
      message,
    },
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ success: false, error: 'method_not_allowed' }, 405)
  try {
    const db = await requireAdmin(req)
    const body = await req.json().catch(() => ({}))
    const storeId = clean(body?.storeId)
    const providerId = clean(body?.providerId)
    if (!storeId || !['google_play', 'app_store_connect'].includes(providerId)) return json({ success: false, error: 'A valid storeId and publishing providerId are required' }, 400)
    const { data: store } = await db.from('stores').select('id').eq('id', storeId).maybeSingle()
    if (!store) return json({ success: false, error: 'Store not found' }, 404)
    return json({ success: true, ...(await discover(db, storeId, providerId as 'google_play'|'app_store_connect')) })
  } catch (error: any) {
    const message = String(error?.message || 'Publishing credential discovery failed')
    return json({ success: false, error: message }, /Authorization|session|Admin access/i.test(message) ? 401 : 400)
  }
})

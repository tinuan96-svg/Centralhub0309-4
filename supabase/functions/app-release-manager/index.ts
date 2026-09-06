import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHash } from 'node:crypto'

const BUCKET = 'app-release-artifacts'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const clean = (value: unknown) => typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
const safeFile = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 160)
const enc = new TextEncoder()
const b64 = (bytes: Uint8Array) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') }
const unb64 = (value: string) => { const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4); return Uint8Array.from(atob(padded), c => c.charCodeAt(0)) }
const b64json = (value: unknown) => b64(enc.encode(JSON.stringify(value)))
const pemBytes = (pem: string) => unb64(pem.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, ''))

async function cryptoKey() {
  const secret = Deno.env.get('MARKETING_TOKEN_ENCRYPTION_KEY')?.trim()
  if (!secret) throw new Error('Release credential encryption key is not configured')
  const raw = unb64(secret)
  if (raw.length !== 32) throw new Error('Release credential encryption key is invalid')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt'])
}
async function decrypt(value: string) {
  if (!value?.startsWith('enc:v1:')) throw new Error('Stored provider credential has an unsupported encryption format')
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
async function providerConfig(db: any, storeId: string, providerId: string) {
  const { data, error } = await db.from('marketing_provider_configs').select('*').eq('store_id', storeId).eq('provider_id', providerId).maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`${providerId === 'google_play' ? 'Google Play' : 'App Store Connect'} is not configured for this store`)
  if (data.last_test_status !== 'passed') throw new Error('Test this store connector successfully before publishing')
  return data
}
async function releaseFor(db: any, releaseId: string) {
  const { data, error } = await db.from('app_releases').select('*, app:app_marketing_apps(id,store_id,platform,package_identifier,display_name,status,metadata)').eq('id', releaseId).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Release not found')
  return { ...data, app: Array.isArray(data.app) ? data.app[0] : data.app }
}
async function event(db: any, release: any, eventType: string, status: string | null, message: string, details: any = {}, userId?: string) {
  await db.from('app_release_events').insert({ release_id: release.id, store_id: release.store_id, event_type: eventType, status, message, details, created_by: userId || null })
}
async function patchRelease(db: any, releaseId: string, values: Record<string, unknown>) {
  const { data, error } = await db.from('app_releases').update({ ...values, updated_at: new Date().toISOString() }).eq('id', releaseId).select('*').single()
  if (error) throw error
  return data
}
async function startJob(db: any, release: any, providerId: string, action: string, userId: string) {
  const key = `${release.id}:${action}:${Date.now()}`
  const { data, error } = await db.from('app_release_jobs').insert({ release_id: release.id, store_id: release.store_id, provider_id: providerId, action, status: 'running', attempts: 1, idempotency_key: key, requested_by: userId, started_at: new Date().toISOString() }).select('*').single()
  if (error) throw error
  return data
}
async function finishJob(db: any, jobId: string, ok: boolean, response: any = {}, errorText?: string) {
  await db.from('app_release_jobs').update({ status: ok ? 'succeeded' : 'failed', response: response || {}, error: errorText || null, finished_at: new Date().toISOString() }).eq('id', jobId)
}
async function signedArtifactUrl(db: any, release: any) {
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(release.artifact_path, 3600)
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not create a private artifact URL')
  return data.signedUrl
}
async function googleAccessToken(config: any) {
  const encrypted = config?.encrypted_secrets?.service_account_json
  if (!encrypted) throw new Error('Google service account JSON is not stored')
  let service: any
  try { service = JSON.parse(await decrypt(encrypted)) } catch { throw new Error('Google service account JSON is invalid') }
  if (!service?.client_email || !service?.private_key) throw new Error('Google service account JSON is incomplete')
  const now = Math.floor(Date.now() / 1000)
  const header = b64json({ alg: 'RS256', typ: 'JWT' })
  const claim = b64json({ iss: service.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: service.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })
  const input = `${header}.${claim}`
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(service.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(input)))
  const assertion = `${input}.${b64(sig)}`
  const response = await fetch(service.token_uri || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body?.access_token) throw new Error(body?.error_description || body?.error || `Google OAuth returned ${response.status}`)
  return String(body.access_token)
}
async function appleJwt(config: any) {
  const issuer = clean(config?.public_config?.issuer_id)
  const keyId = clean(config?.public_config?.key_id)
  const encrypted = config?.encrypted_secrets?.private_key
  if (!issuer || !keyId || !encrypted) throw new Error('Apple publishing credentials are incomplete')
  const keyPem = await decrypt(encrypted)
  const now = Math.floor(Date.now() / 1000)
  const header = b64json({ alg: 'ES256', kid: keyId, typ: 'JWT' })
  const claim = b64json({ iss: issuer, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })
  const input = `${header}.${claim}`
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(keyPem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(input)))
  if (sig.length !== 64) throw new Error('Apple signing key returned an unexpected signature format')
  return `${input}.${b64(sig)}`
}
const providerError = (body: any, fallback: string) => body?.error?.message || body?.errors?.[0]?.detail || body?.errors?.[0]?.title || fallback

async function publishGoogle(db: any, release: any, userId: string, confirmation: string) {
  if (release.platform !== 'android' || release.provider_id !== 'google_play') throw new Error('This release is not an Android Google Play release')
  if (!['uploaded','ready','failed'].includes(release.status)) throw new Error(`Release cannot be published from status ${release.status}`)
  if (release.app?.status === 'needs_native_sync' || release.app?.metadata?.publishing_enabled === false) throw new Error(release.app?.metadata?.blocking_reason || 'Android publishing is blocked for this app')
  const track = clean(release.target_track || 'internal').toLowerCase()
  if (!['internal','alpha','beta','production'].includes(track)) throw new Error('Unsupported Google Play track')
  if (track === 'production' && confirmation !== 'PUBLISH') throw new Error('Production publishing requires the explicit confirmation PUBLISH')
  const config = await providerConfig(db, release.store_id, 'google_play')
  const packageName = clean(config.public_config?.package_name)
  if (packageName !== release.app?.package_identifier) throw new Error('Google Play package name does not match this CentralHub app identity')
  const job = await startJob(db, release, 'google_play', 'publish_google', userId)
  let editId = ''
  try {
    await patchRelease(db, release.id, { status: 'publishing', last_error: null })
    await event(db, release, 'publish_started', 'publishing', `Publishing ${release.artifact_file_name} to Google Play ${track}`, { track }, userId)
    const accessToken = await googleAccessToken(config)
    const auth = { Authorization: `Bearer ${accessToken}` }
    const editBase = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/edits`
    const create = await fetch(editBase, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}' })
    const createBody = await create.json().catch(() => ({}))
    if (!create.ok || !createBody?.id) throw new Error(providerError(createBody, `Google Play create edit returned ${create.status}`))
    editId = String(createBody.id)
    await patchRelease(db, release.id, { external_edit_id: editId })

    const artifactUrl = await signedArtifactUrl(db, release)
    const artifact = await fetch(artifactUrl)
    if (!artifact.ok || !artifact.body) throw new Error(`Could not read release artifact (${artifact.status})`)
    const uploadUrl = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/edits/${encodeURIComponent(editId)}/bundles?uploadType=media`
    const upload = await fetch(uploadUrl, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/octet-stream', ...(release.artifact_size ? { 'Content-Length': String(release.artifact_size) } : {}) }, body: artifact.body })
    const uploadBody = await upload.json().catch(() => ({}))
    if (!upload.ok || !uploadBody?.versionCode) throw new Error(providerError(uploadBody, `Google Play bundle upload returned ${upload.status}`))
    const versionCode = String(uploadBody.versionCode)

    const fraction = Number(release.rollout_fraction || 1)
    const staged = track === 'production' && fraction > 0 && fraction < 1
    const notes = clean(release.release_notes)
    const releaseSpec: any = { versionCodes: [versionCode], status: staged ? 'inProgress' : 'completed' }
    if (clean(release.version_name)) releaseSpec.name = clean(release.version_name)
    if (staged) releaseSpec.userFraction = fraction
    if (notes) releaseSpec.releaseNotes = [{ language: 'en-GB', text: notes.slice(0, 500) }]
    const trackResponse = await fetch(`${editBase}/${encodeURIComponent(editId)}/tracks/${encodeURIComponent(track)}`, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ track, releases: [releaseSpec] }) })
    const trackBody = await trackResponse.json().catch(() => ({}))
    if (!trackResponse.ok) throw new Error(providerError(trackBody, `Google Play track update returned ${trackResponse.status}`))

    const validate = await fetch(`${editBase}/${encodeURIComponent(editId)}:validate`, { method: 'POST', headers: auth })
    const validateBody = await validate.json().catch(() => ({}))
    if (!validate.ok) throw new Error(providerError(validateBody, `Google Play validation returned ${validate.status}`))

    const commit = await fetch(`${editBase}/${encodeURIComponent(editId)}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`, { method: 'POST', headers: auth })
    const commitBody = await commit.json().catch(() => ({}))
    if (!commit.ok) throw new Error(providerError(commitBody, `Google Play commit returned ${commit.status}`))
    const updated = await patchRelease(db, release.id, { status: 'submitted', external_version_code: versionCode, provider_response: { upload: uploadBody, track: trackBody, commit: commitBody }, published_at: new Date().toISOString(), last_error: null })
    await event(db, release, 'publish_submitted', 'submitted', `Google Play accepted version code ${versionCode} on ${track}`, { track, versionCode, staged, rolloutFraction: staged ? fraction : 1 }, userId)
    await finishJob(db, job.id, true, { versionCode, track, staged })
    return updated
  } catch (e: any) {
    if (editId) {
      try { const config2 = await providerConfig(db, release.store_id, 'google_play'); const token2 = await googleAccessToken(config2); const packageName2 = clean(config2.public_config?.package_name); await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName2)}/edits/${encodeURIComponent(editId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token2}` } }) } catch { }
    }
    await patchRelease(db, release.id, { status: 'failed', last_error: e?.message || 'Google Play publishing failed' })
    await event(db, release, 'publish_failed', 'failed', e?.message || 'Google Play publishing failed', {}, userId)
    await finishJob(db, job.id, false, {}, e?.message || 'Google Play publishing failed')
    throw e
  }
}

function headersFromApple(operation: any) {
  const headers: Record<string,string> = {}
  const raw = operation?.requestHeaders
  if (Array.isArray(raw)) for (const item of raw) if (item?.name && item?.value != null) headers[String(item.name)] = String(item.value)
  else if (raw && typeof raw === 'object') for (const [k,v] of Object.entries(raw)) if (v != null) headers[k] = String(v)
  return headers
}
async function publishApple(db: any, release: any, userId: string) {
  if (release.platform !== 'ios' || release.provider_id !== 'app_store_connect') throw new Error('This release is not an iOS App Store Connect release')
  if (!['uploaded','ready','failed'].includes(release.status)) throw new Error(`Release cannot be uploaded from status ${release.status}`)
  if (!clean(release.version_name) || !clean(release.build_number)) throw new Error('iOS version and build number are required')
  if (release.app?.metadata?.publishing_enabled === false) throw new Error(release.app?.metadata?.blocking_reason || 'iOS publishing is blocked for this app')
  const config = await providerConfig(db, release.store_id, 'app_store_connect')
  const appId = clean(config.public_config?.app_id)
  const bundleId = clean(config.public_config?.bundle_id)
  if (bundleId !== release.app?.package_identifier) throw new Error('App Store Connect bundle ID does not match this CentralHub app identity')
  const job = await startJob(db, release, 'app_store_connect', 'upload_apple', userId)
  try {
    await patchRelease(db, release.id, { status: 'publishing', last_error: null })
    await event(db, release, 'publish_started', 'publishing', `Uploading ${release.artifact_file_name} to App Store Connect`, {}, userId)
    const token = await appleJwt(config)
    const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    const create = await fetch('https://api.appstoreconnect.apple.com/v1/buildUploads', { method: 'POST', headers: authHeaders, body: JSON.stringify({ data: { type: 'buildUploads', attributes: { cfBundleShortVersionString: clean(release.version_name), cfBundleVersion: clean(release.build_number), platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: appId } } } } }) })
    const createBody = await create.json().catch(() => ({}))
    if (!create.ok || !createBody?.data?.id) throw new Error(providerError(createBody, `App Store Connect build upload returned ${create.status}`))
    const buildUploadId = String(createBody.data.id)
    await patchRelease(db, release.id, { external_build_id: buildUploadId })

    const reserve = await fetch('https://api.appstoreconnect.apple.com/v1/buildUploadFiles', { method: 'POST', headers: authHeaders, body: JSON.stringify({ data: { type: 'buildUploadFiles', attributes: { fileName: release.artifact_file_name, fileSize: Number(release.artifact_size || 0), assetType: 'ASSET', uti: 'com.apple.ipa' }, relationships: { buildUpload: { data: { type: 'buildUploads', id: buildUploadId } } } } }) })
    const reserveBody = await reserve.json().catch(() => ({}))
    if (!reserve.ok || !reserveBody?.data?.id) throw new Error(providerError(reserveBody, `App Store Connect file reservation returned ${reserve.status}`))
    const fileId = String(reserveBody.data.id)
    const operations = [...(reserveBody?.data?.attributes?.uploadOperations || [])].sort((a: any,b: any) => Number(a.offset || 0) - Number(b.offset || 0))
    if (!operations.length) throw new Error('App Store Connect did not return binary upload operations')
    const artifactUrl = await signedArtifactUrl(db, release)
    const md5 = createHash('md5')
    for (const operation of operations) {
      const offset = Number(operation.offset || 0)
      const length = Number(operation.length || 0)
      if (!Number.isFinite(offset) || !Number.isFinite(length) || length <= 0 || !operation.url) throw new Error('App Store Connect returned an invalid upload operation')
      const partResponse = await fetch(artifactUrl, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } })
      if (!partResponse.ok) throw new Error(`Could not read IPA chunk (${partResponse.status})`)
      const bytes = new Uint8Array(await partResponse.arrayBuffer())
      if (bytes.byteLength !== length) throw new Error(`IPA chunk length mismatch at offset ${offset}`)
      md5.update(bytes)
      const upload = await fetch(String(operation.url), { method: String(operation.method || 'PUT'), headers: headersFromApple(operation), body: bytes })
      if (!upload.ok) throw new Error(`Apple binary upload failed at offset ${offset} (${upload.status})`)
    }
    const checksum = md5.digest('hex')
    const commit = await fetch(`https://api.appstoreconnect.apple.com/v1/buildUploadFiles/${encodeURIComponent(fileId)}`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ data: { type: 'buildUploadFiles', id: fileId, attributes: { uploaded: true, sourceFileChecksum: checksum } } }) })
    const commitBody = await commit.json().catch(() => ({}))
    if (!commit.ok) throw new Error(providerError(commitBody, `App Store Connect file commit returned ${commit.status}`))
    const updated = await patchRelease(db, release.id, { status: 'processing', artifact_sha256: release.artifact_sha256 || null, provider_response: { buildUpload: createBody, buildUploadFile: commitBody, sourceFileMd5: checksum }, published_at: new Date().toISOString(), last_error: null })
    await event(db, release, 'publish_submitted', 'processing', 'IPA uploaded; App Store Connect is processing the build for TestFlight/App Store use', { buildUploadId, fileId }, userId)
    await finishJob(db, job.id, true, { buildUploadId, fileId })
    return updated
  } catch (e: any) {
    await patchRelease(db, release.id, { status: 'failed', last_error: e?.message || 'App Store Connect upload failed' })
    await event(db, release, 'publish_failed', 'failed', e?.message || 'App Store Connect upload failed', {}, userId)
    await finishJob(db, job.id, false, {}, e?.message || 'App Store Connect upload failed')
    throw e
  }
}

async function refreshGoogle(db: any, release: any, userId: string) {
  const config = await providerConfig(db, release.store_id, 'google_play')
  const packageName = clean(config.public_config?.package_name)
  const track = clean(release.target_track || 'internal')
  const versionCode = clean(release.external_version_code)
  if (!versionCode) throw new Error('No Google Play version code has been recorded yet')
  const token = await googleAccessToken(config)
  const auth = { Authorization: `Bearer ${token}` }
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/edits`
  const create = await fetch(base, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}' })
  const createBody = await create.json().catch(() => ({}))
  if (!create.ok || !createBody?.id) throw new Error(providerError(createBody, `Google Play status check returned ${create.status}`))
  const editId = String(createBody.id)
  try {
    const resp = await fetch(`${base}/${encodeURIComponent(editId)}/tracks/${encodeURIComponent(track)}`, { headers: auth })
    const body = await resp.json().catch(() => ({}))
    if (!resp.ok) throw new Error(providerError(body, `Google Play track status returned ${resp.status}`))
    const match = (body?.releases || []).find((r: any) => (r?.versionCodes || []).map(String).includes(versionCode))
    const status = match?.status === 'completed' ? 'released' : 'submitted'
    const updated = await patchRelease(db, release.id, { status, provider_response: { ...(release.provider_response || {}), latestTrack: body }, ...(status === 'released' ? { published_at: release.published_at || new Date().toISOString() } : {}) })
    await event(db, release, 'status_refreshed', status, `Google Play status: ${match?.status || 'submitted'}`, { track, versionCode }, userId)
    return updated
  } finally { await fetch(`${base}/${encodeURIComponent(editId)}`, { method: 'DELETE', headers: auth }).catch(() => undefined) }
}
async function refreshApple(db: any, release: any, userId: string) {
  if (!release.external_build_id) throw new Error('No App Store Connect build upload ID has been recorded yet')
  const config = await providerConfig(db, release.store_id, 'app_store_connect')
  const token = await appleJwt(config)
  const resp = await fetch(`https://api.appstoreconnect.apple.com/v1/buildUploads/${encodeURIComponent(release.external_build_id)}`, { headers: { Authorization: `Bearer ${token}` } })
  const body = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(providerError(body, `App Store Connect status check returned ${resp.status}`))
  const rawState = body?.data?.attributes?.state
  const state = clean(typeof rawState === 'string' ? rawState : rawState?.state).toUpperCase()
  const next = state === 'COMPLETE' ? 'submitted' : state === 'FAILED' ? 'failed' : 'processing'
  const updated = await patchRelease(db, release.id, { status: next, provider_response: { ...(release.provider_response || {}), latestBuildUpload: body }, last_error: next === 'failed' ? providerError(body, 'App Store Connect processing failed') : null })
  await event(db, release, 'status_refreshed', next, `App Store Connect status: ${state || 'PROCESSING'}`, {}, userId)
  return updated
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  try {
    const { db, user } = await requireAdmin(req)
    const body = await req.json().catch(() => ({}))
    const action = clean(body?.action || 'overview')
    const storeId = clean(body?.storeId)

    if (action === 'overview') {
      if (!storeId) return json({ success: true, apps: [], releases: [], configs: [] })
      const [{ data: apps, error: appsError }, { data: releases, error: releaseError }, { data: configs, error: configError }] = await Promise.all([
        db.from('app_marketing_apps').select('*').eq('store_id', storeId).order('platform'),
        db.from('app_releases').select('*').eq('store_id', storeId).order('created_at', { ascending: false }).limit(100),
        db.from('marketing_provider_configs').select('provider_id,status,last_test_at,last_test_status,last_test_error,public_config,updated_at').eq('store_id', storeId).in('provider_id', ['google_play','app_store_connect']),
      ])
      if (appsError) throw appsError; if (releaseError) throw releaseError; if (configError) throw configError
      return json({ success: true, apps: apps || [], releases: releases || [], configs: configs || [] })
    }

    if (action === 'create') {
      const appId = clean(body?.appId); const fileName = safeFile(clean(body?.fileName)); const fileSize = Number(body?.fileSize || 0)
      if (!storeId || !appId || !fileName || !fileSize) return json({ success: false, error: 'storeId, appId, fileName and fileSize are required' }, 400)
      const { data: app, error: appError } = await db.from('app_marketing_apps').select('*').eq('id', appId).eq('store_id', storeId).maybeSingle()
      if (appError) throw appError; if (!app) throw new Error('App identity is not registered to this store')
      if (app.metadata?.publishing_enabled === false || app.status === 'needs_native_sync') throw new Error(app.metadata?.blocking_reason || 'Publishing is blocked for this app')
      const ext = fileName.toLowerCase().split('.').pop()
      if (app.platform === 'android' && ext !== 'aab') throw new Error('Android releases must use a signed .aab file')
      if (app.platform === 'ios' && ext !== 'ipa') throw new Error('iOS releases must use a signed .ipa file')
      const providerId = app.platform === 'android' ? 'google_play' : 'app_store_connect'
      const { data: store } = await db.from('stores').select('slug').eq('id', storeId).single()
      const { data: repo } = await db.from('github_repository_registry').select('*').eq('store_slug', store.slug).maybeSingle()
      if (!repo || repo.branch_name !== 'main' || repo.main_only !== true || repo.allow_new_branches === true) throw new Error('Canonical main-only GitHub repository protection is not configured for this store')
      const versionName = clean(body?.versionName) || null; const buildNumber = clean(body?.buildNumber) || null
      if (app.platform === 'ios' && (!versionName || !buildNumber)) throw new Error('iOS releases require version and build number')
      const artifactPath = `${store.slug}/${app.platform}/${crypto.randomUUID()}/${fileName}`
      const { data: release, error } = await db.from('app_releases').insert({ store_id: storeId, app_id: app.id, platform: app.platform, provider_id: providerId, version_name: versionName, build_number: buildNumber, release_notes: clean(body?.releaseNotes) || null, artifact_path: artifactPath, artifact_file_name: fileName, artifact_size: fileSize, artifact_content_type: clean(body?.contentType) || 'application/octet-stream', source_branch: 'main', target_track: app.platform === 'android' ? clean(body?.targetTrack || 'internal').toLowerCase() : null, rollout_fraction: app.platform === 'android' ? Math.min(1, Math.max(0.01, Number(body?.rolloutFraction || 1))) : null, status: 'upload_pending', created_by: user.id }).select('*').single()
      if (error) throw error
      await event(db, release, 'release_created', 'upload_pending', 'Release record created; waiting for private artifact upload', { repo: repo.repo_full_name, branch: 'main' }, user.id)
      return json({ success: true, release, bucket: BUCKET })
    }

    const releaseId = clean(body?.releaseId)
    if (!releaseId) return json({ success: false, error: 'releaseId is required' }, 400)
    const release = await releaseFor(db, releaseId)
    if (storeId && release.store_id !== storeId) throw new Error('Release does not belong to the selected store')

    if (action === 'mark_uploaded') {
      const { data: files, error } = await db.storage.from(BUCKET).list(release.artifact_path.split('/').slice(0, -1).join('/'), { search: release.artifact_file_name, limit: 10 })
      if (error) throw error
      const file = (files || []).find((x: any) => x.name === release.artifact_file_name)
      if (!file) throw new Error('Uploaded artifact was not found in private storage')
      const size = Number(file?.metadata?.size || release.artifact_size || 0)
      if (release.artifact_size && size && Number(release.artifact_size) !== size) throw new Error(`Uploaded artifact size mismatch (${size} vs ${release.artifact_size})`)
      const updated = await patchRelease(db, release.id, { status: 'ready', artifact_size: size || release.artifact_size, last_error: null })
      await event(db, release, 'artifact_uploaded', 'ready', 'Private release artifact upload completed and is ready for store publishing', { size }, user.id)
      return json({ success: true, release: updated })
    }
    if (action === 'cancel') {
      if (['publishing','processing','submitted','released'].includes(release.status)) throw new Error('This release can no longer be cancelled from CentralHub')
      await db.storage.from(BUCKET).remove([release.artifact_path]).catch(() => undefined)
      const updated = await patchRelease(db, release.id, { status: 'cancelled' })
      await event(db, release, 'cancelled', 'cancelled', 'Release cancelled and private artifact removal requested', {}, user.id)
      return json({ success: true, release: updated })
    }
    if (action === 'publish_google') return json({ success: true, release: await publishGoogle(db, release, user.id, clean(body?.confirmation)) })
    if (action === 'publish_apple') return json({ success: true, release: await publishApple(db, release, user.id) })
    if (action === 'refresh') {
      const updated = release.provider_id === 'google_play' ? await refreshGoogle(db, release, user.id) : await refreshApple(db, release, user.id)
      return json({ success: true, release: updated })
    }
    return json({ success: false, error: 'unsupported_action' }, 400)
  } catch (e: any) {
    const message = e?.message || 'App release operation failed'
    return json({ success: false, error: message }, /Authorization|session|Admin access/i.test(message) ? 401 : 400)
  }
})

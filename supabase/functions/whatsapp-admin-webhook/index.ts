import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const MEDIA_BUCKET = 'whatsapp-media'
const MAX_MEDIA_BYTES = 50 * 1024 * 1024
const SUPPORTED_MEDIA = new Set(['image', 'document', 'audio', 'video'])
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const digits = (v: unknown) => String(v || '').replace(/[^0-9]/g, '')
const safeName = (v: unknown) => String(v || 'document').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 140) || 'document'

async function verifyMetaSignature(req: Request, payload: string, appSecret: string): Promise<boolean> {
  const signature = req.headers.get('x-hub-signature-256')
  if (!signature?.startsWith('sha256=')) return false
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const expected = Array.from(new Uint8Array(signed)).map(b => b.toString(16).padStart(2, '0')).join('')
  return signature.slice(7) === expected
}

function normalizeGraphApiVersion(value: string | undefined) {
  const raw = String(value || '').trim()
  const match = raw.match(/^v?(\d+\.\d+)$/i)
  return match ? `v${match[1]}` : 'v23.0'
}

async function storeMedia(db: any, channel: any, intake: any, mediaPayload: any) {
  const mediaId = String(mediaPayload?.id || '').trim()
  if (!mediaId) return null
  const token = String(channel?.access_token || '').trim()
  if (!token) throw new Error('CentralHub WhatsApp access token is missing')
  const graphVersion = normalizeGraphApiVersion(Deno.env.get('WHATSAPP_GRAPH_API_VERSION'))
  const metaRes = await fetch(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(mediaId)}`, { headers: { Authorization: `Bearer ${token}` } })
  const metaRaw = await metaRes.text()
  let meta: any = {}
  try { meta = metaRaw ? JSON.parse(metaRaw) : {} } catch { meta = { raw: metaRaw } }
  if (!metaRes.ok || !meta?.url) throw new Error(meta?.error?.message || `Meta media lookup failed (${metaRes.status})`)
  const download = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } })
  if (!download.ok) throw new Error(`Meta media download failed (${download.status})`)
  const bytes = new Uint8Array(await download.arrayBuffer())
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error('WhatsApp admin media exceeds the 50 MB CentralHub limit')
  const mime = String(meta.mime_type || mediaPayload?.mime_type || 'application/octet-stream')
  const filename = safeName(mediaPayload?.filename || `whatsapp-${mediaId}`)
  const extFromMime: Record<string,string> = {
    'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'text/csv': 'csv', 'text/plain': 'txt',
    'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'video/mp4': 'mp4',
  }
  const hasExt = /\.[A-Za-z0-9]{1,8}$/.test(filename)
  const storedName = hasExt ? filename : `${filename}.${extFromMime[mime] || 'bin'}`
  const path = `admin-intake/${intake.id}/${storedName}`
  const { error: uploadError } = await db.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: mime, cacheControl: '31536000', upsert: true })
  if (uploadError) throw new Error(`Could not store WhatsApp admin media: ${uploadError.message}`)
  await db.from('whatsapp_admin_intake_items').update({
    media_storage_path: path, media_mime_type: mime, media_filename: storedName, media_size: Number(meta.file_size || bytes.byteLength),
    media_sha256: meta.sha256 || null, status: 'media_stored', updated_at: new Date().toISOString(),
  }).eq('id', intake.id)
  return { path, mime, filename: storedName, size: bytes.byteLength, sha256: meta.sha256 || null }
}

async function dispatchProcessor(intakeId: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!supabaseUrl || !serviceRole) throw new Error('Supabase processor configuration is missing')
  const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-admin-intake`, {
    method: 'POST', headers: { Authorization: `Bearer ${serviceRole}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'process', intake_id: intakeId }),
  })
  if (!res.ok) throw new Error(`Admin intake processor failed (${res.status}): ${(await res.text()).slice(0, 500)}`)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const db = createClient(supabaseUrl, serviceRole)
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode'), token = url.searchParams.get('hub.verify_token'), challenge = url.searchParams.get('hub.challenge')
    if (mode !== 'subscribe' || !token) return new Response('Forbidden', { status: 403 })
    const { data: channel } = await db.from('whatsapp_channels').select('id').eq('channel_purpose', 'admin_intake').eq('verify_token', token).eq('admin_intake_enabled', true).maybeSingle()
    return channel ? new Response(challenge || '', { status: 200 }) : new Response('Forbidden', { status: 403 })
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  try {
    const rawBody = await req.text()
    const payload = JSON.parse(rawBody)
    const change = payload.entry?.[0]?.changes?.[0], value = change?.value
    const phoneNumberId = String(value?.metadata?.phone_number_id || '').trim()
    if (!phoneNumberId) return json({ status: 'ignored', reason: 'missing_phone_number_id' })
    const { data: channel, error: channelError } = await db.from('whatsapp_channels')
      .select('id,phone_number_id,display_phone_number,business_name,access_token,app_secret,admin_intake_enabled,authorized_sender_phones,status')
      .eq('channel_purpose', 'admin_intake').eq('phone_number_id', phoneNumberId).maybeSingle()
    if (channelError) throw channelError
    if (!channel || !channel.admin_intake_enabled) return json({ status: 'ignored', reason: 'admin_channel_not_enabled' })
    if (!channel.app_secret) return json({ error: 'admin_webhook_app_secret_missing' }, 500)
    if (!(await verifyMetaSignature(req, rawBody, channel.app_secret))) return json({ error: 'invalid_signature' }, 401)
    const statusUpdate = value?.statuses?.[0]
    if (statusUpdate?.id) {
      const update: any = { reply_status: String(statusUpdate.status || ''), updated_at: new Date().toISOString() }
      if (String(statusUpdate.status || '') === 'failed') update.reply_error_message = statusUpdate.errors?.[0]?.title || statusUpdate.errors?.[0]?.message || 'Meta delivery failure'
      await db.from('whatsapp_admin_intake_items').update(update).eq('reply_wa_message_id', statusUpdate.id)
      return json({ status: 'status_updated' })
    }
    const msg = value?.messages?.[0]
    if (!msg?.id) return json({ status: 'ignored', reason: 'no_message' })
    const senderPhone = digits(msg.from)
    const allowed = new Set((channel.authorized_sender_phones || []).map((x: string) => digits(x)).filter(Boolean))
    const profileName = value.contacts?.[0]?.profile?.name || 'Admin'
    const mediaPayload = msg[msg.type] || (msg.type === 'voice' ? msg.voice || msg.audio : null) || null
    const messageType = msg.type === 'voice' ? 'audio' : String(msg.type || 'text')
    const text = String(msg.text?.body || mediaPayload?.caption || '').trim()
    const { data: existing } = await db.from('whatsapp_admin_intake_items').select('id,status').eq('wa_message_id', msg.id).maybeSingle()
    if (existing) return json({ status: 'duplicate', intake_id: existing.id })
    const authorized = allowed.has(senderPhone)
    const { data: intake, error: insertError } = await db.from('whatsapp_admin_intake_items').insert({
      channel_id: channel.id, wa_message_id: msg.id, sender_phone: senderPhone, sender_name: profileName, message_type: messageType, message_text: text || null,
      media_id: mediaPayload?.id || null, media_mime_type: mediaPayload?.mime_type || null, media_filename: mediaPayload?.filename || null,
      status: authorized ? 'received' : 'rejected', error_message: authorized ? null : 'Sender is not authorised for CentralHub admin intake',
      extracted_data: { webhook_received_at: new Date().toISOString() },
    }).select('id,status').single()
    if (insertError) throw insertError
    if (!authorized) return json({ status: 'rejected', intake_id: intake.id })
    if (mediaPayload?.id && SUPPORTED_MEDIA.has(messageType)) {
      try { await storeMedia(db, channel, intake, mediaPayload) }
      catch (error: any) {
        await db.from('whatsapp_admin_intake_items').update({ status: 'error', error_message: String(error?.message || error).slice(0, 1000), updated_at: new Date().toISOString() }).eq('id', intake.id)
        throw error
      }
    }
    const task = dispatchProcessor(intake.id).catch(async (error: any) => {
      console.error('[WhatsApp Admin Webhook] Processor dispatch failed:', error?.message || error)
      await db.from('whatsapp_admin_intake_items').update({ status: 'error', error_message: String(error?.message || error).slice(0, 1000), updated_at: new Date().toISOString() }).eq('id', intake.id)
    })
    if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') EdgeRuntime.waitUntil(task)
    else await task
    return json({ status: 'accepted', intake_id: intake.id })
  } catch (error: any) {
    console.error('[WhatsApp Admin Webhook]', error?.message || error)
    return json({ error: String(error?.message || error) }, 400)
  }
})

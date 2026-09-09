import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type,x-centralhub-internal-key',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

function normalizeGraphApiVersion(value: string | undefined) {
  const raw = String(value || '').trim()
  const match = raw.match(/^v?(\d+\.\d+)$/i)
  return match ? `v${match[1]}` : 'v26.0'
}
function normalizePhoneNumberId(value: unknown) { const id = String(value || '').trim(); return /^\d+$/.test(id) ? id : '' }
function normalizeDisplayPhone(value: unknown) { return String(value || '').replace(/\D/g, '') }

async function resolvePhoneIdFromWaba(token: string, graphVersion: string, wabaId: string, displayPhone: string, configuredPhoneId: string) {
  if (!wabaId) return null
  const endpoint = `https://graph.facebook.com/${graphVersion}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`
  const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } })
  const raw = await response.text(); let data: any = {}
  try { data = raw ? JSON.parse(raw) : {} } catch { data = { raw } }
  if (!response.ok) return { error: data?.error || { message: 'Unable to query WhatsApp Business Account phone numbers.', code: response.status } }
  const numbers = Array.isArray(data?.data) ? data.data : []
  const target = normalizeDisplayPhone(displayPhone)
  const exact = numbers.find((n: any) => normalizePhoneNumberId(n?.id) === configuredPhoneId)
  const byDisplay = target ? numbers.find((n: any) => normalizeDisplayPhone(n?.display_phone_number) === target) : null
  const match = byDisplay || exact
  return { phoneId: normalizePhoneNumberId(match?.id), displayPhone: match?.display_phone_number || null, verifiedName: match?.verified_name || null, numbers }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders })
  try {
    const url = Deno.env.get('SUPABASE_URL') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const authHeader = req.headers.get('Authorization') || ''
    const bearer = authHeader.replace(/^Bearer\s+/i, '')
    const internalKey = req.headers.get('x-centralhub-internal-key') || ''
    const internal = !!serviceKey && (internalKey === serviceKey || bearer === serviceKey)
    if (!bearer && !internal) return json({ error: 'Unauthorized: missing user session' }, 401)

    const body = await req.json()
    const { to, type = 'text', text, template, language = 'en_GB', storeId, conversationId, notificationId } = body
    if (!to) return json({ error: 'Recipient is required' }, 400)
    if (type !== 'template' && !String(text ?? '').trim()) return json({ error: 'Message text is required' }, 400)
    if (type === 'template' && !template?.name) return json({ error: 'Template name is required' }, 400)

    const admin = createClient(url, serviceKey)
    let user: any = null
    if (!internal) {
      const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || ''
      if (!publishableKey) return json({ error: 'Supabase publishable key is not configured on the function.' }, 500)
      const userClient = createClient(url, publishableKey, { global: { headers: { Authorization: `Bearer ${bearer}` } } })
      const result = await userClient.auth.getUser(); user = result.data?.user
      if (result.error || !user) return json({ error: 'Unauthorized: Supabase session token is invalid or expired.' }, 401)
    }

    let conversation: any = null
    if (conversationId) {
      const { data, error } = await admin.from('whatsapp_conversations')
        .select('store_id,channel_type,channel_id,external_contact_id')
        .eq('id', conversationId).maybeSingle()
      if (error) return json({ error: `Conversation lookup failed: ${error.message}` }, 500)
      conversation = data
    }
    const finalStoreId = storeId || conversation?.store_id
    if (!finalStoreId) return json({ error: 'Store ID missing' }, 400)

    if (!internal) {
      const metadata = { ...(user.app_metadata || {}), ...(user.user_metadata || {}) }
      let isAdmin = ['admin', 'superadmin', 'administrator'].includes(String(metadata.role || metadata.profile_role || '').toLowerCase())
      if (!isAdmin && /@(keralagroceries\.com|keralagroceries\.co\.uk)$/i.test(user.email || '')) isAdmin = true
      if (!isAdmin) { try { isAdmin = !!(await admin.rpc('is_admin', { user_id: user.id })).data } catch (_) {} }
      if (!isAdmin) {
        const { count } = await admin.from('store_staff').select('user_id', { count: 'exact', head: true }).eq('store_id', finalStoreId).eq('user_id', user.id)
        if (!count) return json({ error: 'Forbidden: you do not have access to send messages for this store.' }, 403)
      }
    }

    const channelType = String(conversation?.channel_type || 'whatsapp').toLowerCase()
    if (channelType === 'instagram' || channelType === 'facebook') {
      if (type !== 'text') return json({ error: `${channelType} conversations currently support text replies from this inbox.` }, 400)
      if (!conversation?.channel_id || !conversation?.external_contact_id) return json({ error: `${channelType} conversation is missing its channel mapping.` }, 409)
      const socialResponse = await fetch(`${url}/functions/v1/meta-social-send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: conversation.channel_id, to: conversation.external_contact_id, text: String(text || '').trim() }),
      })
      const raw = await socialResponse.text(); let social: any = {}
      try { social = raw ? JSON.parse(raw) : {} } catch { social = { error: raw } }
      if (!socialResponse.ok || social?.success !== true) {
        return json({ error: social?.error || `${channelType} message failed`, code: social?.code || null, channel_type: channelType }, socialResponse.status >= 400 ? socialResponse.status : 502)
      }
      return json({ success: true, message_id: social.message_id, channel_type: channelType }, 200)
    }

    if (conversationId && type !== 'template') {
      const { data: latestInbound, error: latestInboundError } = await admin.from('whatsapp_messages').select('created_at').eq('conversation_id', conversationId).eq('direction', 'inbound').order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!latestInboundError) {
        const lastCustomerMessageAt = latestInbound?.created_at ? new Date(latestInbound.created_at).getTime() : 0
        const windowExpired = !lastCustomerMessageAt || Date.now() - lastCustomerMessageAt > 24 * 60 * 60 * 1000
        if (windowExpired) return json({ error: 'WhatsApp customer-service window is closed. Ask the customer to send a message first, or send an approved WhatsApp template.', code: 'WHATSAPP_24H_WINDOW_EXPIRED', window_expired: true, last_customer_message_at: latestInbound?.created_at || null }, 409)
      } else console.warn('[WhatsApp Send] Could not check customer-service window:', latestInboundError.message)
    }

    const { data: channel, error: channelError } = await admin.from('whatsapp_channels').select('phone_number_id,waba_id,display_phone_number,business_name,access_token').eq('store_id', finalStoreId).maybeSingle()
    if (channelError) return json({ error: `WhatsApp channel lookup failed: ${channelError.message}` }, 500)
    const configuredPhoneId = normalizePhoneNumberId(channel?.phone_number_id || Deno.env.get('WHATSAPP_PHONE_NUMBER_ID'))
    const wabaId = String(channel?.waba_id || Deno.env.get('WHATSAPP_WABA_ID') || '').trim()
    const token = String(channel?.access_token || Deno.env.get('WHATSAPP_ACCESS_TOKEN') || '').trim()
    if (!configuredPhoneId) return json({ error: 'WhatsApp Phone Number ID is not configured or is invalid.' }, 400)
    if (!token) return json({ error: 'No WhatsApp access token is configured for this channel or Supabase environment.' }, 424)

    const graphVersion = normalizeGraphApiVersion(Deno.env.get('WHATSAPP_GRAPH_API_VERSION'))
    const payload: any = { messaging_product: 'whatsapp', recipient_type: 'individual', to }
    if (type === 'template') { payload.type = 'template'; payload.template = { name: template.name, language: { code: template.language || language }, components: template.components || [] } }
    else { payload.type = 'text'; payload.text = { preview_url: false, body: text } }

    async function sendViaMeta(phoneId: string) {
      const endpoint = `https://graph.facebook.com/${graphVersion}/${phoneId}/messages`
      const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const raw = await response.text(); let meta: any = {}
      try { meta = raw ? JSON.parse(raw) : {} } catch { meta = { raw } }
      return { response, meta, endpoint }
    }

    let attempt = await sendViaMeta(configuredPhoneId), phoneIdUsed = configuredPhoneId
    const metaCode = attempt.meta?.error?.code
    if (!attempt.response.ok && (metaCode === 100 || metaCode === 2500) && wabaId) {
      const resolved = await resolvePhoneIdFromWaba(token, graphVersion, wabaId, channel?.display_phone_number, configuredPhoneId)
      if (resolved?.phoneId && resolved.phoneId !== configuredPhoneId) { attempt = await sendViaMeta(resolved.phoneId); phoneIdUsed = resolved.phoneId }
      else if (resolved?.error) {
        const e = resolved.error
        return json({ error: `WhatsApp credential/path mismatch: Meta could not resolve the configured phone number for this WABA. ${e.message || ''}`.trim(), meta_code: e.code ?? null, meta_subcode: e.error_subcode ?? null, meta_status: 400, configured_phone_number_id: configuredPhoneId, waba_id: wabaId, hint: 'The WhatsApp access token must belong to the Meta app/system user that has access to this WABA and phone number.' }, 400)
      }
    }

    if (!attempt.response.ok) {
      const e = attempt.meta?.error || {}, message = e.message || e.error_user_msg || 'Meta rejected the WhatsApp message.', code = e.code ?? e.error_subcode ?? attempt.response.status
      if (notificationId) await admin.from('order_whatsapp_notifications').update({ status: 'failed', error_message: `Meta ${code}: ${message}`, updated_at: new Date().toISOString() }).eq('id', notificationId)
      return json({ error: `WhatsApp API Error: ${message}`, meta_code: e.code ?? null, meta_subcode: e.error_subcode ?? null, meta_status: attempt.response.status }, attempt.response.status >= 400 && attempt.response.status <= 599 ? attempt.response.status : 502)
    }

    const messageId = attempt.meta?.messages?.[0]?.id
    if (!messageId) return json({ error: 'Meta returned success without a WhatsApp message ID', meta_response: attempt.meta }, 502)
    if (notificationId) await admin.from('order_whatsapp_notifications').update({ status: 'sent', wa_message_id: messageId, error_message: null, updated_at: new Date().toISOString() }).eq('id', notificationId)
    try { await admin.from('whatsapp_outbound_log').insert({ wa_message_id: messageId, store_id: finalStoreId, recipient_phone: to, template_name: type === 'template' ? template?.name : null, status: 'sent' }) } catch (e: any) { console.error('[WhatsApp Send] outbound log:', e?.message || e) }
    return json({ success: true, message_id: messageId, graph_api_version: graphVersion, phone_number_id: phoneIdUsed, channel_type: 'whatsapp' }, 200)
  } catch (e: any) {
    console.error('[WhatsApp Send] fatal:', e?.message || e)
    return json({ error: `Internal Server Error: ${e?.message || e}` }, 500)
  }
})
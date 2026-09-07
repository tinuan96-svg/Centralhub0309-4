import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function verifyMetaSignature(req: Request, payload: string, appSecret: string): Promise<boolean> {
  const signature = req.headers.get('x-hub-signature-256')
  if (!signature) return false
  const signatureHash = signature.split('sha256=')[1]
  if (!signatureHash) return false
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const expectedHash = Array.from(new Uint8Array(signed)).map(b => b.toString(16).padStart(2, '0')).join('')
  return expectedHash === signatureHash
}

async function notifyCentralHubPhonePush(params: { title: string; message: string; url: string; category: string; metadata?: Record<string, unknown> }) {
  const siteUrl = (Deno.env.get('CENTRALHUB_SITE_URL') || 'https://centralhub.network').replace(/\/$/, '')
  const pushSecret = Deno.env.get('CENTRALHUB_PUSH_API_SECRET') || ''
  if (!pushSecret) return

  try {
    const response = await fetch(`${siteUrl}/api/push/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pushSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: params.title,
        message: params.message,
        url: params.url,
        category: params.category,
        severity: 'info',
        metadata: { source: 'whatsapp-webhook', ...(params.metadata || {}) },
      }),
    })
    if (!response.ok) console.error('[WhatsApp Webhook] Phone push failed:', response.status, await response.text().catch(() => ''))
  } catch (error: any) {
    console.error('[WhatsApp Webhook] Phone push request failed:', error?.message || error)
  }
}

async function createFallbackEscalation(db: any, params: { storeId: string; conversationId: string; contactId: string; message: string }) {
  try {
    const { data: existing } = await db.from('support_tickets').select('id').eq('store_id', params.storeId).eq('conversation_id', params.conversationId).in('status', ['open', 'assigned', 'in_progress', 'waiting_customer', 'waiting_internal']).limit(1).maybeSingle()
    if (existing) return existing.id
    const { data: contact } = await db.from('whatsapp_contacts').select('customer_id, display_name, phone_number').eq('id', params.contactId).maybeSingle()
    const { data: ticket, error } = await db.from('support_tickets').insert({
      store_id: params.storeId, customer_id: contact?.customer_id || null, contact_id: params.contactId, conversation_id: params.conversationId,
      category: 'other', priority: 'urgent', status: 'open', subject: 'AI response failed — human assistance required',
      description: `The customer sent: ${params.message}`,
      ai_summary: 'Customer care AI could not complete the response. Please review the conversation and assist the customer.',
    }).select('id').single()
    if (error) throw error
    await db.from('whatsapp_conversations').update({ status: 'waiting', handling_mode: 'AI_DRAFT', updated_at: new Date().toISOString() }).eq('id', params.conversationId)
    await db.from('system_notifications').insert({
      user_id: null, store_id: params.storeId, title: 'AI customer response failed',
      message: `${contact?.display_name || contact?.phone_number || 'Customer'} needs immediate human assistance because the AI could not complete a response.`,
      severity: 'critical', category: 'support', action_url: `/customer-care/tickets?ticket=${ticket.id}`,
      metadata: { type: 'customer_support_ai_failure', ticket_id: ticket.id, conversation_id: params.conversationId, contact_id: params.contactId },
    })
    return ticket.id
  } catch (error: any) {
    console.error('[AI Fallback Escalation Error]', error?.message || error)
    return null
  }
}

async function processCustomerCareAI(params: { message: string; conversationId: string; storeId: string; contactId: string; customerPhone: string; from: string }) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const db = createClient(supabaseUrl, serviceRoleKey)
  try {
    const [{ data: conversation }, { data: settings }] = await Promise.all([
      db.from('whatsapp_conversations').select('handling_mode').eq('id', params.conversationId).maybeSingle(),
      db.from('customer_care_settings').select('ai_enabled, ai_auto_reply, default_handling_mode').eq('store_id', params.storeId).maybeSingle(),
    ])
    const handlingMode = conversation?.handling_mode || settings?.default_handling_mode || 'AI'
    const aiEnabled = settings?.ai_enabled ?? true
    const autoReply = settings?.ai_auto_reply ?? true
    if (!aiEnabled || handlingMode === 'HUMAN') return
    console.log(`[AI Flow] Starting response for conversation ${params.conversationId}; store=${params.storeId}; mode=${handlingMode}; autoReply=${autoReply}`)
    const aiRes = await fetch(`${supabaseUrl}/functions/v1/customer-care-ai`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: params.message, conversationId: params.conversationId, storeId: params.storeId, contactId: params.contactId, customerPhone: params.customerPhone })
    })
    const aiText = await aiRes.text()
    if (!aiRes.ok) throw new Error(`customer-care-ai ${aiRes.status}: ${aiText.slice(0, 500)}`)
    const aiData = JSON.parse(aiText)
    if (!aiData.reply) { if (aiData.disabled) return; throw new Error('customer-care-ai returned no reply') }
    if (handlingMode === 'AI_DRAFT' || !autoReply) {
      await db.from('whatsapp_conversations').update({ status: 'waiting', updated_at: new Date().toISOString() }).eq('id', params.conversationId)
      return
    }
    const sendRes = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: params.from, text: aiData.reply, conversationId: params.conversationId, storeId: params.storeId })
    })
    const sendText = await sendRes.text()
    let sendData: any = {}
    try { sendData = JSON.parse(sendText) } catch {}
    const sendSuccess = sendRes.ok && (sendData?.success === true || sendData?.message_id != null)
    const { error: messageLogError } = await db.from('whatsapp_messages').insert({
      conversation_id: params.conversationId, direction: 'outbound', message_type: 'text', message_text: aiData.reply,
      status: sendSuccess ? 'sent' : 'failed', wa_message_id: sendData?.message_id || null, ai_generated: true,
      ai_model: Deno.env.get('OPENAI_MODEL_CUSTOMER_CARE') || Deno.env.get('OPENAI_MODEL_DEFAULT') || 'gpt-4o'
    })
    if (messageLogError) console.error('[AI Flow] Message log error:', messageLogError.message)
    if (!sendSuccess) throw new Error(`whatsapp-send ${sendRes.status}: ${sendText.slice(0, 500)}`)
    console.log(`[AI Flow] Successfully sent AI response for conversation ${params.conversationId}`)
  } catch (error: any) {
    console.error('[AI Flow Error]', error?.message || error)
    await createFallbackEscalation(db, { storeId: params.storeId, conversationId: params.conversationId, contactId: params.contactId, message: params.message })
  }
}

serve(async (req) => {
  const { method } = req
  const url = new URL(req.url)
  if (method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token) {
      const envToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN')
      if (envToken && token === envToken) return new Response(challenge, { status: 200 })
      const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
      const { data: channel } = await db.from('whatsapp_channels').select('id').eq('verify_token', token).maybeSingle()
      if (channel) return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  let eventRowId: string | null = null
  try {
    const rawBody = await req.text()
    const payload = JSON.parse(rawBody)
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const change = payload.entry?.[0]?.changes?.[0]
    const value = change?.value
    const phoneNumberId = value?.metadata?.phone_number_id
    const displayPhoneNumber = value?.metadata?.display_phone_number
    let storeId: string | null = null
    let channel: any = null

    if (phoneNumberId) {
      const { data, error } = await db.from('whatsapp_channels').select('store_id, app_secret, phone_number_id, display_phone_number').eq('phone_number_id', phoneNumberId).maybeSingle()
      if (error) console.error('[WhatsApp Webhook] Channel lookup:', error.message)
      channel = data
    }
    if (!channel && displayPhoneNumber) {
      const { data, error } = await db.from('whatsapp_channels').select('store_id, app_secret, phone_number_id, display_phone_number').eq('display_phone_number', displayPhoneNumber).eq('status', 'active').maybeSingle()
      if (error) console.error('[WhatsApp Webhook] Display-number fallback lookup:', error.message)
      channel = data
      if (channel) console.warn(`[WhatsApp Webhook] Phone ID ${phoneNumberId} not mapped; matched active channel by display number ${displayPhoneNumber}`)
    }

    storeId = channel?.store_id || null
    // If a channel is known, Meta signatures are mandatory. Do not silently accept
    // an unsigned request for a mapped number.
    if (channel) {
      if (!channel.app_secret) return new Response('Webhook app secret is not configured', { status: 500 })
      if (!(await verifyMetaSignature(req, rawBody, channel.app_secret))) return new Response('Invalid signature', { status: 401 })
    }

    let eventId = 'unknown'
    if (value?.messages?.[0]) eventId = value.messages[0].id
    else if (value?.statuses?.[0]) eventId = `status_${value.statuses[0].id}_${value.statuses[0].status}`
    const { data: existing } = await db.from('whatsapp_webhook_events').select('id').eq('event_id', eventId).maybeSingle()
    if (existing) return new Response(JSON.stringify({ status: 'duplicate' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { data: eventRow, error: eventInsertError } = await db.from('whatsapp_webhook_events').insert({ event_id: eventId, event_type: change?.field || 'unknown', payload, processing_status: 'received' }).select('id').single()
    if (eventInsertError) throw eventInsertError
    eventRowId = eventRow.id

    if (value?.messages?.[0]) {
      const msg = value.messages[0]
      const from = msg.from
      if (!storeId) throw new Error(`No store mapped to WhatsApp phone_number_id ${phoneNumberId || 'unknown'} (display ${displayPhoneNumber || 'unknown'})`)
      const profileName = value.contacts?.[0]?.profile?.name || 'User'
      const { data: contact, error: contactError } = await db.from('whatsapp_contacts').upsert({ store_id: storeId, phone_number: from, display_name: profileName, last_message_at: new Date().toISOString() }, { onConflict: 'store_id, phone_number' }).select('id').single()
      if (contactError) throw contactError
      const { data: settings } = await db.from('customer_care_settings').select('default_handling_mode').eq('store_id', storeId).maybeSingle()
      const defaultMode = settings?.default_handling_mode || 'AI'
      const { data: conv, error: convError } = await db.from('whatsapp_conversations').upsert({ store_id: storeId, contact_id: contact.id, status: 'open', handling_mode: defaultMode, last_message_at: new Date().toISOString() }, { onConflict: 'contact_id' }).select('id, handling_mode').single()
      if (convError) throw convError
      const { error: messageError } = await db.from('whatsapp_messages').insert({ conversation_id: conv.id, wa_message_id: msg.id, direction: 'inbound', message_type: msg.type, message_text: msg.text?.body || (msg.type !== 'text' ? `[${msg.type.toUpperCase()}]` : null), media_url: msg.image?.id || msg.document?.id || msg.audio?.id || msg.voice?.id || null, sender_phone: from, status: 'received' })
      if (messageError) throw messageError

      await notifyCentralHubPhonePush({
        title: 'You have a message from customer',
        message: `${profileName} sent a new WhatsApp message.`,
        url: `/customer-care/inbox?conversation=${encodeURIComponent(conv.id)}`,
        category: 'customer_message',
        metadata: { store_id: storeId, conversation_id: conv.id, contact_id: contact.id, message_id: msg.id },
      })

      if (msg.type === 'text') {
        // AI can involve multiple database calls plus OpenAI. Keep the Meta webhook
        // response fast and let Supabase finish the AI work in the background.
        const aiTask = processCustomerCareAI({ message: msg.text?.body || '', conversationId: conv.id, storeId, contactId: contact.id, customerPhone: from, from })
        if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
          EdgeRuntime.waitUntil(aiTask)
        } else {
          await aiTask
        }
      }
    }

    if (value?.statuses?.[0]) {
      const statusUpdate = value.statuses[0]
      const status = statusUpdate.status
      const waId = statusUpdate.id
      await db.from('whatsapp_messages').update({ status }).eq('wa_message_id', waId)
      const updateData: any = { status }
      if (status === 'delivered') updateData.delivered_at = new Date().toISOString()
      if (status === 'read') updateData.read_at = new Date().toISOString()
      if (status === 'failed') { updateData.failed_at = new Date().toISOString(); updateData.error_code = statusUpdate.errors?.[0]?.code; updateData.error_message = statusUpdate.errors?.[0]?.title }
      await db.from('whatsapp_outbound_log').update(updateData).eq('wa_message_id', waId)
      const notifUpdateData: any = { status, updated_at: new Date().toISOString() }
      if (status === 'failed') notifUpdateData.error_message = statusUpdate.errors?.[0]?.title || 'Meta reported delivery failure'
      await db.from('order_whatsapp_notifications').update(notifUpdateData).eq('wa_message_id', waId)
    }

    if (eventRowId) await db.from('whatsapp_webhook_events').update({ processing_status: 'processed', processed_at: new Date().toISOString(), error_message: null }).eq('id', eventRowId)
    return new Response(JSON.stringify({ status: 'success' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error: any) {
    console.error('[WhatsApp Webhook Error]', error?.message || error)
    try {
      if (eventRowId) {
        const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
        await db.from('whatsapp_webhook_events').update({ processing_status: 'failed', processed_at: new Date().toISOString(), error_message: error?.message || String(error) }).eq('id', eventRowId)
      }
    } catch (statusError: any) { console.error('[WhatsApp Webhook] Failed to persist event error state:', statusError?.message || statusError) }
    return new Response(error?.message || 'Webhook error', { status: 400, headers: corsHeaders })
  }
})

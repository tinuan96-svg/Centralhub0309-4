import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const MALLUSPICES_STORE_ID = '00000000-0000-0000-0000-000000000001'
const MALLUSPICES_SMS_RELAY = 'https://ixzbnifmsxunlarhfimp.supabase.co/functions/v1/login-otp-sms-internal'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

async function hashOTP(otp: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(otp))
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function generateSecureOTP(): string {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return String(100000 + (bytes[0] % 900000))
}

function getSiteUrl(req: Request): string {
  const configured = Deno.env.get('SITE_URL') || Deno.env.get('NEXT_PUBLIC_SITE_URL') || ''
  if (configured) return configured.replace(/\/$/, '')
  const origin = req.headers.get('origin') || ''
  if (/^https?:\/\//i.test(origin)) return origin.replace(/\/$/, '')
  return 'http://localhost:3000'
}

async function resolveMalluSpicesRelaySecret(supabase: any): Promise<string> {
  const { data } = await supabase.from('app_config').select('value').eq('key', 'malluspices_sync_secret').maybeSingle()
  const dbSecret = String(data?.value || '').trim()
  if (dbSecret) return dbSecret
  return (Deno.env.get('CENTRALHUB_PUSH_API_SECRET') || Deno.env.get('CENTRALHUB_WEBHOOK_SECRET') || '').trim()
}

async function sendMalluSpicesSmsCopy(supabase: any, storeId: string, phoneNumber: string, otp: string, challengeId: string): Promise<{ sent: boolean; status: string }> {
  if (storeId !== MALLUSPICES_STORE_ID) return { sent: false, status: 'not_applicable' }
  const secret = await resolveMalluSpicesRelaySecret(supabase)
  if (!secret) return { sent: false, status: 'secret_missing' }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 13000)
    try {
      const response = await fetch(MALLUSPICES_SMS_RELAY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ phoneNumber, otp, challengeId }),
        signal: controller.signal,
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok && data?.success === true) return { sent: true, status: 'sent' }
      if (response.status === 401) return { sent: false, status: 'relay_unauthorized' }
      if (response.status === 503) return { sent: false, status: 'relay_not_configured' }
      if (response.status === 502) return { sent: false, status: 'provider_rejected' }
      return { sent: false, status: `relay_${response.status}` }
    } finally {
      clearTimeout(timer)
    }
  } catch (error) {
    console.warn('[WhatsApp OTP] SMS copy failed', error instanceof Error ? error.message : 'unknown')
    return { sent: false, status: 'relay_transport_error' }
  }
}

async function sendWhatsAppInternal(supabaseUrl: string, serviceKey: string, payload: Record<string, unknown>) {
  const response = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
      'x-centralhub-internal-key': serviceKey,
    },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({}))
  return { response, data }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders, status: 200 })
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405)

  try {
    const { action, phoneNumber, storeId, requestId, otp, userAgent, ip } = await req.json()
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, serviceKey)

    if (action === 'generate') {
      if (!phoneNumber || !storeId) return json({ error: 'Phone number and Store ID required' }, 400)

      const { data: mapping, error: mapErr } = await supabase
        .from('whatsapp_event_template_mappings')
        .select('*, template:whatsapp_template_registry(*)')
        .eq('store_id', storeId)
        .eq('event_key', 'account.login.otp')
        .eq('enabled', true)
        .maybeSingle()
      if (mapErr || !mapping?.template) return json({ error: 'WhatsApp login is not configured for this store.' }, 400)

      const { data: customer } = await supabase.from('customers').select('id, name').eq('phone', phoneNumber).eq('store_id', storeId).maybeSingle()
      const { count: recentCount } = await supabase
        .from('whatsapp_auth_challenges')
        .select('id', { count: 'exact', head: true })
        .eq('phone_number', phoneNumber)
        .eq('store_id', storeId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
      if ((recentCount ?? 0) >= 3) return json({ error: 'Too many active requests. Please wait before requesting another code.' }, 429)

      await supabase.from('whatsapp_auth_challenges').update({ status: 'invalidated' }).eq('phone_number', phoneNumber).eq('store_id', storeId).eq('status', 'pending')

      const generatedOtp = generateSecureOTP()
      const otpHash = await hashOTP(generatedOtp)
      const { data: challenge, error: challengeError } = await supabase.from('whatsapp_auth_challenges').insert({
        store_id: storeId,
        customer_id: customer?.id ?? null,
        phone_number: phoneNumber,
        purpose: 'login',
        otp_hash: otpHash,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        request_ip: ip,
        user_agent: userAgent,
      }).select('id').single()
      if (challengeError) throw challengeError

      const { response: waResponse, data: sendRes } = await sendWhatsAppInternal(supabaseUrl, serviceKey, {
        to: phoneNumber,
        type: 'template',
        template: {
          name: mapping.template.meta_template_name,
          language: mapping.template.language || 'en_GB',
          components: [
            { type: 'body', parameters: [{ type: 'text', text: generatedOtp }] },
            { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: generatedOtp }] },
          ],
        },
        storeId,
        notificationId: null,
      })

      if (!waResponse.ok || !sendRes?.success || !sendRes?.message_id) {
        const message = String(sendRes?.error || 'WhatsApp OTP could not be sent.')
        await supabase.from('whatsapp_auth_challenges').update({ status: 'failed' }).eq('id', challenge.id)
        console.error('[WhatsApp OTP] WhatsApp send failed', waResponse.status, message)
        return json({ error: message, upstream_status: waResponse.status }, 502)
      }

      await supabase.from('whatsapp_auth_challenges').update({ whatsapp_message_id: sendRes.message_id }).eq('id', challenge.id)
      const sms = await sendMalluSpicesSmsCopy(supabase, String(storeId), String(phoneNumber), generatedOtp, challenge.id)

      return json({
        success: true,
        request_id: challenge.id,
        expires_in: 300,
        masked_phone: String(phoneNumber).replace(/.(?=.{4})/g, '*'),
        delivery: { whatsapp: true, sms: sms.sent, sms_status: sms.status },
      })
    }

    if (action === 'verify' || action === 'verify_external') {
      if (!requestId || !otp || !storeId) return json({ error: 'Request ID, store ID and OTP are required' }, 400)
      if (!/^\d{6}$/.test(String(otp))) return json({ error: 'Invalid OTP code' }, 400)

      const { data: challenge, error: challengeError } = await supabase.from('whatsapp_auth_challenges').select('*').eq('id', requestId).eq('store_id', storeId).maybeSingle()
      if (challengeError) throw challengeError
      if (!challenge) return json({ error: 'Challenge not found' }, 404)
      if (challenge.status !== 'pending' || challenge.consumed_at) return json({ error: 'OTP already used or invalid' }, 400)
      if (new Date(challenge.expires_at) < new Date()) {
        await supabase.from('whatsapp_auth_challenges').update({ status: 'expired' }).eq('id', requestId)
        return json({ error: 'OTP expired' }, 400)
      }

      const attemptCount = Number(challenge.attempt_count ?? 0)
      const maxAttempts = Number(challenge.max_attempts ?? 5)
      if (attemptCount >= maxAttempts) {
        await supabase.from('whatsapp_auth_challenges').update({ status: 'failed' }).eq('id', requestId)
        return json({ error: 'Too many invalid attempts. Please request a new code.' }, 429)
      }

      const providedHash = await hashOTP(String(otp))
      if (providedHash !== challenge.otp_hash) {
        const nextAttempts = attemptCount + 1
        await supabase.from('whatsapp_auth_challenges').update({ attempt_count: nextAttempts, status: nextAttempts >= maxAttempts ? 'failed' : 'pending' }).eq('id', requestId).eq('status', 'pending')
        return json({ error: nextAttempts >= maxAttempts ? 'Too many invalid attempts. Please request a new code.' : 'Invalid OTP code' }, nextAttempts >= maxAttempts ? 429 : 401)
      }

      await supabase.from('whatsapp_auth_challenges').update({ status: 'verified', consumed_at: new Date().toISOString() }).eq('id', requestId).eq('status', 'pending')

      if (action === 'verify_external') return json({ success: true, request_id: challenge.id, verified_phone: challenge.phone_number, purpose: challenge.purpose })

      const { data: customer } = await supabase.from('customers').select('email').eq('phone', challenge.phone_number).eq('store_id', storeId).maybeSingle()
      if (!customer?.email) return json({ error: 'No account linked to this number.' }, 400)

      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: customer.email,
        options: { redirectTo: `${getSiteUrl(req)}/dashboard` },
      })
      if (linkError) throw linkError
      return json({ success: true, session_tokens: linkData.properties, user: linkData.user })
    }

    return json({ error: 'Invalid Action' }, 400)
  } catch (err: any) {
    console.error('[WhatsApp OTP Error]', err?.message || err)
    return json({ error: err?.message || 'Internal Server Error' }, 500)
  }
})

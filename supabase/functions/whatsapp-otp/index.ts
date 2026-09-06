import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

async function hashOTP(otp: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(otp)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders, status: 200 })
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405)

  try {
    const { action, phoneNumber, storeId, requestId, otp, userAgent, ip } = await req.json()
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    if (action === 'generate') {
      if (!phoneNumber || !storeId) return json({ error: 'Phone number and Store ID required' }, 400)

      const { data: mapping, error: mapErr } = await supabase
        .from('whatsapp_event_template_mappings')
        .select('*, template:whatsapp_template_registry(*)')
        .eq('store_id', storeId)
        .eq('event_key', 'account.login.otp')
        .eq('enabled', true)
        .maybeSingle()

      if (mapErr || !mapping?.template) {
        return json({ error: 'WhatsApp login is not configured for this store.' }, 400)
      }

      const { data: customer } = await supabase
        .from('customers')
        .select('id, name')
        .eq('phone', phoneNumber)
        .eq('store_id', storeId)
        .maybeSingle()

      // Limit active challenges before creating another one.
      const { count: recentCount } = await supabase
        .from('whatsapp_auth_challenges')
        .select('id', { count: 'exact', head: true })
        .eq('phone_number', phoneNumber)
        .eq('store_id', storeId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())

      if ((recentCount ?? 0) >= 3) {
        return json({ error: 'Too many active requests. Please wait before requesting another code.' }, 429)
      }

      await supabase
        .from('whatsapp_auth_challenges')
        .update({ status: 'invalidated' })
        .eq('phone_number', phoneNumber)
        .eq('store_id', storeId)
        .eq('status', 'pending')

      const generatedOtp = generateSecureOTP()
      const otpHash = await hashOTP(generatedOtp)

      const { data: challenge, error: challengeError } = await supabase
        .from('whatsapp_auth_challenges')
        .insert({
          store_id: storeId,
          customer_id: customer?.id ?? null,
          phone_number: phoneNumber,
          purpose: 'login',
          otp_hash: otpHash,
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          request_ip: ip,
          user_agent: userAgent,
        })
        .select('id')
        .single()

      if (challengeError) throw challengeError

      const { data: sendRes, error: sendError } = await supabase.functions.invoke('whatsapp-send', {
        body: {
          to: phoneNumber,
          type: 'template',
          template: {
            name: mapping.template.meta_template_name,
            language: mapping.template.language || 'en_GB',
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: generatedOtp }],
              },
              {
                type: 'button',
                sub_type: 'url',
                index: 0,
                parameters: [{ type: 'text', text: generatedOtp }],
              },
            ],
          },
          storeId,
          notificationId: null,
        },
      })

      if (sendError || !sendRes?.success || !sendRes?.message_id) {
        const message = sendError?.message || sendRes?.error || 'WhatsApp OTP could not be sent.'
        await supabase.from('whatsapp_auth_challenges').update({ status: 'failed' }).eq('id', challenge.id)
        return json({ error: message }, 502)
      }

      await supabase
        .from('whatsapp_auth_challenges')
        .update({ whatsapp_message_id: sendRes.message_id })
        .eq('id', challenge.id)

      // Never return the OTP to the browser. The only delivery channel is WhatsApp.
      return json({
        success: true,
        request_id: challenge.id,
        expires_in: 300,
        masked_phone: String(phoneNumber).replace(/.(?=.{4})/g, '*'),
      })
    }

    if (action === 'verify') {
      if (!requestId || !otp || !storeId) return json({ error: 'Request ID, store ID and OTP are required' }, 400)
      if (!/^\d{6}$/.test(String(otp))) return json({ error: 'Invalid OTP code' }, 400)

      const { data: challenge, error: challengeError } = await supabase
        .from('whatsapp_auth_challenges')
        .select('*')
        .eq('id', requestId)
        .eq('store_id', storeId)
        .maybeSingle()

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
        await supabase
          .from('whatsapp_auth_challenges')
          .update({
            attempt_count: nextAttempts,
            status: nextAttempts >= maxAttempts ? 'failed' : 'pending',
          })
          .eq('id', requestId)
          .eq('status', 'pending')
        return json({
          error: nextAttempts >= maxAttempts ? 'Too many invalid attempts. Please request a new code.' : 'Invalid OTP code',
        }, nextAttempts >= maxAttempts ? 429 : 401)
      }

      await supabase
        .from('whatsapp_auth_challenges')
        .update({ status: 'verified', consumed_at: new Date().toISOString() })
        .eq('id', requestId)
        .eq('status', 'pending')

      const { data: customer } = await supabase
        .from('customers')
        .select('email')
        .eq('phone', challenge.phone_number)
        .eq('store_id', storeId)
        .maybeSingle()

      if (!customer?.email) return json({ error: 'No account linked to this number.' }, 400)

      // generateLink creates a one-time Auth OTP/link. We use the returned email OTP
      // to establish the browser session after the WhatsApp factor has been verified.
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: customer.email,
        options: { redirectTo: `${getSiteUrl(req)}/dashboard` },
      })

      if (linkError) throw linkError

      return json({
        success: true,
        session_tokens: linkData.properties,
        user: linkData.user,
      })
    }

    return json({ error: 'Invalid Action' }, 400)
  } catch (err: any) {
    console.error('[WhatsApp OTP Error]', err?.message || err)
    return json({ error: err?.message || 'Internal Server Error' }, 500)
  }
})

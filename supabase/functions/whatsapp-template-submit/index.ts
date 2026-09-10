import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-whatsapp-retry-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

async function parseResponse(response: Response) {
  const raw = await response.text()
  try { return raw ? JSON.parse(raw) : {} } catch { return { raw } }
}

async function authorize(req: Request, db: any, serviceRoleKey: string) {
  const cronSecret = String(req.headers.get('x-whatsapp-retry-secret') || '').trim()
  if (cronSecret) {
    const { data, error } = await db.rpc('verify_integration_cron_secret', {
      p_name: 'whatsapp_retry_cron_secret',
      p_secret: cronSecret,
    })
    if (!error && data === true) return { ok: true, mode: 'cron' }
  }

  const token = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, mode: 'none' }
  if (token === serviceRoleKey) return { ok: true, mode: 'service_role' }

  const { data: userData, error: userError } = await db.auth.getUser(token)
  const user = userData?.user
  if (userError || !user) return { ok: false, mode: 'invalid_user' }

  const { data: profile } = await db.from('user_profiles')
    .select('profile_role,is_active')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.profile_role === 'admin' && profile?.is_active !== false) return { ok: true, mode: 'admin' }
  return { ok: false, mode: 'forbidden' }
}

async function resolveAppId(token: string, graphVersion: string) {
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/app?fields=id,name`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await parseResponse(response)
  if (!response.ok || !data?.id) {
    throw new Error(data?.error?.message || 'Unable to resolve the Meta app for the WhatsApp token')
  }
  return String(data.id)
}

async function uploadTemplateHeader(sourceUrl: string, token: string, graphVersion: string) {
  const imageResponse = await fetch(sourceUrl, { redirect: 'follow' })
  if (!imageResponse.ok) throw new Error(`Unable to download template header image (${imageResponse.status})`)

  const mime = String(imageResponse.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (!['image/jpeg', 'image/png'].includes(mime)) {
    throw new Error(`Template header must be JPEG or PNG; received ${mime || 'unknown content type'}`)
  }
  const bytes = new Uint8Array(await imageResponse.arrayBuffer())
  if (!bytes.byteLength) throw new Error('Template header image is empty')

  const appId = await resolveAppId(token, graphVersion)
  const filename = mime === 'image/png' ? 'malluspices-template-header.png' : 'malluspices-template-header.jpg'
  const sessionUrl = new URL(`https://graph.facebook.com/${graphVersion}/${appId}/uploads`)
  sessionUrl.searchParams.set('file_length', String(bytes.byteLength))
  sessionUrl.searchParams.set('file_type', mime)
  sessionUrl.searchParams.set('file_name', filename)

  const sessionResponse = await fetch(sessionUrl.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const session = await parseResponse(sessionResponse)
  if (!sessionResponse.ok || !session?.id) {
    throw new Error(session?.error?.message || 'Meta resumable upload session could not be created')
  }

  const uploadResponse = await fetch(`https://graph.facebook.com/${graphVersion}/${session.id}`, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${token}`,
      'Content-Type': mime,
      file_offset: '0',
    },
    body: bytes,
  })
  const upload = await parseResponse(uploadResponse)
  if (!uploadResponse.ok || !upload?.h) {
    throw new Error(upload?.error?.message || 'Template header image upload failed')
  }
  return String(upload.h)
}

async function prepareComponents(components: any[], token: string, graphVersion: string) {
  const prepared = JSON.parse(JSON.stringify(Array.isArray(components) ? components : []))
  for (const component of prepared) {
    if (String(component?.type || '').toUpperCase() !== 'HEADER' || String(component?.format || '').toUpperCase() !== 'IMAGE') continue
    const sourceUrl = String(component?.example_image_url || '').trim()
    delete component.example_image_url
    if (sourceUrl) {
      const handle = await uploadTemplateHeader(sourceUrl, token, graphVersion)
      component.example = { ...(component.example || {}), header_handle: [handle] }
    }
    if (!Array.isArray(component?.example?.header_handle) || !component.example.header_handle.length) {
      throw new Error('IMAGE header template requires an uploaded example header handle')
    }
  }
  return prepared
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Supabase service configuration missing' }, 500)

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const access = await authorize(req, supabase, serviceRoleKey)
    if (!access.ok) return json({ error: 'Unauthorized' }, 401)

    const { templateId } = await req.json().catch(() => ({}))
    if (!templateId) return json({ error: 'Template ID is required' }, 400)

    const { data: template, error: templateError } = await supabase
      .from('whatsapp_templates')
      .select('*, channel:whatsapp_channels(id,waba_id,access_token,store_id,status)')
      .eq('id', templateId)
      .single()

    if (templateError || !template || !template.channel?.access_token || !template.channel?.waba_id) {
      return json({ error: 'Template or channel configuration not found' }, 404)
    }
    if (template.channel.status && !['active', 'connected'].includes(String(template.channel.status).toLowerCase())) {
      return json({ error: 'WhatsApp channel is not active' }, 409)
    }

    const currentStatus = String(template.status || '').toUpperCase()
    if (template.meta_template_id && ['PENDING', 'APPROVED'].includes(currentStatus)) {
      return json({ success: true, already_submitted: true, meta_id: template.meta_template_id, status: currentStatus, auth_mode: access.mode })
    }

    const graphVersion = String(Deno.env.get('WHATSAPP_GRAPH_API_VERSION') || 'v26.0').replace(/^v/i, 'v')
    const metaUrl = `https://graph.facebook.com/${graphVersion}/${template.channel.waba_id}/message_templates`
    const components = await prepareComponents(template.components, template.channel.access_token, graphVersion)
    const payload = {
      name: template.name,
      category: template.category,
      language: template.language,
      components,
    }

    const metaRes = await fetch(metaUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${template.channel.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const metaData = await parseResponse(metaRes)

    if (!metaRes.ok) {
      return json({
        error: metaData?.error?.message || 'Failed to submit template to Meta',
        details: metaData?.error || null,
      }, metaRes.status)
    }

    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('whatsapp_templates')
      .update({
        meta_template_id: metaData.id || template.meta_template_id || null,
        status: 'PENDING',
        rejection_reason: null,
        updated_at: now,
        submitted_at: now,
      })
      .eq('id', templateId)
    if (updateError) throw updateError

    const { data: registry } = await supabase
      .from('whatsapp_template_registry')
      .select('id')
      .eq('store_id', template.channel.store_id)
      .eq('meta_template_name', template.name)
      .eq('language', template.language)
      .maybeSingle()
    if (registry?.id) {
      await supabase.from('whatsapp_template_registry').update({
        meta_template_id: String(metaData.id || ''),
        status: 'pending',
      }).eq('id', registry.id)
    }

    return json({ success: true, meta_id: metaData.id || null, graph_api_version: graphVersion, auth_mode: access.mode })
  } catch (error: any) {
    console.error('[WhatsApp Submit] Error:', error?.message || error)
    return json({ error: error?.message || 'Template submission failed' }, 500)
  }
})

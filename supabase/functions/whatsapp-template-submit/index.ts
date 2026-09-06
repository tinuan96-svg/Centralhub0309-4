import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const { templateId } = await req.json().catch(() => ({}))
    if (!templateId) return json({ error: 'Template ID is required' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )

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

    const graphVersion = String(Deno.env.get('WHATSAPP_GRAPH_API_VERSION') || 'v26.0').replace(/^v/i, 'v')
    const metaUrl = `https://graph.facebook.com/${graphVersion}/${template.channel.waba_id}/message_templates`
    const payload = {
      name: template.name,
      category: template.category,
      language: template.language,
      components: template.components,
    }

    const metaRes = await fetch(metaUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${template.channel.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const raw = await metaRes.text()
    let metaData: any = {}
    try { metaData = raw ? JSON.parse(raw) : {} } catch { metaData = { raw } }

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

    return json({ success: true, meta_id: metaData.id || null, graph_api_version: graphVersion })
  } catch (error: any) {
    console.error('[WhatsApp Submit] Error:', error?.message || error)
    return json({ error: error?.message || 'Template submission failed' }, 500)
  }
})

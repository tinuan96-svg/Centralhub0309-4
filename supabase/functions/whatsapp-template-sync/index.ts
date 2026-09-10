import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-whatsapp-retry-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

function variablesFromComponents(components: any[]): string[] {
  const body = components?.find((c: any) => String(c?.type || '').toUpperCase() === 'BODY')
  const text = String(body?.text || '')
  const indexes = [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(m => Number(m[1]))
  const max = indexes.length ? Math.max(...indexes) : 0
  return Array.from({ length: max }, (_, i) => `var_${i + 1}`)
}

function humanName(metaName: string) {
  return metaName.replace(/_v\d+$/i, '').split('_').filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

function templateVersion(name: string) {
  const match = String(name || '').match(/_v(\d+)$/i)
  return match ? Number(match[1]) : 0
}

function templateBase(name: string) {
  return String(name || '').replace(/_v\d+$/i, '')
}

type KnownMapping = {
  eventKey: string
  variables: string[]
  description: string
  orderStatus?: string
  eventSource: 'ORDER_SERVICE' | 'DHL_TRACKING'
}

function knownMapping(metaName: string): KnownMapping | null {
  const version = templateVersion(metaName)
  switch (templateBase(metaName)) {
    case 'order_confirm':
      return { eventKey: 'order.confirmed', variables: ['customer_name', 'order_number'], description: 'Order Confirmed', orderStatus: 'confirmed', eventSource: 'ORDER_SERVICE' }
    case 'shipment_booked':
      return { eventKey: 'order.shipment_booked', variables: version >= 4 ? ['order_number'] : ['order_number', 'tracking_url'], description: 'Shipment Booked', orderStatus: 'shipment_booked', eventSource: 'ORDER_SERVICE' }
    case 'order_shipped':
      return { eventKey: 'order.shipped', variables: version >= 4 ? ['order_number'] : ['order_number', 'tracking_url'], description: 'Order Shipped', orderStatus: 'shipped', eventSource: 'ORDER_SERVICE' }
    case 'order_out_for_delivery':
      return { eventKey: 'order.out_for_delivery', variables: version >= 4 ? ['order_number'] : ['order_number', 'tracking_url'], description: 'Out for Delivery', orderStatus: 'out_for_delivery', eventSource: 'ORDER_SERVICE' }
    case 'order_delivered':
      return { eventKey: 'order.delivered', variables: ['customer_name', 'order_number'], description: 'Order Delivered', orderStatus: 'delivered', eventSource: 'ORDER_SERVICE' }
    case 'order_cancelled':
      return { eventKey: 'order.cancelled', variables: ['customer_name', 'order_number'], description: 'Order Cancelled', orderStatus: 'cancelled', eventSource: 'ORDER_SERVICE' }
    case 'order_returned':
      return { eventKey: 'order.returned', variables: ['customer_name', 'order_number'], description: 'Order Returned', orderStatus: 'returned', eventSource: 'ORDER_SERVICE' }
    case 'order_processing':
      return { eventKey: 'order.processing', variables: ['customer_name', 'order_number'], description: 'Order Processing', orderStatus: 'processing', eventSource: 'ORDER_SERVICE' }
    case 'order_refunded':
      return { eventKey: 'order.refunded', variables: ['customer_name', 'order_number'], description: 'Order Refunded', orderStatus: 'refunded', eventSource: 'ORDER_SERVICE' }
    case 'delivery_tracking_update':
      return {
        eventKey: 'shipment.tracking_update',
        variables: version >= 3
          ? ['order_number', 'tracking_update', 'tracking_location', 'tracking_time']
          : ['order_number', 'tracking_update', 'tracking_location', 'tracking_time', 'tracking_url'],
        description: 'DHL shipment tracking update',
        eventSource: 'DHL_TRACKING',
      }
    default:
      return null
  }
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Supabase service configuration missing' }, 500)

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const access = await authorize(req, supabase, serviceRoleKey)
    if (!access.ok) return json({ error: 'Unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const channelId = String(body?.channelId || '').trim()
    const requestedStoreId = String(body?.storeId || '').trim()
    if (!channelId) return json({ error: 'Channel ID is required' }, 400)

    const { data: channel, error: channelError } = await supabase
      .from('whatsapp_channels')
      .select('id,waba_id,access_token,store_id,status')
      .eq('id', channelId)
      .single()

    if (channelError || !channel?.access_token || !channel?.waba_id) return json({ error: 'Channel not configured correctly' }, 404)
    if (requestedStoreId && requestedStoreId !== channel.store_id) return json({ error: 'Channel/store mismatch' }, 403)
    if (channel.status && !['active', 'connected'].includes(String(channel.status).toLowerCase())) return json({ error: 'WhatsApp channel is not active' }, 409)

    const graphVersion = String(Deno.env.get('WHATSAPP_GRAPH_API_VERSION') || 'v26.0').replace(/^v/i, 'v')
    const metaUrl = `https://graph.facebook.com/${graphVersion}/${channel.waba_id}/message_templates?limit=100`
    const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${channel.access_token}` } })
    const raw = await metaRes.text()
    let metaData: any = {}
    try { metaData = raw ? JSON.parse(raw) : {} } catch { metaData = { raw } }
    if (!metaRes.ok) return json({ error: metaData?.error?.message || 'Failed to fetch templates from Meta', meta: metaData?.error || null }, metaRes.status)

    const templates = Array.isArray(metaData?.data) ? metaData.data : []
    let synced = 0
    let registryUpdated = 0
    let registryCreated = 0
    let mappingsLinked = 0
    let rulesPromoted = 0
    let errors = 0
    const details: any[] = []

    for (const metaTmpl of templates) {
      try {
        const metaName = String(metaTmpl?.name || '').trim()
        const language = String(metaTmpl?.language || 'en_GB').trim()
        if (!metaName) continue

        const components = Array.isArray(metaTmpl?.components) ? metaTmpl.components : []
        const inferredVars = variablesFromComponents(components)
        const metaStatus = String(metaTmpl?.status || 'UNKNOWN').toUpperCase()
        const approved = metaStatus === 'APPROVED'
        const known = knownMapping(metaName)

        const { error: upsertError } = await supabase.from('whatsapp_templates').upsert({
          store_id: channel.store_id,
          channel_id: channelId,
          meta_template_id: metaTmpl.id,
          name: metaName,
          language,
          category: metaTmpl.category || 'UTILITY',
          status: metaTmpl.status || 'UNKNOWN',
          components,
          rejection_reason: metaTmpl.rejected_reason || null,
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'channel_id, name, language' })
        if (upsertError) throw upsertError
        synced++

        const { data: existingRegistry } = await supabase.from('whatsapp_template_registry')
          .select('id,name,meta_template_name,variables')
          .eq('store_id', channel.store_id)
          .eq('meta_template_name', metaName)
          .eq('language', language)
          .maybeSingle()

        let registryId = existingRegistry?.id || null
        if (existingRegistry) {
          const currentVars = Array.isArray(existingRegistry.variables) ? existingRegistry.variables : []
          const update: any = {
            meta_template_id: String(metaTmpl.id || ''),
            category: metaTmpl.category || 'UTILITY',
            status: String(metaTmpl.status || 'UNKNOWN').toLowerCase(),
          }
          if (currentVars.length === 0 && inferredVars.length > 0) update.variables = known?.variables || inferredVars
          const { error } = await supabase.from('whatsapp_template_registry').update(update).eq('id', existingRegistry.id)
          if (error) throw error
          registryUpdated++
        } else {
          const { data: created, error } = await supabase.from('whatsapp_template_registry').insert({
            store_id: channel.store_id,
            name: humanName(metaName),
            meta_template_id: String(metaTmpl.id || ''),
            meta_template_name: metaName,
            category: metaTmpl.category || 'UTILITY',
            language,
            variables: known?.variables || inferredVars,
            status: String(metaTmpl.status || 'UNKNOWN').toLowerCase(),
          }).select('id').single()
          if (error) throw error
          registryId = created?.id || null
          registryCreated++
        }

        if (known && approved && registryId) {
          // Keep the registry variables aligned with the exact template generation.
          await supabase.from('whatsapp_template_registry').update({ variables: known.variables }).eq('id', registryId)

          const { data: existingMapping } = await supabase.from('whatsapp_event_template_mappings')
            .select('id,template:whatsapp_template_registry(meta_template_name)')
            .eq('store_id', channel.store_id)
            .eq('event_key', known.eventKey)
            .maybeSingle()

          const currentTemplateName = String(existingMapping?.template?.meta_template_name || '')
          const canPromote = !currentTemplateName || templateVersion(metaName) >= templateVersion(currentTemplateName)

          if (canPromote) {
            const mappingPayload = {
              store_id: channel.store_id,
              event_key: known.eventKey,
              event_type: 'TRANSACTIONAL',
              event_source: known.eventSource,
              description: known.description,
              template_id: registryId,
              channel_id: channelId,
              enabled: true,
              customer_visible: true,
              requires_opt_in: false,
              variables: known.variables,
              updated_at: new Date().toISOString(),
            }
            const { error } = await supabase.from('whatsapp_event_template_mappings')
              .upsert(mappingPayload, { onConflict: 'store_id,event_key' })
            if (error) throw error
            mappingsLinked++

            if (known.orderStatus) {
              const { data: currentRule } = await supabase.from('order_whatsapp_template_rules')
                .select('template_name')
                .eq('store_id', channel.store_id)
                .eq('order_status', known.orderStatus)
                .maybeSingle()
              const currentRuleTemplate = String(currentRule?.template_name || '')
              if (!currentRuleTemplate || templateVersion(metaName) >= templateVersion(currentRuleTemplate)) {
                const { error: ruleError } = await supabase.from('order_whatsapp_template_rules').upsert({
                  store_id: channel.store_id,
                  order_status: known.orderStatus,
                  template_name: metaName,
                  language,
                  enabled: true,
                  updated_at: new Date().toISOString(),
                }, { onConflict: 'store_id,order_status' })
                if (ruleError) throw ruleError
                rulesPromoted++
              }
            }
          }
        }

        details.push({ name: metaName, language, status: metaTmpl.status, synced: true, linked_event: known?.eventKey || null })
      } catch (e: any) {
        errors++
        details.push({ name: metaTmpl?.name || null, synced: false, error: e?.message || String(e) })
      }
    }

    return json({
      success: true,
      auth_mode: access.mode,
      graph_api_version: graphVersion,
      fetched: templates.length,
      synced,
      registry_updated: registryUpdated,
      registry_created: registryCreated,
      mappings_linked: mappingsLinked,
      rules_promoted: rulesPromoted,
      errors,
      details,
    })
  } catch (error: any) {
    console.error('[WhatsApp Sync] Error:', error?.message || error)
    return json({ error: error?.message || 'Template sync failed' }, 500)
  }
})

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

type KnownMapping = {
  eventKey: string
  variables: string[]
  description: string
  orderStatus?: string
}

const knownMappings: Record<string, KnownMapping> = {
  order_confirm_v1: { eventKey: 'order.confirmed', variables: ['customer_name', 'order_number'], description: 'Order Confirmed', orderStatus: 'confirmed' },
  shipment_booked_v1: { eventKey: 'order.shipment_booked', variables: ['order_number', 'tracking_url'], description: 'Shipment Booked', orderStatus: 'shipment_booked' },
  order_shipped_v1: { eventKey: 'order.shipped', variables: ['order_number', 'tracking_url'], description: 'Order Shipped', orderStatus: 'shipped' },
  order_out_for_delivery_v1: { eventKey: 'order.out_for_delivery', variables: ['order_number', 'tracking_url'], description: 'Out for Delivery', orderStatus: 'out_for_delivery' },
  order_delivered_v1: { eventKey: 'order.delivered', variables: ['customer_name', 'order_number'], description: 'Order Delivered', orderStatus: 'delivered' },
  order_cancelled_v1: { eventKey: 'order.cancelled', variables: ['customer_name', 'order_number'], description: 'Order Cancelled', orderStatus: 'cancelled' },
  order_returned_v1: { eventKey: 'order.returned', variables: ['customer_name', 'order_number'], description: 'Order Returned', orderStatus: 'returned' },
  order_processing_v1: { eventKey: 'order.processing', variables: ['customer_name', 'order_number'], description: 'Order Processing', orderStatus: 'processing' },
  order_refunded_v1: { eventKey: 'order.refunded', variables: ['customer_name', 'order_number'], description: 'Order Refunded', orderStatus: 'refunded' },
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const channelId = String(body?.channelId || '').trim()
    const requestedStoreId = String(body?.storeId || '').trim()
    if (!channelId) return json({ error: 'Channel ID is required' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: channel, error: channelError } = await supabase
      .from('whatsapp_channels')
      .select('id,waba_id,access_token,store_id,status')
      .eq('id', channelId)
      .single()

    if (channelError || !channel?.access_token || !channel?.waba_id) return json({ error: 'Channel not configured correctly' }, 404)
    if (requestedStoreId && requestedStoreId !== channel.store_id) return json({ error: 'Channel/store mismatch' }, 403)

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

        const known = knownMappings[metaName]
        const { data: existingRegistry } = await supabase.from('whatsapp_template_registry')
          .select('id,name,meta_template_name,variables')
          .eq('store_id', channel.store_id)
          .eq('meta_template_name', metaName)
          .eq('language', language)
          .maybeSingle()

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
          const { error } = await supabase.from('whatsapp_template_registry').insert({
            store_id: channel.store_id,
            name: humanName(metaName),
            meta_template_id: String(metaTmpl.id || ''),
            meta_template_name: metaName,
            category: metaTmpl.category || 'UTILITY',
            language,
            variables: known?.variables || inferredVars,
            status: String(metaTmpl.status || 'UNKNOWN').toLowerCase(),
          })
          if (error) throw error
          registryCreated++
        }

        // Do not replace a working template mapping with a new template until
        // Meta has approved it. This keeps the existing fallback live during review.
        if (known && approved) {
          const { data: registry } = await supabase.from('whatsapp_template_registry')
            .select('id')
            .eq('store_id', channel.store_id)
            .eq('meta_template_name', metaName)
            .eq('language', language)
            .maybeSingle()
          if (registry) {
            const { data: existingMapping } = await supabase.from('whatsapp_event_template_mappings')
              .select('id')
              .eq('store_id', channel.store_id)
              .eq('event_key', known.eventKey)
              .maybeSingle()
            if (existingMapping) {
              const { error } = await supabase.from('whatsapp_event_template_mappings').update({
                template_id: registry.id,
                channel_id: channelId,
                variables: known.variables,
                description: known.description,
                enabled: true,
                customer_visible: true,
                updated_at: new Date().toISOString(),
              }).eq('id', existingMapping.id)
              if (error) throw error
            } else {
              const { error } = await supabase.from('whatsapp_event_template_mappings').insert({
                store_id: channel.store_id,
                event_key: known.eventKey,
                event_type: 'TRANSACTIONAL',
                event_source: 'ORDER_SERVICE',
                description: known.description,
                template_id: registry.id,
                channel_id: channelId,
                enabled: true,
                customer_visible: true,
                requires_opt_in: false,
                variables: known.variables,
              })
              if (error) throw error
            }
            mappingsLinked++

            if (known.orderStatus) {
              const { error: ruleError, count } = await supabase.from('order_whatsapp_template_rules')
                .update({ template_name: metaName, language, enabled: true, updated_at: new Date().toISOString() }, { count: 'exact' })
                .eq('store_id', channel.store_id)
                .eq('order_status', known.orderStatus)
              if (ruleError) throw ruleError
              rulesPromoted += count || 0
            }
          }
        }

        details.push({ name: metaName, language, status: metaTmpl.status, synced: true, linked_event: known?.eventKey || null, promoted: Boolean(known && approved) })
      } catch (e: any) {
        errors++
        details.push({ name: metaTmpl?.name || null, synced: false, error: e?.message || String(e) })
      }
    }

    return json({ success: true, graph_api_version: graphVersion, fetched: templates.length, synced, registry_updated: registryUpdated, registry_created: registryCreated, mappings_linked: mappingsLinked, rules_promoted: rulesPromoted, errors, details })
  } catch (error: any) {
    console.error('[WhatsApp Sync] Error:', error?.message || error)
    return json({ error: error?.message || 'Template sync failed' }, 500)
  }
})

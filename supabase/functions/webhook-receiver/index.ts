import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wc-webhook-topic, x-wc-webhook-source, x-wc-webhook-signature',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const topic = req.headers.get('x-wc-webhook-topic')
    const source = req.headers.get('x-wc-webhook-source')
    const body = await req.json()

    console.log(`[Webhook] Received ${topic} from ${source}`)

    // 1. Log the raw webhook for auditing
    await supabaseClient.from('webhook_logs').insert({
      source: source || 'unknown',
      topic: topic || 'unknown',
      payload: body,
      status: 'received'
    })

    // 2. Handle Order Creation
    if (topic === 'order.created' || topic === 'order.updated') {
        // Trigger the existing sync-orders function but only for this specific order
        // This is much faster than a full poll
        await supabaseClient.functions.invoke('sync-orders', {
            body: {
                orderId: body.id,
                source: source,
                action: 'webhook_sync'
            }
        })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('[Webhook Error]', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

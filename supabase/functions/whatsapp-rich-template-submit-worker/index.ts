import { createClient } from "npm:@supabase/supabase-js@2"

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

const TEMPLATE_NAMES = [
  'order_confirm_v3',
  'shipment_booked_v3',
  'order_shipped_v3',
  'order_out_for_delivery_v3',
  'order_delivered_v3',
  'order_cancelled_v3',
  'order_returned_v3',
  'delivery_tracking_update_v2',
]

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Supabase service configuration missing' }, 500)

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const suppliedSecret = String(req.headers.get('x-whatsapp-retry-secret') || '').trim()
  if (!suppliedSecret) return json({ error: 'Unauthorized' }, 401)
  const { data: authorized, error: authError } = await db.rpc('verify_integration_cron_secret', {
    p_name: 'whatsapp_retry_cron_secret',
    p_secret: suppliedSecret,
  })
  if (authError || authorized !== true) return json({ error: 'Unauthorized' }, 401)

  const { data: store } = await db.from('stores').select('id').eq('slug', 'malluspices').maybeSingle()
  if (!store?.id) return json({ error: 'MalluSpices store not found' }, 404)

  const { data: templates, error: templateError } = await db.from('whatsapp_templates')
    .select('id,name,status')
    .eq('store_id', store.id)
    .in('name', TEMPLATE_NAMES)
    .order('name')
  if (templateError) return json({ error: templateError.message }, 500)

  const results: any[] = []
  for (const template of templates || []) {
    if (!['DRAFT', 'REJECTED'].includes(String(template.status || '').toUpperCase())) {
      results.push({ name: template.name, skipped: true, status: template.status })
      continue
    }
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/whatsapp-template-submit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ templateId: template.id }),
      })
      const raw = await response.text()
      let result: any = {}
      try { result = raw ? JSON.parse(raw) : {} } catch { result = { raw } }
      results.push({ name: template.name, ok: response.ok && result?.success === true, status: response.status, result })
    } catch (error: any) {
      results.push({ name: template.name, ok: false, error: error?.message || String(error) })
    }
  }

  const failed = results.filter((r) => r.ok === false)
  return json({ success: failed.length === 0, submitted: results.filter((r) => r.ok).length, failed: failed.length, results }, failed.length ? 207 : 200)
})

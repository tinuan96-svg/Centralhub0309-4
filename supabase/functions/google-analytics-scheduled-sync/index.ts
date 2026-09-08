import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ga4-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

async function requireCron(req: Request) {
  const expected = Deno.env.get('GA4_SYNC_CRON_SECRET')?.trim()
  const supplied = req.headers.get('x-ga4-cron-secret')?.trim()
  if (!expected || !supplied || supplied !== expected) throw new Error('Invalid GA4 cron secret')
}

async function main(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  await requireCron(req)
  const baseUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-analytics-sync`
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ga4-cron-secret': Deno.env.get('GA4_SYNC_CRON_SECRET')! },
    body: JSON.stringify({ action: 'cron' }),
  })
  const body = await response.json().catch(() => ({}))
  return json(body, response.status)
}

Deno.serve(async (req) => {
  try { return await main(req) }
  catch (error) { return json({ error: error instanceof Error ? error.message : String(error) }, 500) }
})

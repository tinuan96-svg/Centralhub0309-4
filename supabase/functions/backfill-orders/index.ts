import { createClient } from 'npm:@supabase/supabase-js@2.49.8'

const targetUrl = Deno.env.get('SUPABASE_URL')!
const targetKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const sourceUrl = Deno.env.get('SOURCE_SUPABASE_URL')!
const sourceKey = Deno.env.get('SOURCE_SERVICE_ROLE_KEY')!

if (!targetUrl || !targetKey) throw new Error('Missing target Supabase env vars')
if (!sourceUrl || !sourceKey) throw new Error('Missing SOURCE_SUPABASE_URL or SOURCE_SERVICE_ROLE_KEY')

const target = createClient(targetUrl, targetKey)
const source = createClient(sourceUrl, sourceKey)

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const batchSize = 500
    let from = 0
    let totalFetched = 0
    let totalUpserted = 0

    while (true) {
      const to = from + batchSize - 1

      const { data, error } = await source
        .from('orders')
        .select('*')
        .order('created_at', { ascending: true })
        .range(from, to)

      if (error) return json({ error: `Source fetch failed: ${error.message}`, from, to }, 500)

      const rows = data ?? []
      if (rows.length === 0) break

      totalFetched += rows.length

      const { error: upsertError } = await target
        .from('orders')
        .upsert(rows, { onConflict: 'id' })

      if (upsertError) {
        return json({ error: `Target upsert failed: ${upsertError.message}`, from, to }, 500)
      }

      totalUpserted += rows.length

      if (rows.length < batchSize) break
      from += batchSize
    }

    return json({ ok: true, totalFetched, totalUpserted })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unexpected error'
    return json({ error: message }, 500)
  }
})
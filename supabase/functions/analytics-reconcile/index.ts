import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function variance(a: number, b: number) {
  const denominator = Math.max(Math.abs(a), Math.abs(b), 1)
  return Math.abs(a - b) / denominator * 100
}

function dateValue(value: unknown) {
  const date = String(value || '')
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
}

async function requireAdmin(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new Error('Authorization required')
  const db = admin()
  const { data: auth, error } = await db.auth.getUser(token)
  if (error || !auth.user) throw new Error('Invalid session')
  const { data: profile } = await db.from('user_profiles').select('profile_role,is_active').eq('id', auth.user.id).maybeSingle()
  if (profile?.profile_role !== 'admin' || profile?.is_active === false) throw new Error('Admin access required')
  return db
}

async function reconcile(db: any, storeId: string, date: string) {
  const { data: ga4Rows, error: ga4Error } = await db
    .from('analytics_daily_metrics')
    .select('users,sessions,page_views,product_views,add_to_carts,checkouts,purchases,revenue')
    .eq('store_id', storeId)
    .eq('metric_date', date)
  if (ga4Error) throw ga4Error

  const ga4 = (ga4Rows || []).reduce((acc: any, row: any) => ({
    users: acc.users + number(row.users),
    sessions: acc.sessions + number(row.sessions),
    page_views: acc.page_views + number(row.page_views),
    product_views: acc.product_views + number(row.product_views),
    add_to_carts: acc.add_to_carts + number(row.add_to_carts),
    checkouts: acc.checkouts + number(row.checkouts),
    purchases: acc.purchases + number(row.purchases),
    revenue: acc.revenue + number(row.revenue),
  }), { users: 0, sessions: 0, page_views: 0, product_views: 0, add_to_carts: 0, checkouts: 0, purchases: 0, revenue: 0 })

  const start = `${date}T00:00:00.000Z`
  const end = `${date}T23:59:59.999Z`
  const { data: events, error: eventError } = await db
    .from('analytics_events')
    .select('event_name,session_id,anonymous_id,product_value,order_id')
    .eq('store_id', storeId)
    .gte('occurred_at', start)
    .lte('occurred_at', end)
  if (eventError) throw eventError

  const sessions = new Set<string>()
  const users = new Set<string>()
  const mirror = {
    users: 0,
    sessions: 0,
    page_views: 0,
    product_views: 0,
    add_to_carts: 0,
    checkouts: 0,
    purchases: 0,
    revenue: 0,
  }
  const purchaseOrders = new Set<string>()

  for (const event of events || []) {
    const eventName = String(event.event_name || '')
    if (event.session_id) sessions.add(String(event.session_id))
    if (event.anonymous_id) users.add(String(event.anonymous_id))
    if (eventName === 'page_view') mirror.page_views++
    if (eventName === 'view_item') mirror.product_views++
    if (eventName === 'add_to_cart') mirror.add_to_carts++
    if (eventName === 'begin_checkout') mirror.checkouts++
    if (eventName === 'purchase') {
      if (event.order_id) {
        const orderId = String(event.order_id)
        if (purchaseOrders.has(orderId)) continue
        purchaseOrders.add(orderId)
      }
      mirror.purchases++
      mirror.revenue += number(event.product_value)
    }
  }

  mirror.users = users.size
  mirror.sessions = sessions.size

  const comparisons = {
    users: variance(ga4.users, mirror.users),
    sessions: variance(ga4.sessions, mirror.sessions),
    page_views: variance(ga4.page_views, mirror.page_views),
    product_views: variance(ga4.product_views, mirror.product_views),
    add_to_carts: variance(ga4.add_to_carts, mirror.add_to_carts),
    checkouts: variance(ga4.checkouts, mirror.checkouts),
    purchases: variance(ga4.purchases, mirror.purchases),
    revenue: variance(ga4.revenue, mirror.revenue),
  }
  const maxVariance = Math.max(...Object.values(comparisons).map(number))
  const status = maxVariance <= 10 ? 'matched' : maxVariance <= 25 ? 'warning' : 'critical'

  const payload = {
    store_id: storeId,
    reconciliation_date: date,
    ga4_users: Math.round(ga4.users),
    mirror_users: Math.round(mirror.users),
    ga4_sessions: Math.round(ga4.sessions),
    mirror_sessions: Math.round(mirror.sessions),
    ga4_page_views: Math.round(ga4.page_views),
    mirror_page_views: Math.round(mirror.page_views),
    ga4_product_views: Math.round(ga4.product_views),
    mirror_product_views: Math.round(mirror.product_views),
    ga4_add_to_carts: Math.round(ga4.add_to_carts),
    mirror_add_to_carts: Math.round(mirror.add_to_carts),
    ga4_checkouts: Math.round(ga4.checkouts),
    mirror_checkouts: Math.round(mirror.checkouts),
    ga4_purchases: Math.round(ga4.purchases),
    mirror_purchases: Math.round(mirror.purchases),
    ga4_revenue: ga4.revenue,
    mirror_revenue: mirror.revenue,
    max_variance_percent: Number(maxVariance.toFixed(2)),
    status,
    details: { variances: comparisons, generated_from: 'ga4_daily_metrics_vs_analytics_events' },
    updated_at: new Date().toISOString(),
  }

  const { error: upsertError } = await db.from('analytics_reconciliation_runs').upsert(payload, { onConflict: 'store_id,reconciliation_date' })
  if (upsertError) throw upsertError
  return payload
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const db = await requireAdmin(req)
    const body = await req.json().catch(() => ({}))
    const storeId = String(body.storeId || '').trim()
    if (!storeId) throw new Error('storeId is required')
    const requestedDate = dateValue(body.date)
    const date = requestedDate || new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const result = await reconcile(db, storeId, date)
    return json({ success: true, result })
  } catch (error) {
    console.error('[analytics-reconcile]', error)
    return json({ success: false, error: error instanceof Error ? error.message : 'Analytics reconciliation failed' }, 400)
  }
})

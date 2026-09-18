import { createClient } from '@supabase/supabase-js';

declare const Netlify: { env: { get(name: string): string | undefined } };

export const config = { schedule: '* * * * *' };

const LOOKBACK_MS = 3 * 60_000;
const BUCKET_MS = 2 * 60_000;
const RETRY_WINDOW_MS = 30 * 60_000;
const RETRY_BACKOFF_MS = 2 * 60_000;
const LIMIT = 250;

type Kind = 'orders' | 'products' | 'shipping' | 'whatsapp' | 'payments' | 'marketing' | 'integration' | 'monitor';
type Incident = {
  kind: Kind;
  source: string;
  id: string;
  at: string;
  storeId?: string | null;
  storeSlug?: string | null;
  error: string;
  url: string;
  severity: 'warning' | 'critical';
};

const env = (name: string) => String(Netlify.env.get(name) || '').trim();
const str = (value: any) => value == null ? '' : String(value).trim();
const failed = (value: any) => /(^|[_\s-])(fail(?:ed|ure)?|error|errored|dead|blocked)([_\s-]|$)/i.test(str(value));
const when = (value: any) => Number.isFinite(Date.parse(str(value))) ? new Date(Date.parse(str(value))).toISOString() : new Date().toISOString();
const first = (...values: any[]) => values.map(str).find(Boolean) || 'Unknown integration failure';
const bucket = (iso: string) => Math.floor(Date.parse(iso) / BUCKET_MS) * BUCKET_MS;

function kindFor(table: any): Kind {
  const value = str(table).toLowerCase();
  if (value.includes('order')) return 'orders';
  if (value.includes('product') || value.includes('variant') || value.includes('inventory')) return 'products';
  return 'integration';
}

function label(kind: Kind) {
  return ({
    orders: 'Order sync', products: 'Product sync', shipping: 'Shipping integration',
    whatsapp: 'WhatsApp integration', payments: 'Payment integration', marketing: 'Marketing integration',
    integration: 'Store integration', monitor: 'Integration monitor',
  } as Record<Kind, string>)[kind];
}

function action(kind: Kind) {
  if (kind === 'orders' || kind === 'integration') return '/sync-status';
  if (kind === 'products') return '/inventory';
  if (kind === 'shipping') return '/orders';
  if (kind === 'whatsapp') return '/customer-care';
  if (kind === 'payments') return '/finance';
  if (kind === 'marketing') return '/marketing';
  return '/dashboard';
}

async function push(siteUrl: string, secret: string, notificationId: string, nativeOnly = false) {
  const response = await fetch(`${siteUrl}/api/push/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ notificationId, nativeOnly, urgency: 'high', ttl: 3600 }),
  });
  const data: any = await response.json().catch(() => ({}));
  return { ok: response.ok && data?.success !== false, state: str(data?.delivery_state), status: response.status, data };
}

export default async function integrationErrorWatchdog() {
  const supabaseUrl = env('NEXT_PUBLIC_SUPABASE_URL') || env('SUPABASE_URL');
  const serviceKey = env('CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY');
  const pushSecret = env('CENTRALHUB_PUSH_API_SECRET');
  const siteUrl = (env('CENTRALHUB_SITE_URL') || 'https://centralhub.network').replace(/\/$/, '');
  if (!supabaseUrl || !serviceKey || !pushSecret) {
    console.error('[integration-error-watchdog] required configuration missing');
    return;
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const incidents: Incident[] = [];

  const [stores, orders, productLogs, syncLogs, orderQueue, shipmentLogs, whatsappEvents, mollieEvents, marketingJobs, webhookLogs] = await Promise.all([
    db.from('stores').select('id,slug,name'),
    db.from('orders').select('id,order_number,store_id,sync_state,sync_error,updated_at').gte('updated_at', since).order('updated_at', { ascending: false }).limit(LIMIT),
    db.from('product_sync_logs').select('id,product_id,store_id,action,success,error,created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(LIMIT),
    db.from('sync_logs').select('id,from_store,to_store,table,record_id,action,success,error,error_code,created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(LIMIT),
    db.from('order_sync_queue').select('id,order_id,store_id,status,attempts,last_error,created_at,updated_at').gte('updated_at', since).order('updated_at', { ascending: false }).limit(LIMIT),
    db.from('shipment_sync_logs').select('id,store_id,order_number,event_type,result,error_message,created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(LIMIT),
    db.from('whatsapp_webhook_events').select('id,event_id,provider,event_type,processing_status,error_message,created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(LIMIT),
    db.from('mollie_webhook_events').select('id,store_slug,mollie_payment_id,error_message,created_at,updated_at').gte('updated_at', since).order('updated_at', { ascending: false }).limit(LIMIT),
    db.from('marketing_sync_jobs').select('id,store_id,provider_id,job_type,status,error_message,created_at,completed_at').gte('created_at', since).order('created_at', { ascending: false }).limit(LIMIT),
    db.from('webhook_logs').select('id,event_type,product_id,status_code,response_body,response,success,status,created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(LIMIT),
  ]);

  const storeById = new Map<string, any>();
  const storeBySlug = new Map<string, any>();
  for (const store of stores.data || []) {
    storeById.set(store.id, store);
    if (store.slug) storeBySlug.set(str(store.slug).toLowerCase(), store);
  }

  const queryResults: Array<[string, any]> = [
    ['stores', stores], ['orders', orders], ['product_sync_logs', productLogs], ['sync_logs', syncLogs],
    ['order_sync_queue', orderQueue], ['shipment_sync_logs', shipmentLogs], ['whatsapp_webhook_events', whatsappEvents],
    ['mollie_webhook_events', mollieEvents], ['marketing_sync_jobs', marketingJobs], ['webhook_logs', webhookLogs],
  ];
  for (const [source, result] of queryResults) {
    if (result.error) incidents.push({
      kind: 'monitor', source: `watchdog:${source}`, id: source, at: new Date().toISOString(),
      error: `Could not inspect ${source}: ${first(result.error?.message, result.error)}`,
      url: '/dashboard', severity: 'critical',
    });
  }

  for (const row of orders.data || []) if (failed(row.sync_state) || str(row.sync_error)) incidents.push({
    kind: 'orders', source: 'orders', id: str(row.id), at: when(row.updated_at), storeId: row.store_id,
    error: first(row.sync_error, `Order ${row.order_number || row.id} sync state is ${row.sync_state || 'failed'}`), url: '/sync-status', severity: 'critical',
  });

  for (const row of productLogs.data || []) if (row.success === false || str(row.error)) incidents.push({
    kind: 'products', source: 'product_sync_logs', id: str(row.id), at: when(row.created_at), storeId: row.store_id,
    error: first(row.error, `Product ${row.product_id || ''} ${row.action || 'sync'} failed`), url: '/inventory', severity: 'critical',
  });

  for (const row of syncLogs.data || []) if (row.success === false || str(row.error) || str(row.error_code)) {
    const kind = kindFor(row.table);
    incidents.push({
      kind, source: 'sync_logs', id: str(row.id), at: when(row.created_at), storeId: row.to_store || row.from_store,
      error: first(row.error, row.error_code, `${row.table || 'Store'} ${row.action || 'sync'} failed`), url: action(kind), severity: 'critical',
    });
  }

  for (const row of orderQueue.data || []) if (failed(row.status) || str(row.last_error)) incidents.push({
    kind: 'orders', source: 'order_sync_queue', id: str(row.id), at: when(row.updated_at || row.created_at), storeId: row.store_id,
    error: first(row.last_error, `Order sync failed after ${row.attempts || 0} attempt(s)`), url: '/sync-status', severity: 'critical',
  });

  for (const row of shipmentLogs.data || []) if (failed(row.result) || str(row.error_message)) incidents.push({
    kind: 'shipping', source: 'shipment_sync_logs', id: str(row.id), at: when(row.created_at), storeId: row.store_id,
    error: first(row.error_message, `${row.event_type || 'Shipment sync'} returned ${row.result || 'failure'}`), url: '/orders', severity: 'critical',
  });

  for (const row of whatsappEvents.data || []) if (failed(row.processing_status) || str(row.error_message)) incidents.push({
    kind: 'whatsapp', source: 'whatsapp_webhook_events', id: str(row.id), at: when(row.created_at),
    error: first(row.error_message, `${row.provider || 'WhatsApp'} ${row.event_type || 'webhook'} failed`), url: '/customer-care', severity: 'critical',
  });

  for (const row of mollieEvents.data || []) if (str(row.error_message)) incidents.push({
    kind: 'payments', source: 'mollie_webhook_events', id: str(row.id), at: when(row.updated_at || row.created_at), storeSlug: str(row.store_slug).toLowerCase(),
    error: first(row.error_message, `Mollie payment ${row.mollie_payment_id || row.id} failed`), url: '/finance', severity: 'critical',
  });

  for (const row of marketingJobs.data || []) if (failed(row.status) || str(row.error_message)) incidents.push({
    kind: 'marketing', source: 'marketing_sync_jobs', id: str(row.id), at: when(row.completed_at || row.created_at), storeId: row.store_id,
    error: first(row.error_message, `${row.provider_id || 'Marketing'} ${row.job_type || 'sync'} failed`), url: '/marketing', severity: 'warning',
  });

  for (const row of webhookLogs.data || []) if (row.success === false || failed(row.status)) incidents.push({
    kind: 'products', source: 'webhook_logs', id: str(row.id), at: when(row.created_at),
    error: first(row.response_body, row.response, `${row.event_type || 'Product webhook'} failed with HTTP ${row.status_code || 'unknown'}`), url: '/inventory', severity: 'critical',
  });

  const groups = new Map<string, Incident[]>();
  for (const incident of incidents) {
    if (!incident.storeId && incident.storeSlug) incident.storeId = storeBySlug.get(incident.storeSlug)?.id || null;
    const scope = incident.storeId || incident.storeSlug || 'centralhub';
    const key = `${incident.kind}:${scope}:${bucket(incident.at)}`;
    groups.set(key, [...(groups.get(key) || []), incident]);
  }

  let created = 0, delivered = 0, failedPush = 0;
  for (const [key, group] of [...groups.entries()].slice(0, 40)) {
    const latest = [...group].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
    const store = latest.storeId ? storeById.get(latest.storeId) : latest.storeSlug ? storeBySlug.get(latest.storeSlug) : null;
    const storeName = str(store?.name) || latest.storeSlug || 'CentralHub';
    const dedupeKey = `INTEGRATION_ERROR:${key}`;
    let { data: notification } = await db.from('system_notifications').select('id,metadata').eq('metadata->>dedupe_key', dedupeKey).maybeSingle();

    if (!notification?.id) {
      const latestError = latest.error.replace(/\s+/g, ' ').slice(0, 220);
      const inserted = await db.from('system_notifications').insert({
        user_id: null,
        store_id: latest.storeId || null,
        title: `🚨 ${label(latest.kind)} error — ${storeName}`,
        message: `${group.length} ${label(latest.kind).toLowerCase()} failure${group.length === 1 ? '' : 's'} detected. Latest: ${latestError}. Tap to inspect CentralHub.`,
        severity: group.some((item) => item.severity === 'critical') ? 'critical' : 'warning',
        category: 'integration_error',
        action_url: latest.url,
        is_read: false,
        metadata: {
          source: 'integration-error-watchdog', dedupe_key: dedupeKey, compulsory_push: true,
          incident_kind: latest.kind, incident_count: group.length,
          source_tables: [...new Set(group.map((item) => item.source))],
          source_ids: [...new Set(group.map((item) => item.id))].slice(0, 30),
          latest_detected_at: latest.at, store_slug: store?.slug || latest.storeSlug || null,
        },
      }).select('id,metadata').single();
      if (inserted.error) {
        if (inserted.error.code === '23505') {
          const raced = await db.from('system_notifications').select('id,metadata').eq('metadata->>dedupe_key', dedupeKey).maybeSingle();
          notification = raced.data;
        } else {
          console.error('[integration-error-watchdog] notification insert failed:', inserted.error.message);
          continue;
        }
      } else {
        notification = inserted.data;
        created += 1;
      }
    }

    if (!notification?.id || str(notification.metadata?.push_delivery_state) === 'accepted') continue;
    try {
      const state = str(notification.metadata?.push_delivery_state);
      const result = await push(siteUrl, pushSecret, notification.id, state === 'partial');
      if (result.ok || result.state === 'accepted') delivered += 1;
      else failedPush += 1;
    } catch (error: any) {
      failedPush += 1;
      console.error('[integration-error-watchdog] push failed:', error?.message || error);
    }
  }

  const retrySince = new Date(Date.now() - RETRY_WINDOW_MS).toISOString();
  const { data: retryRows, error: retryError } = await db.from('system_notifications')
    .select('id,metadata,created_at').eq('category', 'integration_error').gte('created_at', retrySince).order('created_at').limit(60);
  if (retryError) console.error('[integration-error-watchdog] retry query failed:', retryError.message);
  for (const row of retryRows || []) {
    const meta = row.metadata || {};
    const state = str(meta.push_delivery_state);
    if (state === 'accepted') continue;
    const lastAttempt = Date.parse(str(meta.push_last_attempt_at));
    if (Number.isFinite(lastAttempt) && Date.now() - lastAttempt < RETRY_BACKOFF_MS) continue;
    try {
      const result = await push(siteUrl, pushSecret, row.id, state === 'partial');
      if (result.ok || result.state === 'accepted') delivered += 1;
      else failedPush += 1;
    } catch (error: any) {
      failedPush += 1;
      console.error('[integration-error-watchdog] retry failed:', error?.message || error);
    }
  }

  console.log('[integration-error-watchdog]', JSON.stringify({ incidents: incidents.length, groups: groups.size, created, delivered, failedPush }));
}

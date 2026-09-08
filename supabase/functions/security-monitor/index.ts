import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const importantHeaders = ['strict-transport-security', 'content-security-policy', 'x-content-type-options', 'referrer-policy'];

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL');
  const role = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !role) return json(500, { ok: false, error: 'server_not_configured' });
  const db = createClient(url, role, { auth: { persistSession: false } });
  const { data: stores, error } = await db.from('stores').select('id,name,slug,domain').eq('visibility', true).not('domain', 'is', null);
  if (error) return json(500, { ok: false, error: 'store_registry_unavailable' });
  const results = [];
  for (const store of stores || []) {
    const target = `https://${String(store.domain).replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
    const started = performance.now();
    let status: 'online' | 'degraded' | 'offline' = 'offline'; let httpStatus: number | null = null; let missing: string[] = importantHeaders; let detail: string | null = null;
    try {
      const response = await fetch(target, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'CentralHub-Security-Monitor/1.0' } });
      httpStatus = response.status; missing = importantHeaders.filter(header => !response.headers.get(header)); status = response.ok && missing.length <= 1 ? 'online' : response.ok ? 'degraded' : 'offline';
      await response.body?.cancel();
    } catch (cause) { detail = cause instanceof Error ? cause.message.slice(0, 240) : 'probe_failed'; }
    const latency = Math.round(performance.now() - started); const score = status === 'offline' ? 0 : Math.max(35, 100 - missing.length * 12 - (latency > 2500 ? 10 : latency > 1200 ? 5 : 0)); const checkedAt = new Date().toISOString();
    const { data: previous } = await db.from('security_heartbeats').select('status,security_score').eq('store_id', store.id).eq('source', 'centralhub_probe').maybeSingle();
    await db.from('security_heartbeats').upsert({ store_id: store.id, source: 'centralhub_probe', status, latency_ms: latency, http_status: httpStatus, tls_valid: status !== 'offline', security_headers: { missing }, security_score: score, detail, checked_at: checkedAt }, { onConflict: 'store_id,source' });
    if (!previous || previous.status !== status || Math.abs((previous.security_score ?? 0) - score) >= 15) {
      const severity = status === 'offline' ? 'critical' : status === 'degraded' ? 'medium' : 'info';
      await db.from('security_events').insert({ store_id: store.id, source: 'centralhub_probe', event_type: status === 'offline' ? 'availability_failure' : missing.length ? 'security_headers' : 'recovered', severity, status: status === 'online' ? 'resolved' : 'open', title: status === 'offline' ? `${store.name} is unreachable` : missing.length ? `${store.name} security headers need attention` : `${store.name} recovered`, details: { http_status: httpStatus, latency_ms: latency, missing_headers: missing, detail }, fingerprint: `${store.id}:centralhub_probe:${status}:${missing.sort().join(',')}`, occurred_at: checkedAt, last_seen_at: checkedAt });
    }
    await db.from('site_health_store_configs').update({ last_verified_at: checkedAt }).eq('store_id', store.id);
    results.push({ store: store.slug, status, http_status: httpStatus, latency_ms: latency, security_score: score, missing_headers: missing });
  }
  return json(200, { ok: true, checked_at: new Date().toISOString(), results });
});

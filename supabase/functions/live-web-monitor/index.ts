import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 15_000;

type Monitor = {
  id: string;
  user_id: string;
  label: string;
  url: string;
  interval_minutes: number;
  last_status_code: number | null;
  last_title: string | null;
  last_hash: string | null;
  last_text_excerpt: string | null;
  last_prices: unknown;
  last_pack_sizes: unknown;
  last_changed_at: string | null;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function privateIpv4(address: string) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function privateIp(address: string) {
  const value = address.toLowerCase();
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return privateIpv4(value);
  if (value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') ||
      value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return true;
  if (value.startsWith('::ffff:')) return privateIpv4(value.slice(7));
  return false;
}

async function assertPublicHttps(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Only public HTTPS targets are allowed');
  const host = url.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local') || privateIp(host)) throw new Error('Private/local target blocked');

  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) && !host.includes(':')) {
    const resolver = (Deno as any).resolveDns;
    if (typeof resolver === 'function') {
      const answers: string[] = [];
      try { answers.push(...await resolver(host, 'A')); } catch {}
      try { answers.push(...await resolver(host, 'AAAA')); } catch {}
      if (!answers.length) throw new Error('DNS resolution failed');
      if (answers.some(privateIp)) throw new Error('Target resolves to a private/reserved network');
    }
  }
  return url;
}

async function fetchPage(initial: string) {
  let current = (await assertPublicHttps(initial)).toString();
  for (let i = 0; i <= 5; i++) {
    await assertPublicHttps(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'CentralHub-LiveWeb-Monitor/1.0 (+https://centralhub.network)',
          Accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
        },
      });
    } finally {
      clearTimeout(timer);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || i === 5) throw new Error('Unsafe or excessive redirect chain');
      current = new URL(location, current).toString();
      continue;
    }
    const type = (response.headers.get('content-type') || '').toLowerCase();
    if (!type.includes('text/html') && !type.includes('text/plain')) throw new Error('Unsupported page content type');
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_BYTES) throw new Error('Page exceeds monitor size limit');
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) throw new Error('Page exceeds monitor size limit');
    return { url: current, status: response.status, html: new TextDecoder().decode(buffer) };
  }
  throw new Error('Redirect loop');
}

function textFromHtml(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|canvas|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|section|article|h[1-6]|tr)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableText(text: string) {
  return text
    .replace(/\b20\d{2}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}:\d{2}\b/g, ' ')
    .replace(/\b[a-f0-9]{32,}\b/gi, ' ')
    .replace(/\b(?:nonce|csrf|request|session)[-_ ]?(?:id|token)?[:= ]+[A-Za-z0-9._-]{12,}\b/gi, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 250_000);
}

function titleFromHtml(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? textFromHtml(match[1]).slice(0, 300) : '';
}

function uniqueMatches(text: string, regex: RegExp, limit = 100) {
  const out = new Set<string>();
  for (const match of text.matchAll(regex)) {
    out.add(match[0].replace(/\s+/g, ' ').trim().toLowerCase());
    if (out.size >= limit) break;
  }
  return [...out].sort();
}

function prices(text: string) {
  return uniqueMatches(text, /(?:£\s?\d{1,5}(?:[.,]\d{1,2})?|GBP\s?\d{1,5}(?:[.,]\d{1,2})?)/gi);
}
function packs(text: string) {
  return uniqueMatches(text, /\b\d+(?:\.\d+)?\s?(?:kg|g|mg|ml|cl|l|litre|litres|pcs|pc|pieces|pack|packs)\b|\b\d+\s?[x×]\s?\d+(?:\.\d+)?\s?(?:kg|g|ml|l|pcs|pc)?\b/gi);
}
function availability(text: string) {
  return uniqueMatches(text, /\b(?:in stock|out of stock|sold out|unavailable|available now|limited stock|sale|special offer|offer price|discount)\b/gi, 40);
}
function normArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).sort() : [];
}
function sameArray(a: unknown, b: unknown) {
  return JSON.stringify(normArray(a)) === JSON.stringify(normArray(b));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function shingles(text: string) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 4000);
  const set = new Set<string>();
  for (let i = 0; i < words.length - 4; i += 3) set.add(words.slice(i, i + 5).join(' '));
  return set;
}
function similarity(a: string, b: string) {
  if (!a || !b) return 1;
  const x = shingles(a), y = shingles(b);
  let intersection = 0;
  for (const item of x) if (y.has(item)) intersection++;
  return intersection / Math.max(1, x.size + y.size - intersection);
}

function classify(old: Monitor, next: any) {
  const reasons: string[] = [];
  const types: string[] = [];
  if (old.last_status_code !== null && old.last_status_code !== next.status) {
    reasons.push(`HTTP status ${old.last_status_code} → ${next.status}`); types.push('status');
  }
  if (old.last_title && next.title && old.last_title !== next.title) {
    reasons.push('page title changed'); types.push('title');
  }
  if (old.last_hash && !sameArray(old.last_prices, next.prices)) {
    reasons.push('price values changed'); types.push('price');
  }
  if (old.last_hash && !sameArray(old.last_pack_sizes, next.packSizes)) {
    reasons.push('pack-size values changed'); types.push('pack_size');
  }
  if (old.last_hash && old.last_text_excerpt) {
    if (!sameArray(availability(old.last_text_excerpt), next.availability)) {
      reasons.push('availability/offer wording changed'); types.push('availability');
    }
    const score = similarity(old.last_text_excerpt, next.excerpt);
    const lengthDelta = Math.abs(old.last_text_excerpt.length - next.excerpt.length) / Math.max(1, old.last_text_excerpt.length);
    if (score < 0.82 || lengthDelta > 0.18) {
      reasons.push(`material page-content change (${Math.round((1 - score) * 100)}% structural delta)`); types.push('content');
    }
  }
  const type = types.includes('price') ? 'price' :
    types.includes('pack_size') ? 'pack_size' :
    types.includes('availability') ? 'availability' :
    types.includes('status') ? 'status' :
    types.includes('title') ? 'title' : 'content';
  return { meaningful: reasons.length > 0, reasons, type };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { success: false, error: 'method_not_allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceRole) return json(503, { success: false, error: 'server_not_configured' });

  const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date();

  const { data: due, error: dueError } = await db.from('live_web_monitors')
    .select('id,user_id,label,url,interval_minutes,last_status_code,last_title,last_hash,last_text_excerpt,last_prices,last_pack_sizes,last_changed_at')
    .eq('enabled', true)
    .lte('next_check_at', now.toISOString())
    .order('next_check_at', { ascending: true })
    .limit(20);

  if (dueError) return json(500, { success: false, error: dueError.message });

  const results: any[] = [];
  for (const monitor of (due || []) as Monitor[]) {
    const minutes = Math.max(15, Number(monitor.interval_minutes || 15));
    const nextCheck = new Date(Date.now() + minutes * 60_000).toISOString();
    try {
      const fetched = await fetchPage(monitor.url);
      const visible = textFromHtml(fetched.html);
      const stable = stableText(visible);
      const excerpt = stable.slice(0, 12_000);
      const next = {
        status: fetched.status,
        title: titleFromHtml(fetched.html),
        hash: await sha256(stable),
        excerpt,
        prices: prices(visible),
        packSizes: packs(visible),
        availability: availability(visible),
      };
      const first = !monitor.last_hash;
      const change = classify(monitor, next);
      let summary = first
        ? `Monitoring baseline established for ${monitor.label || new URL(monitor.url).hostname}.`
        : change.meaningful
          ? `${monitor.label || new URL(monitor.url).hostname}: ${change.reasons.join(' • ')}.`
          : `Checked ${monitor.label || new URL(monitor.url).hostname}; no meaningful change detected.`;
      summary = summary.slice(0, 1200);
      const changedAt = !first && change.meaningful ? new Date().toISOString() : monitor.last_changed_at;

      const { error: updateError } = await db.from('live_web_monitors').update({
        last_checked_at: new Date().toISOString(),
        next_check_at: nextCheck,
        last_status_code: next.status,
        last_title: next.title,
        last_hash: next.hash,
        last_text_excerpt: next.excerpt,
        last_prices: next.prices,
        last_pack_sizes: next.packSizes,
        last_changed_at: changedAt,
        last_summary: summary,
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq('id', monitor.id);
      if (updateError) throw updateError;

      if (!first && change.meaningful) {
        const severity = ['price', 'pack_size', 'availability', 'status'].includes(change.type) ? 'warning' : 'info';
        const { data: event, error: eventError } = await db.from('live_web_monitor_events').insert({
          monitor_id: monitor.id,
          user_id: monitor.user_id,
          change_type: change.type,
          severity,
          summary,
          old_hash: monitor.last_hash,
          new_hash: next.hash,
          metadata: { url: fetched.url, status: next.status, reasons: change.reasons, prices: next.prices, pack_sizes: next.packSizes, availability: next.availability },
        }).select('id').single();
        if (eventError) throw eventError;

        const { error: notifyError } = await db.from('system_notifications').insert({
          user_id: monitor.user_id,
          title: `Live Web change · ${monitor.label || new URL(monitor.url).hostname}`,
          message: summary,
          severity,
          category: 'live_web_monitor',
          action_url: `/live-web?monitor=${monitor.id}`,
          is_read: false,
          metadata: { source: 'live-web-monitor', monitor_id: monitor.id, event_id: event?.id, change_type: change.type, url: fetched.url },
        });
        if (notifyError) throw notifyError;
      }
      results.push({ id: monitor.id, ok: true, baseline: first, meaningful: !first && change.meaningful });
    } catch (error) {
      const message = (error instanceof Error ? error.message : 'monitor_check_failed').slice(0, 600);
      await db.from('live_web_monitors').update({
        last_checked_at: new Date().toISOString(),
        next_check_at: nextCheck,
        last_error: message,
        updated_at: new Date().toISOString(),
      }).eq('id', monitor.id);
      results.push({ id: monitor.id, ok: false, error: message });
    }
  }

  return json(200, {
    success: true,
    processed: results.length,
    changed: results.filter((x) => x.meaningful).length,
    failed: results.filter((x) => !x.ok).length,
    results,
  });
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Apikey, X-Market-Discovery-Worker-Secret",
};

const OPENAI_WEB_MODEL = Deno.env.get("OPENAI_MODEL_WEB_DISCOVERY") || "gpt-5.6-luna";
const MAX_SOURCE_URLS = 12;
type SupabaseClient = ReturnType<typeof createClient>;

type WebCandidate = {
  url: string;
  seller_name?: string | null;
  title?: string | null;
  brand?: string | null;
  size?: string | null;
  unit?: string | null;
  price_text?: string | null;
  reason?: string | null;
};

type IdentityDecision = {
  status: "VERIFIED" | "REVIEW_REQUIRED" | "REJECTED";
  reason: string | null;
  confidence: number;
  brandMatch: boolean;
  brandConflict: boolean;
  brandSource: "structured" | "title" | "missing" | "conflict";
  sourceBrand: string | null;
  nameMatch: boolean;
  sizeMatch: boolean | null;
  gtinMatch: boolean;
  sourceUnit: { quantity: number | null; unit: string | null };
  method: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function normaliseHost(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
  } catch { return null; }
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function canonicalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || !host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || isPrivateIpv4(host) || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|gclid|fbclid|mc_|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch { return null; }
}

function extractOutputText(response: any): string {
  if (typeof response?.output_text === 'string') return response.output_text;
  for (const item of response?.output || []) {
    if (item?.type !== 'message') continue;
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return '';
}

function extractSearchSources(response: any): string[] {
  const urls: string[] = [];
  for (const item of response?.output || []) {
    if (item?.type !== 'web_search_call') continue;
    for (const source of item?.action?.sources || []) if (typeof source?.url === 'string') urls.push(source.url);
  }
  return [...new Set(urls)].slice(0, MAX_SOURCE_URLS);
}

function parseJsonObject(text: string): any {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
  }
  return { candidates: [], queries: [] };
}

function normaliseWords(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() : '';
}

function normaliseFlat(value: unknown): string {
  return normaliseWords(value).replace(/\s+/g, '');
}

function phrasePresent(text: unknown, phrase: unknown): boolean {
  const haystack = normaliseWords(text);
  const needle = normaliseWords(phrase);
  if (!haystack || !needle) return false;
  return (` ${haystack} `).includes(` ${needle} `);
}

function identityName(value: unknown, brand?: unknown): string {
  let text = typeof value === 'string' ? value.toLowerCase() : '';
  if (typeof brand === 'string' && brand.trim()) {
    for (const token of brand.toLowerCase().split(/\s+/).filter(Boolean)) {
      text = text.replace(new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), ' ');
    }
  }
  text = text.replace(/\b\d+(?:\.\d+)?\s*(?:kg|kilograms?|g|grams?|gm|ml|millilit(?:re|er)s?|l|lit(?:re|er)s?|ltr|pcs?|pieces?|each|packs?|pk)\b/gi, ' ');
  return text.replace(/[^a-z0-9]/g, '');
}

function parseSellingUnit(sizeValue: unknown, unitValue: unknown, productName: unknown) {
  const unitRaw = typeof unitValue === 'string' ? unitValue.trim().toLowerCase() : '';
  const sizeRaw = typeof sizeValue === 'string' || typeof sizeValue === 'number' ? String(sizeValue).trim().toLowerCase() : '';
  const nameRaw = typeof productName === 'string' ? productName.toLowerCase() : '';
  const aliases: Record<string, string> = {
    kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kg: 'kg', gram: 'g', grams: 'g', gm: 'g', g: 'g',
    litre: 'l', litres: 'l', liter: 'l', liters: 'l', l: 'l', ltr: 'l',
    millilitre: 'ml', millilitres: 'ml', milliliter: 'ml', milliliters: 'ml', ml: 'ml',
    piece: 'each', pieces: 'each', pcs: 'each', pc: 'each', each: 'each', pack: 'pack', packs: 'pack', pk: 'pack',
  };
  const directUnit = aliases[unitRaw] || unitRaw || null;
  const directQty = Number.parseFloat(sizeRaw);
  if (Number.isFinite(directQty) && directQty > 0 && directUnit) return { quantity: directQty, unit: directUnit };
  const match = `${sizeRaw} ${nameRaw}`.match(/(\d+(?:\.\d+)?)\s*(kg|kilograms?|kilo|g|grams?|gm|ml|millilit(?:re|er)s?|l|lit(?:re|er)s?|ltr|pcs?|pieces?|each|packs?|pk)\b/i);
  if (!match) return { quantity: Number.isFinite(directQty) && directQty > 0 ? directQty : null, unit: directUnit };
  return { quantity: Number(match[1]), unit: aliases[match[2].toLowerCase()] || match[2].toLowerCase() };
}

function toCanonicalBase(quantity: number | null, unit: string | null) {
  if (!(quantity && quantity > 0) || !unit) return null;
  if (unit === 'kg') return { quantity: quantity * 1000, unit: 'g' };
  if (unit === 'g') return { quantity, unit: 'g' };
  if (unit === 'l') return { quantity: quantity * 1000, unit: 'ml' };
  if (unit === 'ml') return { quantity, unit: 'ml' };
  if (unit === 'each') return { quantity, unit: 'each' };
  return null;
}

function strictBrandEvidence(product: any, candidate: WebCandidate, extracted: any) {
  const targetBrand = normaliseFlat(product.brand);
  const structured = typeof extracted?.brand === 'string' && extracted.brand.trim()
    ? extracted.brand.trim()
    : (typeof candidate?.brand === 'string' && candidate.brand.trim() ? candidate.brand.trim() : null);
  const structuredNorm = normaliseFlat(structured);
  const titleText = `${extracted?.product_name || ''} ${candidate?.title || ''}`;
  const titleContainsTarget = Boolean(targetBrand && phrasePresent(titleText, product.brand));

  if (!targetBrand) return { match: false, conflict: false, source: 'missing' as const, sourceBrand: structured };
  if (structuredNorm) {
    if (structuredNorm === targetBrand) return { match: true, conflict: false, source: 'structured' as const, sourceBrand: structured };
    return { match: false, conflict: true, source: 'conflict' as const, sourceBrand: structured };
  }
  if (titleContainsTarget) return { match: true, conflict: false, source: 'title' as const, sourceBrand: product.brand };
  return { match: false, conflict: false, source: 'missing' as const, sourceBrand: null };
}

function directIdentity(product: any, canonical: any, candidate: WebCandidate, extracted: any) {
  const targetName = identityName(product.name, product.brand);
  const sourceName = identityName(extracted?.product_name || candidate?.title, product.brand);
  const nameMatch = Boolean(targetName && sourceName && targetName === sourceName);
  const targetGtin = String(product.gtin || '').replace(/\D/g, '');
  const sourceGtin = String(extracted?.gtin || '').replace(/\D/g, '');
  const gtinMatch = Boolean(targetGtin && sourceGtin && targetGtin === sourceGtin);
  const sourceUnit = parseSellingUnit(extracted?.size || candidate?.size, extracted?.unit || candidate?.unit, extracted?.product_name || candidate?.title);
  const sourceBase = toCanonicalBase(sourceUnit.quantity, sourceUnit.unit);
  let sizeMatch: boolean | null = null;
  if (canonical?.status === 'RESOLVED' && Number(canonical.base_quantity) > 0 && canonical.base_unit && sourceBase) {
    const targetQuantity = Number(canonical.base_quantity);
    const tolerance = Math.max(0.5, targetQuantity * 0.001);
    sizeMatch = sourceBase.unit === canonical.base_unit && Math.abs(sourceBase.quantity - targetQuantity) <= tolerance;
  }
  return { nameMatch, gtinMatch, sizeMatch, sourceUnit };
}

function classifyIdentity(product: any, canonical: any, candidate: WebCandidate, extracted: any, scannerMatch: any, scan: any): IdentityDecision {
  const brand = strictBrandEvidence(product, candidate, extracted);
  const direct = directIdentity(product, canonical, candidate, extracted);
  const scannerConfidenceRaw = Number(scannerMatch?.confidence ?? scan?.matchConfidence ?? 0);
  const scannerConfidence = scannerConfidenceRaw > 1 ? scannerConfidenceRaw / 100 : scannerConfidenceRaw;
  const scannerMatchesTarget = scannerMatch?.matched_product_id === product.id || scan?.matchedProductId === product.id;
  const logicalNameMatch = direct.nameMatch || (scannerMatchesTarget && scannerMatch?.product_type_match === true);
  const scannerSizeMatch = scannerMatchesTarget && scannerMatch?.size_match === true;
  const sizeMatch = direct.sizeMatch === true ? true : direct.sizeMatch === false ? false : (scannerSizeMatch ? true : null);
  const baseConfidence = Math.max(direct.gtinMatch ? 1 : 0, direct.nameMatch ? 0.94 : 0, scannerMatchesTarget ? scannerConfidence : 0);
  const method = direct.gtinMatch ? 'gtin' : direct.nameMatch ? 'direct_strict_identity' : (scannerMatch?.match_method || 'logical_review');

  if (brand.conflict) return { status: 'REJECTED', reason: `Brand mismatch: CentralHub ${product.brand || 'unknown'} vs competitor ${brand.sourceBrand || 'unknown'}`, confidence: baseConfidence, brandMatch: false, brandConflict: true, brandSource: brand.source, sourceBrand: brand.sourceBrand, nameMatch: logicalNameMatch, sizeMatch, gtinMatch: direct.gtinMatch, sourceUnit: direct.sourceUnit, method };
  if (brand.match && logicalNameMatch && sizeMatch === true) return { status: 'VERIFIED', reason: null, confidence: Math.max(0.95, baseConfidence), brandMatch: true, brandConflict: false, brandSource: brand.source, sourceBrand: brand.sourceBrand, nameMatch: true, sizeMatch: true, gtinMatch: direct.gtinMatch, sourceUnit: direct.sourceUnit, method };
  if (brand.match && logicalNameMatch) return { status: 'REVIEW_REQUIRED', reason: sizeMatch === false ? 'Brand and product name match, but selling weight/unit does not exactly match.' : 'Brand and product name match, but selling weight/unit could not be verified.', confidence: Math.max(0.85, baseConfidence), brandMatch: true, brandConflict: false, brandSource: brand.source, sourceBrand: brand.sourceBrand, nameMatch: true, sizeMatch, gtinMatch: direct.gtinMatch, sourceUnit: direct.sourceUnit, method };
  if (logicalNameMatch && !brand.match) return { status: 'REVIEW_REQUIRED', reason: 'Product name appears to match, but the competitor brand is missing or could not be verified exactly.', confidence: Math.max(0.8, baseConfidence), brandMatch: false, brandConflict: false, brandSource: brand.source, sourceBrand: brand.sourceBrand, nameMatch: true, sizeMatch, gtinMatch: direct.gtinMatch, sourceUnit: direct.sourceUnit, method };
  return { status: 'REJECTED', reason: 'Competitor product name did not logically match the CentralHub product.', confidence: baseConfidence, brandMatch: brand.match, brandConflict: false, brandSource: brand.source, sourceBrand: brand.sourceBrand, nameMatch: false, sizeMatch, gtinMatch: direct.gtinMatch, sourceUnit: direct.sourceUnit, method };
}

async function requireUser(admin: SupabaseClient, req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

async function verifyWorker(admin: SupabaseClient, req: Request): Promise<boolean> {
  const secret = req.headers.get('X-Market-Discovery-Worker-Secret') || '';
  if (!secret) return false;
  const { data, error } = await admin.rpc('market_discovery_verify_worker_secret', { p_secret: secret });
  return !error && data === true;
}

async function createRun(admin: SupabaseClient, requestedBy: string | null, targetScope = 'ALL_ACTIVE') {
  const { data: active } = await admin.from('market_discovery_runs').select('*').in('status', ['QUEUED', 'RUNNING']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (active) return { run: active, existing: true };
  const { data: settings } = await admin.from('market_discovery_settings').select('*').eq('singleton', true).maybeSingle();
  const { data: products, error: productError } = await admin.from('products').select('id').eq('is_active', true).eq('is_deleted', false).order('name');
  if (productError) throw productError;
  const productIds = (products || []).map((product: any) => product.id);
  const { data: run, error: runError } = await admin.from('market_discovery_runs').insert({
    requested_by: requestedBy,
    status: productIds.length ? 'QUEUED' : 'COMPLETED',
    target_scope: targetScope,
    country_code: settings?.country_code || 'GB',
    product_count: productIds.length,
    completed_at: productIds.length ? null : new Date().toISOString(),
    progress: { queued: productIds.length, running: 0, completed: 0, failed: 0, skipped: 0 },
  }).select('*').single();
  if (runError) throw runError;
  for (let offset = 0; offset < productIds.length; offset += 300) {
    const rows = productIds.slice(offset, offset + 300).map((productId: string) => ({ run_id: run.id, product_id: productId }));
    const { error } = await admin.from('market_discovery_jobs').insert(rows);
    if (error) throw error;
  }
  return { run, existing: false };
}

async function refreshRun(admin: SupabaseClient, runId: string) {
  const { data: jobs } = await admin.from('market_discovery_jobs').select('status,candidate_count,verified_count,review_required_count,failed_count').eq('run_id', runId);
  const counts = { queued: 0, running: 0, completed: 0, failed: 0, skipped: 0 } as Record<string, number>;
  let candidates = 0, verified = 0, review = 0, failedCandidates = 0;
  for (const job of jobs || []) {
    const key = String(job.status || '').toLowerCase(); counts[key] = (counts[key] || 0) + 1;
    candidates += Number(job.candidate_count || 0); verified += Number(job.verified_count || 0); review += Number(job.review_required_count || 0); failedCandidates += Number(job.failed_count || 0);
  }
  const processed = counts.completed + counts.failed + counts.skipped;
  const done = counts.queued === 0 && counts.running === 0;
  const status = done ? (counts.failed > 0 ? (processed > counts.failed ? 'PARTIAL' : 'FAILED') : 'COMPLETED') : 'RUNNING';
  const update: any = { status, products_processed: processed, candidates_discovered: candidates, candidates_verified: verified, candidates_review_required: review, candidates_failed: failedCandidates, progress: { ...counts, last_updated_at: new Date().toISOString() }, updated_at: new Date().toISOString() };
  if (done) update.completed_at = new Date().toISOString();
  const { data: run } = await admin.from('market_discovery_runs').update(update).eq('id', runId).select('*').single(); return run;
}

async function maybeQueueAutomaticRun(admin: SupabaseClient) {
  const { data: settings } = await admin.from('market_discovery_settings').select('*').eq('singleton', true).maybeSingle();
  if (!settings?.auto_refresh_enabled) return null;
  const { data: active } = await admin.from('market_discovery_runs').select('id').in('status', ['QUEUED', 'RUNNING']).limit(1).maybeSingle();
  if (active) return active;
  const { data: latest } = await admin.from('market_discovery_runs').select('completed_at,created_at').in('status', ['COMPLETED', 'PARTIAL']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const lastAt = latest?.completed_at || latest?.created_at;
  if (lastAt && Date.now() - new Date(lastAt).getTime() < Number(settings.refresh_interval_days || 7) * 86400000) return null;
  return (await createRun(admin, null, 'AUTO_REFRESH')).run;
}

async function callOpenAiWebSearch(product: any, canonical: any, openaiKey: string, maxCandidates: number, countryCode: string) {
  const canonicalSize = canonical?.status === 'RESOLVED' && canonical?.base_quantity && canonical?.base_unit ? `${canonical.base_quantity} ${canonical.base_unit}` : (product.weight && product.unit ? `${product.weight} ${product.unit}` : null);
  const target = { name: product.name, brand: product.brand || null, selling_size: canonicalSize, gtin: product.gtin || null };
  const prompt = `Search the public UK web for retailer product pages for this CentralHub product: ${JSON.stringify(target)}.\nIdentity rules: brand is mandatory for an exact match. Prefer pages whose product title explicitly contains the brand, product name and selling weight/unit. Extract the retailer brand separately even when it only appears inside the product title. Never treat a different brand as the same product. Product names may use natural wording variations, so use semantic judgement like a human, but do not relax brand or selling-size identity. Use GTIN when available. Return direct retailer product pages only, not search/category/blog pages or CentralHub-owned stores. Return at most ${maxCandidates} distinct sellers. Return JSON only with keys queries and candidates. Each candidate must contain url, seller_name, title, brand, size, unit, price_text, reason.`;
  const requestBody: any = { model: OPENAI_WEB_MODEL, tools: [{ type: 'web_search', user_location: { type: 'approximate', country: countryCode || 'GB' } }], include: ['web_search_call.action.sources'], input: prompt, text: { format: { type: 'json_schema', name: 'market_discovery', strict: true, schema: { type: 'object', additionalProperties: false, properties: { queries: { type: 'array', items: { type: 'string' }, maxItems: 6 }, candidates: { type: 'array', maxItems: maxCandidates, items: { type: 'object', additionalProperties: false, properties: { url: { type: 'string' }, seller_name: { type: ['string','null'] }, title: { type: ['string','null'] }, brand: { type: ['string','null'] }, size: { type: ['string','null'] }, unit: { type: ['string','null'] }, price_text: { type: ['string','null'] }, reason: { type: ['string','null'] } }, required: ['url','seller_name','title','brand','size','unit','price_text','reason'] } } }, required: ['queries','candidates'] } } } };
  let response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody), signal: AbortSignal.timeout(45000) });
  if (!response.ok) {
    const first = await response.text(); delete requestBody.text; requestBody.input = `${prompt}\nDo not use Markdown fences.`;
    response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody), signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`OpenAI web search failed (${response.status}): ${(await response.text()).slice(0,300)}; initial=${first.slice(0,120)}`);
  }
  const json = await response.json(); const parsed = parseJsonObject(extractOutputText(json));
  return { queries: Array.isArray(parsed?.queries) ? parsed.queries.slice(0, 6) : [], candidates: Array.isArray(parsed?.candidates) ? parsed.candidates.slice(0, maxCandidates) : [], sourceUrls: extractSearchSources(json), model: json?.model || OPENAI_WEB_MODEL };
}

async function callScanner(supabaseUrl: string, serviceRoleKey: string, action: string, body: Record<string, unknown>) {
  const response = await fetch(`${supabaseUrl}/functions/v1/competitor-price-scanner`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` }, body: JSON.stringify({ action, ...body }), signal: AbortSignal.timeout(60000) });
  const json = await response.json().catch(() => ({ success: false, error: `Scanner HTTP ${response.status}` }));
  return response.ok ? json : { success: false, error: json?.error || `Scanner HTTP ${response.status}` };
}

async function findOrCreateCompetitor(admin: SupabaseClient, sourceUrl: string, sellerName?: string | null) {
  const url = new URL(sourceUrl); const host = normaliseHost(sourceUrl)!;
  const { data: competitors } = await admin.from('competitors').select('id,name,website_url,is_active').not('website_url','is',null).limit(1000);
  const existing = (competitors || []).find((competitor: any) => normaliseHost(competitor.website_url) === host); if (existing) return existing;
  const { data, error } = await admin.from('competitors').insert({ name: sellerName?.trim() || host, website_url: `${url.protocol}//${url.host}`, is_active: true, discovery_status: 'discovered', last_discovery_at: new Date().toISOString() }).select('id,name,website_url,is_active').single(); if (error) throw error; return data;
}

async function processJob(admin: SupabaseClient, job: any, supabaseUrl: string, serviceRoleKey: string, openaiKey: string) {
  const now = new Date().toISOString();
  try {
    const [{ data: product, error: productError }, { data: canonical }, { data: settings }, { data: stores }] = await Promise.all([
      admin.from('products').select('id,name,brand,sku,gtin,weight,unit,is_active,is_deleted').eq('id', job.product_id).single(),
      admin.from('product_measurement_canonical').select('measurement_type,base_quantity,base_unit,confidence,status').eq('product_id', job.product_id).maybeSingle(),
      admin.from('market_discovery_settings').select('*').eq('singleton', true).maybeSingle(),
      admin.from('stores').select('domain'),
    ]);
    if (productError || !product) throw productError || new Error('Product not found');
    if (!product.is_active || product.is_deleted) { await admin.from('market_discovery_jobs').update({ status:'SKIPPED', completed_at:now, updated_at:now, last_error:'Product is inactive or deleted' }).eq('id', job.job_id); return refreshRun(admin, job.run_id); }
    const maxCandidates = Math.max(1, Math.min(10, Number(settings?.max_candidates_per_product || 3)));
    const search = await callOpenAiWebSearch(product, canonical, openaiKey, maxCandidates, settings?.country_code || 'GB');
    const ownDomains = new Set<string>((stores || []).map((store:any) => normaliseHost(store.domain)).filter((value:any): value is string => Boolean(value))); ownDomains.add('centralhub.network');
    const sourceSet = new Set<string>(search.sourceUrls.map((url:string) => canonicalUrl(url)).filter((value:any): value is string => Boolean(value)));
    const combined: WebCandidate[] = [...search.candidates];
    for (const sourceUrl of search.sourceUrls) if (combined.length < maxCandidates && !combined.some((candidate) => canonicalUrl(candidate.url) === canonicalUrl(sourceUrl))) combined.push({ url: sourceUrl, reason: 'OpenAI web search source' });
    const seen = new Set<string>();
    const candidates = combined.filter((candidate) => { const url = canonicalUrl(candidate.url || ''); if (!url || seen.has(url)) return false; const host = normaliseHost(url); if (!host || [...ownDomains].some((domain) => host === domain || host.endsWith(`.${domain}`))) return false; seen.add(url); candidate.url = url; return true; }).slice(0, maxCandidates);
    let verifiedCount = 0, reviewCount = 0, failedCount = 0;
    for (const candidate of candidates) {
      const host = normaliseHost(candidate.url)!;
      const { data: candidateRow, error: candidateError } = await admin.from('market_discovery_candidates').upsert({ run_id: job.run_id, job_id: job.job_id, product_id: product.id, source_url: candidate.url, source_domain: host, seller_name: candidate.seller_name || host, discovery_query: search.queries[0] || null, source_title: candidate.title || null, source_snippet: candidate.reason || null, status: 'DISCOVERED', discovery_metadata: { model: search.model, source_corroborated: sourceSet.has(candidate.url), candidate_brand: candidate.brand || null, candidate_size: candidate.size || null, candidate_unit: candidate.unit || null, candidate_price_text: candidate.price_text || null }, updated_at: new Date().toISOString() }, { onConflict:'job_id,source_url' }).select('*').single();
      if (candidateError || !candidateRow) { failedCount++; continue; }
      try {
        const scan = await callScanner(supabaseUrl, serviceRoleKey, 'scan_product_page', { url: candidate.url }); const extracted = scan?.data;
        if (!scan?.success || !extracted || !(Number(extracted.price) > 0)) { failedCount++; await admin.from('market_discovery_candidates').update({ status: 'FAILED', rejection_reason: scan?.error || 'Product page extraction failed', scanner_metadata: { scan_success:false, extraction_method:scan?.extractionMethod || null }, updated_at: new Date().toISOString() }).eq('id', candidateRow.id); continue; }
        const matchResponse = await callScanner(supabaseUrl, serviceRoleKey, 'match_catalog_products', { products:[{ name: extracted.product_name, brand: extracted.brand, price: extracted.price, currency: extracted.currency || 'GBP', availability: extracted.availability, sku: extracted.sku, gtin: extracted.gtin, size: extracted.size, unit: extracted.unit, variant: extracted.variant, image_url: extracted.image_url }] });
        const scannerMatch = matchResponse?.products?.[0] || {}; const decision = classifyIdentity(product, canonical, candidate, extracted, scannerMatch, scan);
        const commonCandidateUpdate = { extracted_product_name: extracted.product_name, extracted_brand: decision.sourceBrand || extracted.brand || null, extracted_size: extracted.size || candidate.size || null, extracted_unit: extracted.unit || candidate.unit || null, extracted_price: extracted.price, extracted_currency: extracted.currency || 'GBP', match_confidence: decision.confidence, match_method: decision.method, scanner_metadata: { identity_policy: 'BRAND_NAME_SIZE_STRICT_V2', brand_match: decision.brandMatch, brand_conflict: decision.brandConflict, brand_source: decision.brandSource, name_match: decision.nameMatch, size_match: decision.sizeMatch, gtin_match: decision.gtinMatch, scanner_match_reasons: scannerMatch.match_reasons || [], scanner_ai_used: scannerMatch.ai_used === true, scanner_ai_model: scannerMatch.ai_model || null, extraction_method: scan.extractionMethod || null }, updated_at: new Date().toISOString() };
        if (decision.status === 'REJECTED') { await admin.from('market_discovery_candidates').update({ ...commonCandidateUpdate, status: 'REJECTED', rejection_reason: decision.reason, matched_product_id: null }).eq('id', candidateRow.id); continue; }
        const competitor = await findOrCreateCompetitor(admin, candidate.url, candidate.seller_name);
        if (competitor.is_active === false) { await admin.from('market_discovery_candidates').update({ status:'REJECTED', rejection_reason:'This competitor is paused in CentralHub', competitor_id:competitor.id, updated_at:new Date().toISOString() }).eq('id', candidateRow.id); continue; }
        const parsedUnit = decision.sourceUnit.quantity ? decision.sourceUnit : parseSellingUnit(extracted.size, extracted.unit, extracted.product_name); const strongAutomatic = decision.status === 'VERIFIED';
        const { data: existingPrice } = await admin.from('competitor_prices').select('id,match_status').eq('product_id', product.id).eq('competitor_id', competitor.id).maybeSingle(); const effectiveMatchStatus = existingPrice?.match_status === 'manual' ? 'manual' : (strongAutomatic ? 'automatic' : 'pending');
        const { data: competitorPrice, error: priceError } = await admin.from('competitor_prices').upsert({ product_id: product.id, competitor_id: competitor.id, price: Number(extracted.price), product_url: candidate.url, auto_scan_enabled: true, last_scanned_at: now, last_successful_scan_at: now, scan_status: 'success', scan_error: null, next_scan_at: new Date(Date.now() + 86400000).toISOString(), extraction_status: scan.extractionMethod || 'web_discovery', source_product_name: extracted.product_name, source_brand: decision.sourceBrand || extracted.brand || null, source_sku: extracted.sku, source_gtin: extracted.gtin, source_currency: extracted.currency || 'GBP', source_regular_price: extracted.regular_price, source_sale_price: extracted.sale_price, source_stock_status: extracted.availability, source_size: extracted.size || candidate.size || null, source_variant: extracted.variant, source_image_url: extracted.image_url, source_unit_value: parsedUnit.quantity, source_unit_type: parsedUnit.unit, shipping_fee: Number(extracted.shipping_fee || 0), is_conditional: Boolean(extracted.is_conditional), promotion_detail: extracted.promotion_detail, match_confidence: decision.confidence, match_status: effectiveMatchStatus, match_method: decision.method, brand_match: decision.brandMatch, size_match: decision.sizeMatch === true, product_type_match: decision.nameMatch, ai_used: scannerMatch.ai_used === true || scan.openaiUsed === true || decision.method === 'ai', ai_model: scannerMatch.ai_model || search.model, data_source: 'openai_web_discovery', updated_at: new Date().toISOString() }, { onConflict:'product_id,competitor_id' }).select('id,authoritative_eligible,product_measurement_match,product_measurement_reason,data_quality_state,match_status').single();
        if (priceError || !competitorPrice) throw priceError || new Error('Could not store competitor price');
        if (decision.status === 'VERIFIED') verifiedCount++; else reviewCount++;
        await admin.from('market_discovery_candidates').update({ ...commonCandidateUpdate, status: decision.status, rejection_reason: decision.reason, matched_product_id: product.id, competitor_id: competitor.id, competitor_price_id: competitorPrice.id, scanner_metadata: { ...(commonCandidateUpdate.scanner_metadata as Record<string, unknown>), product_measurement_match: competitorPrice.product_measurement_match, authoritative_eligible: competitorPrice.authoritative_eligible, data_quality_state: competitorPrice.data_quality_state } }).eq('id', candidateRow.id);
      } catch (error:any) { failedCount++; await admin.from('market_discovery_candidates').update({ status:'FAILED', rejection_reason:String(error?.message || 'Candidate processing failed').slice(0,500), updated_at:new Date().toISOString() }).eq('id',candidateRow.id); }
    }
    await admin.from('market_discovery_jobs').update({ status:'COMPLETED', candidate_count:candidates.length, verified_count:verifiedCount, review_required_count:reviewCount, failed_count:failedCount, search_queries:search.queries, completed_at:new Date().toISOString(), updated_at:new Date().toISOString() }).eq('id',job.job_id); try { await admin.rpc('refresh_competitor_data_quality'); } catch {} return refreshRun(admin, job.run_id);
  } catch (error:any) { await admin.from('market_discovery_jobs').update({ status:'FAILED', last_error:String(error?.message || 'Market discovery failed').slice(0,1000), completed_at:new Date().toISOString(), updated_at:new Date().toISOString() }).eq('id',job.job_id); return refreshRun(admin, job.run_id); }
}

async function runWorker(admin: SupabaseClient, supabaseUrl: string, serviceRoleKey: string, openaiKey: string | null) {
  if (!openaiKey) throw new Error('OPENAI_API_KEY is not configured'); await maybeQueueAutomaticRun(admin);
  const { data: claimed, error } = await admin.rpc('market_discovery_claim_job'); if (error) throw error; const job = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!job) return { success:true, idle:true, message:'No queued market discovery jobs' };
  return { success:true, idle:false, processed_job_id:job.job_id, run:await processJob(admin, job, supabaseUrl, serviceRoleKey, openaiKey) };
}

async function getStatus(admin: SupabaseClient, runId?: string | null) {
  let query = admin.from('market_discovery_runs').select('*').order('created_at',{ascending:false}).limit(1); if (runId) query = admin.from('market_discovery_runs').select('*').eq('id',runId).limit(1);
  const { data:run } = await query.maybeSingle(); const { data:settings } = await admin.from('market_discovery_settings').select('*').eq('singleton',true).maybeSingle();
  let recentQuery = admin.from('market_discovery_candidates').select('id,run_id,product_id,source_url,source_domain,seller_name,status,rejection_reason,extracted_product_name,extracted_brand,extracted_size,extracted_unit,extracted_price,extracted_currency,match_confidence,created_at,product:products(name,brand),competitor:competitors(name)').order('created_at',{ascending:false}).limit(30); if (runId) recentQuery = recentQuery.eq('run_id',runId);
  const { data:recentCandidates } = await recentQuery; return { success:true, run:run || null, settings:settings || null, worker_interval_minutes:2, identity_policy:'BRAND_NAME_SIZE_STRICT_V2', recent_candidates:recentCandidates || [] };
}

Deno.serve(async (req:Request) => {
  if (req.method === 'OPTIONS') return new Response(null,{status:200,headers:corsHeaders}); if (req.method !== 'POST') return jsonResponse({success:false,error:'POST required'},405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!, serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, openaiKey = Deno.env.get('OPENAI_API_KEY'); const admin = createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
  try {
    const body = await req.json().catch(() => ({})); const action = String(body?.action || 'status');
    if (action === 'worker_tick') { if (!(await verifyWorker(admin,req))) return jsonResponse({success:false,error:'Invalid worker authentication'},401); return jsonResponse(await runWorker(admin,supabaseUrl,serviceRoleKey,openaiKey)); }
    const user = await requireUser(admin,req); if (!user) return jsonResponse({success:false,error:'Authenticated CentralHub session required'},401);
    if (action === 'queue_all') { const result = await createRun(admin,user.id,'ALL_ACTIVE'); return jsonResponse({success:true,run:result.run,existing:result.existing,message:result.existing ? 'A web discovery run is already active.' : `Queued ${result.run.product_count} active products for web discovery.`}); }
    if (action === 'process_next') return jsonResponse(await runWorker(admin,supabaseUrl,serviceRoleKey,openaiKey));
    if (action === 'status') return jsonResponse(await getStatus(admin,body?.run_id || null));
    if (action === 'set_auto_refresh') { const enabled = Boolean(body?.enabled); const intervalDays = Math.max(1,Math.min(90,Number(body?.refresh_interval_days || 7))); const { data,error } = await admin.from('market_discovery_settings').update({auto_refresh_enabled:enabled,refresh_interval_days:intervalDays,updated_at:new Date().toISOString()}).eq('singleton',true).select('*').single(); if (error) throw error; return jsonResponse({success:true,settings:data,message:enabled ? `Automatic web discovery enabled every ${intervalDays} days.` : 'Automatic web discovery disabled.'}); }
    if (action === 'cancel_run') { if (!body?.run_id) return jsonResponse({success:false,error:'run_id required'},400); await admin.from('market_discovery_jobs').update({status:'SKIPPED',completed_at:new Date().toISOString(),updated_at:new Date().toISOString(),last_error:'Cancelled by administrator'}).eq('run_id',body.run_id).eq('status','QUEUED'); await admin.from('market_discovery_runs').update({status:'CANCELLED',completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',body.run_id); return jsonResponse({success:true,message:'Web discovery run cancelled.'}); }
    return jsonResponse({success:false,error:`Unknown action: ${action}`},400);
  } catch (error:any) { console.error('[market-discovery]',error); return jsonResponse({success:false,error:String(error?.message || 'Market discovery failed').slice(0,1000)},500); }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Apikey, x-competitor-scan-secret",
};

type Listing = {
  name: string;
  brand: string | null;
  price: number | null;
  regular_price: number | null;
  sale_price: number | null;
  availability: string;
  sku: string | null;
  gtin: string | null;
  size: string | null;
  unit: string | null;
  variant: string | null;
  image_url: string | null;
  product_url: string;
  data_source: string;
  matched_product_id?: string | null;
  confidence?: number | null;
  match_method?: string | null;
  brand_match?: boolean | null;
  size_match?: boolean | null;
  product_type_match?: boolean | null;
  ai_used?: boolean | null;
  ai_model?: string | null;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const cleanBase = (value: string) => value.replace(/\/+$/, "");
const numberOrNull = (value: unknown) => {
  const n = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const confidence01 = (value: unknown) => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
};
const canonicalUrl = (value: string) => {
  try {
    const u = new URL(value);
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) if (/^(utm_|gclid|fbclid|ref$|source$)/i.test(key)) u.searchParams.delete(key);
    return u.toString();
  } catch { return value; }
};

function parseMeasurement(...parts: unknown[]) {
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  const m = text.match(/(\d+(?:\.\d+)?)\s*(kg|kilograms?|kilo|g|gm|grams?|ml|millilit(?:re|er)s?|l|lit(?:re|er)s?|ltr|pcs?|pieces?|each|packs?|packets?|pk)\b/i);
  if (!m) return { size: null as string | null, unit: null as string | null, value: null as number | null };
  const aliases: Record<string, string> = {
    kilogram: "kg", kilograms: "kg", kilo: "kg", kg: "kg",
    gram: "g", grams: "g", gm: "g", g: "g",
    litre: "l", litres: "l", liter: "l", liters: "l", ltr: "l", l: "l",
    millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml", ml: "ml",
    pc: "pcs", pcs: "pcs", piece: "pcs", pieces: "pcs", each: "pcs",
    pack: "pack", packs: "pack", packet: "pack", packets: "pack", pk: "pack",
  };
  const value = Number(m[1]);
  return { size: String(value), unit: aliases[m[2].toLowerCase()] || m[2].toLowerCase(), value };
}

async function authorize(req: Request, db: any, serviceRoleKey: string) {
  const cronSecret = String(req.headers.get("x-competitor-scan-secret") || "").trim();
  if (cronSecret) {
    const { data, error } = await db.rpc("verify_integration_cron_secret", {
      p_name: "competitor_scan_cron_secret",
      p_secret: cronSecret,
    });
    if (!error && data === true) return { ok: true, mode: "cron" };
  }

  const token = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, mode: "none" };
  if (token === serviceRoleKey) return { ok: true, mode: "service_role" };

  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData?.user) return { ok: false, mode: "invalid_user" };
  const { data: profile } = await db.from("user_profiles")
    .select("profile_role,is_active")
    .eq("id", userData.user.id)
    .maybeSingle();
  return profile?.profile_role === "admin" && profile?.is_active !== false
    ? { ok: true, mode: "admin" }
    : { ok: false, mode: "forbidden" };
}

async function fetchShopify(baseUrl: string): Promise<{ items: Listing[]; complete: boolean; method: string }> {
  const items: Listing[] = [];
  let complete = false;
  let previousFirstId: string | null = null;

  for (let page = 1; page <= 25; page++) {
    const response = await fetch(`${baseUrl}/products.json?limit=250&page=${page}`, {
      headers: { "User-Agent": "CentralHub-MarketIntel/4.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      if (page === 1) return { items: [], complete: false, method: "shopify-json" };
      break;
    }
    const payload = await response.json().catch(() => ({}));
    const products = Array.isArray(payload?.products) ? payload.products : [];
    if (!products.length) { complete = true; break; }

    const firstId = String(products[0]?.id ?? "");
    if (page > 1 && firstId && firstId === previousFirstId) break;
    previousFirstId = firstId || previousFirstId;

    for (const product of products) {
      const variants = Array.isArray(product?.variants) && product.variants.length ? product.variants : [null];
      for (const variant of variants) {
        const variantName = variant?.title && variant.title !== "Default Title" ? String(variant.title) : null;
        const fullName = [product?.title, variantName].filter(Boolean).join(" ");
        const measurement = parseMeasurement(variantName, product?.title);
        const price = numberOrNull(variant?.price);
        const compareAt = numberOrNull(variant?.compare_at_price);
        const onSale = !!(price && compareAt && compareAt > price);
        const variantId = variant?.id ? String(variant.id) : null;
        const url = canonicalUrl(`${baseUrl}/products/${product?.handle || ""}${variantId ? `?variant=${variantId}` : ""}`);

        items.push({
          name: fullName || String(product?.title || "Unknown product"),
          brand: product?.vendor ? String(product.vendor) : null,
          price,
          regular_price: compareAt || price,
          sale_price: onSale ? price : null,
          availability: variant?.available === true ? "in_stock" : variant?.available === false ? "out_of_stock" : "unknown",
          sku: variant?.sku ? String(variant.sku) : null,
          gtin: variant?.barcode ? String(variant.barcode) : null,
          size: measurement.size,
          unit: measurement.unit,
          variant: variantName,
          image_url: product?.images?.[0]?.src || product?.image?.src || null,
          product_url: url,
          data_source: "shopify-json",
        });
      }
    }
    if (products.length < 250) { complete = true; break; }
  }
  return { items, complete, method: "shopify-json" };
}

async function fetchWooCommerce(baseUrl: string): Promise<{ items: Listing[]; complete: boolean; method: string }> {
  const items: Listing[] = [];
  let complete = false;

  for (let page = 1; page <= 25; page++) {
    const response = await fetch(`${baseUrl}/wp-json/wc/store/v1/products?per_page=100&page=${page}`, {
      headers: { "User-Agent": "CentralHub-MarketIntel/4.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      if (page === 1) return { items: [], complete: false, method: "woocommerce-store-api" };
      break;
    }
    const products = await response.json().catch(() => []);
    if (!Array.isArray(products) || !products.length) { complete = true; break; }

    for (const product of products) {
      const minor = Number(product?.prices?.currency_minor_unit ?? 2);
      const divisor = Math.pow(10, Number.isFinite(minor) ? minor : 2);
      const priceRaw = numberOrNull(product?.prices?.price);
      const regularRaw = numberOrNull(product?.prices?.regular_price);
      const saleRaw = numberOrNull(product?.prices?.sale_price);
      const price = priceRaw == null ? null : priceRaw / divisor;
      const regular = regularRaw == null ? price : regularRaw / divisor;
      const sale = saleRaw == null ? null : saleRaw / divisor;
      const measurement = parseMeasurement(product?.name, product?.short_description);
      const image = Array.isArray(product?.images) ? product.images[0]?.src : null;
      items.push({
        name: String(product?.name || "Unknown product"),
        brand: null,
        price,
        regular_price: regular,
        sale_price: sale && regular && sale < regular ? sale : null,
        availability: product?.is_in_stock === true ? "in_stock" : product?.is_in_stock === false ? "out_of_stock" : "unknown",
        sku: product?.sku ? String(product.sku) : null,
        gtin: null,
        size: measurement.size,
        unit: measurement.unit,
        variant: null,
        image_url: image || null,
        product_url: canonicalUrl(String(product?.permalink || `${baseUrl}/?p=${product?.id}`)),
        data_source: "woocommerce-store-api",
      });
    }
    if (products.length < 100) { complete = true; break; }
  }
  return { items, complete, method: "woocommerce-store-api" };
}

function extractLocs(xml: string) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(m => m[1].replace(/&amp;/g, "&").trim());
}

async function fetchSitemapUrls(baseUrl: string): Promise<{ urls: string[]; complete: boolean; method: string }> {
  const roots = ["/sitemap.xml", "/sitemap_index.xml", "/product-sitemap.xml", "/sitemap_products_1.xml"];
  const productUrls = new Set<string>();
  const childSitemaps = new Set<string>();
  let found = false;
  let capped = false;

  for (const path of roots) {
    try {
      const response = await fetch(`${baseUrl}${path}`, { headers: { "User-Agent": "CentralHub-MarketIntel/4.0" }, signal: AbortSignal.timeout(12000) });
      if (!response.ok) continue;
      const xml = await response.text();
      found = true;
      for (const loc of extractLocs(xml)) {
        if (/\.xml(\?|$)/i.test(loc)) childSitemaps.add(loc);
        else if (/\/(products?|shop|item)\//i.test(loc)) productUrls.add(canonicalUrl(loc));
      }
    } catch {}
  }

  for (const sitemap of [...childSitemaps].filter(u => /product|shop/i.test(u)).slice(0, 30)) {
    try {
      const response = await fetch(sitemap, { headers: { "User-Agent": "CentralHub-MarketIntel/4.0" }, signal: AbortSignal.timeout(12000) });
      if (!response.ok) continue;
      const xml = await response.text();
      for (const loc of extractLocs(xml)) {
        if (!/\.xml(\?|$)/i.test(loc)) productUrls.add(canonicalUrl(loc));
        if (productUrls.size >= 2000) { capped = true; break; }
      }
      if (capped) break;
    } catch {}
  }
  return { urls: [...productUrls].slice(0, 2000), complete: found && !capped, method: "sitemap" };
}

async function scannerCall(supabaseUrl: string, serviceRoleKey: string, action: string, body: Record<string, unknown>) {
  const response = await fetch(`${supabaseUrl}/functions/v1/competitor-price-scanner`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Apikey": serviceRoleKey,
    },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) throw new Error(data?.error || `Scanner ${action} failed (${response.status})`);
  return data;
}

async function resolveStructuredListings(items: Listing[], supabaseUrl: string, serviceRoleKey: string) {
  const resolved: Listing[] = [];
  for (let i = 0; i < items.length; i += 40) {
    const batch = items.slice(i, i + 40);
    const result = await scannerCall(supabaseUrl, serviceRoleKey, "match_catalog_products", {
      products: batch.map(item => ({
        name: item.name,
        brand: item.brand,
        price: item.price,
        currency: "GBP",
        availability: item.availability,
        sku: item.sku,
        gtin: item.gtin,
        size: item.size,
        unit: item.unit,
        variant: item.variant,
        image_url: item.image_url,
        product_url: item.product_url,
        regular_price: item.regular_price,
        sale_price: item.sale_price,
      })),
    });
    const rows = Array.isArray(result?.products) ? result.products : [];
    rows.forEach((row: any, index: number) => resolved.push({ ...batch[index], ...row }));
  }
  return resolved;
}

async function resolveSitemapListings(urls: string[], supabaseUrl: string, serviceRoleKey: string) {
  const resolved: Listing[] = [];
  const limit = Math.min(urls.length, 120);
  for (let i = 0; i < limit; i += 6) {
    const group = urls.slice(i, i + 6);
    const results = await Promise.allSettled(group.map(url => scannerCall(supabaseUrl, serviceRoleKey, "scan_single", { url })));
    results.forEach((result, index) => {
      const url = group[index];
      if (result.status !== "fulfilled" || !result.value?.data) return;
      const scan = result.value;
      const data = scan.data;
      const measurement = parseMeasurement(data.size, data.unit, data.product_name);
      resolved.push({
        name: data.product_name || decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "Unknown product").replace(/[-_]+/g, " "),
        brand: data.brand || null,
        price: numberOrNull(data.price),
        regular_price: numberOrNull(data.regular_price) || numberOrNull(data.price),
        sale_price: numberOrNull(data.sale_price),
        availability: data.availability || "unknown",
        sku: data.sku || null,
        gtin: data.gtin || null,
        size: data.size || measurement.size,
        unit: data.unit || measurement.unit,
        variant: data.variant || null,
        image_url: data.image_url || null,
        product_url: url,
        data_source: "sitemap-page-scan",
        matched_product_id: scan.matchedProductId || null,
        confidence: scan.matchConfidence ?? 0,
        match_method: scan.matchMethod || null,
      });
    });
  }
  return { items: resolved, processed: limit, complete: limit === urls.length };
}

function candidateScore(item: Listing) {
  const confidence = confidence01(item.confidence);
  const stock = item.availability === "in_stock" ? 0.2 : 0;
  const regular = item.sale_price ? 0 : 0.05;
  return confidence + stock + regular;
}

async function persistResults(db: any, competitor: any, items: Listing[], discoveryComplete: boolean, method: string) {
  const now = new Date().toISOString();
  const existingPrices = await db.from("competitor_prices")
    .select("id,product_id,product_url,match_status")
    .eq("competitor_id", competitor.id);
  const existingByProduct = new Map((existingPrices.data || []).map((r: any) => [r.product_id, r]));
  const discoveredUrls = new Set(items.map(item => canonicalUrl(item.product_url)));

  let automatic = 0, review = 0, unmatched = 0, priceRows = 0, catalogRows = 0;
  const bestByProduct = new Map<string, Listing>();

  for (const item of items) {
    const confidence = confidence01(item.confidence);
    const matchedId = item.matched_product_id || null;
    const matchStatus = matchedId ? (confidence >= 0.95 ? "automatic" : confidence >= 0.80 ? "pending" : "rejected") : "rejected";
    if (matchStatus === "automatic") automatic++;
    else if (matchStatus === "pending") review++;
    else unmatched++;

    const catalogPayload = {
      competitor_id: competitor.id,
      matched_product_id: matchedId,
      name: item.name || "Unknown product",
      price: item.price,
      product_url: item.product_url,
      image_url: item.image_url,
      status: matchedId ? "price_analysis" : "purchase_opportunity",
      match_status: matchStatus,
      match_method: item.match_method || null,
      brand_match: item.brand_match ?? null,
      size_match: item.size_match ?? null,
      product_type_match: item.product_type_match ?? null,
      ai_used: item.ai_used ?? false,
      ai_model: item.ai_model || null,
      matched_at: matchedId ? now : null,
      source_brand: item.brand,
      source_sku: item.sku,
      source_gtin: item.gtin,
      source_size: item.size,
      source_unit: item.unit,
      source_currency: "GBP",
      source_regular_price: item.regular_price,
      source_sale_price: item.sale_price,
      source_availability: item.availability,
      source_image_url: item.image_url,
      last_scanned_at: now,
      updated_at: now,
      data_source: `full_catalog:${method}`,
    };
    const { error: catalogError } = await db.from("competitor_catalog_items")
      .upsert(catalogPayload, { onConflict: "competitor_id,product_url" });
    if (!catalogError) catalogRows++;

    if (!matchedId || confidence < 0.80 || !item.price) continue;
    const current = bestByProduct.get(matchedId);
    if (!current || candidateScore(item) > candidateScore(current)) bestByProduct.set(matchedId, item);
  }

  const intervalHours = /1 hour/i.test(competitor.scan_frequency || "") ? 1 : /3 hour/i.test(competitor.scan_frequency || "") ? 3 : /12 hour/i.test(competitor.scan_frequency || "") ? 12 : 6;
  const nextScan = new Date(Date.now() + intervalHours * 3600000).toISOString();

  for (const [productId, item] of bestByProduct.entries()) {
    const confidence = confidence01(item.confidence);
    const existing = existingByProduct.get(productId);
    const automaticStatus = confidence >= 0.95 ? "automatic" : "pending";
    const matchStatus = existing?.match_status === "manual" ? "manual" : automaticStatus;
    const measurement = parseMeasurement(item.size, item.unit, item.name, item.variant);
    const payload = {
      product_id: productId,
      competitor_id: competitor.id,
      price: item.price,
      product_url: item.product_url,
      auto_scan_enabled: true,
      last_scanned_at: now,
      last_successful_scan_at: now,
      next_scan_at: nextScan,
      scan_status: "success",
      scan_error: null,
      extraction_status: "structured_catalog",
      match_status: matchStatus,
      match_confidence: matchStatus === "manual" ? 1 : confidence,
      match_method: item.match_method || (matchStatus === "manual" ? "manual" : "catalog_match"),
      brand_match: item.brand_match ?? null,
      size_match: item.size_match ?? null,
      product_type_match: item.product_type_match ?? null,
      ai_used: item.ai_used ?? false,
      ai_model: item.ai_model || null,
      source_product_name: item.name,
      source_brand: item.brand,
      source_sku: item.sku,
      source_gtin: item.gtin,
      source_size: item.size,
      source_variant: item.variant,
      source_currency: "GBP",
      source_regular_price: item.regular_price,
      source_sale_price: item.sale_price,
      source_stock_status: item.availability,
      source_unit_value: measurement.value,
      source_unit_type: measurement.unit,
      source_image_url: item.image_url,
      is_conditional: false,
      data_source: `full_catalog:${method}`,
      discovered_at: now,
    };
    const { error } = await db.from("competitor_prices").upsert(payload, { onConflict: "product_id,competitor_id" });
    if (!error) priceRows++;
  }

  let notSeen = 0;
  if (discoveryComplete && discoveredUrls.size) {
    const missingIds = (existingPrices.data || []).filter((row: any) => row.product_url && !discoveredUrls.has(canonicalUrl(row.product_url))).map((row: any) => row.id);
    for (let i = 0; i < missingIds.length; i += 100) {
      const ids = missingIds.slice(i, i + 100);
      const { error } = await db.from("competitor_prices").update({ scan_status: "not_seen", scan_error: "Not present in latest full catalogue scan", last_scanned_at: now }).in("id", ids);
      if (!error) notSeen += ids.length;
    }
  }

  try { await db.rpc("refresh_competitor_data_quality"); } catch {}
  return { automatic, review, unmatched, priceRows, catalogRows, notSeen };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "POST required" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const access = await authorize(req, db, serviceRoleKey);
    if (!access.ok) return json({ success: false, error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const competitorId = body.competitor_id || body.competitorId;
    if (!competitorId) return json({ success: false, error: "Missing competitor_id" }, 400);

    const { data: competitor, error: competitorError } = await db.from("competitors").select("*").eq("id", competitorId).eq("is_active", true).maybeSingle();
    if (competitorError) throw competitorError;
    if (!competitor?.website_url) return json({ success: false, error: "Active competitor or website URL not found" }, 404);

    const startedAt = new Date().toISOString();
    const { data: session } = await db.from("competitor_discovery_sessions").insert({ competitor_id: competitor.id, status: "in_progress", started_at: startedAt, method: "full_catalog", progress: { phase: "discovering" } }).select("id").maybeSingle();

    await db.from("competitors").update({ discovery_status: "discovering", last_discovery_requested_at: startedAt, last_scan_status: "running" }).eq("id", competitor.id);

    const baseUrl = cleanBase(competitor.website_url);
    let discovery = await fetchShopify(baseUrl);
    if (!discovery.items.length) discovery = await fetchWooCommerce(baseUrl);

    let resolved: Listing[] = [];
    let discoveredCount = 0;
    let discoveryComplete = discovery.complete;
    let method = discovery.method;
    let fallbackProcessed = 0;

    if (discovery.items.length) {
      discoveredCount = discovery.items.length;
      resolved = await resolveStructuredListings(discovery.items, supabaseUrl, serviceRoleKey);
    } else {
      const sitemap = await fetchSitemapUrls(baseUrl);
      discoveredCount = sitemap.urls.length;
      discoveryComplete = sitemap.complete;
      method = sitemap.method;
      const sitemapResolved = await resolveSitemapListings(sitemap.urls, supabaseUrl, serviceRoleKey);
      resolved = sitemapResolved.items;
      fallbackProcessed = sitemapResolved.processed;
      if (!sitemapResolved.complete) discoveryComplete = false;

      const now = new Date().toISOString();
      const resolvedUrls = new Set(resolved.map(item => item.product_url));
      for (const url of sitemap.urls) {
        if (resolvedUrls.has(url)) continue;
        const slug = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "Discovered product").replace(/[-_]+/g, " ");
        await db.from("competitor_catalog_items").upsert({ competitor_id: competitor.id, matched_product_id: null, name: slug, price: null, product_url: url, image_url: null, status: "purchase_opportunity", match_status: "pending", last_scanned_at: now, updated_at: now, data_source: "full_catalog:sitemap" }, { onConflict: "competitor_id,product_url" });
      }
    }

    const persisted = await persistResults(db, competitor, resolved, discoveryComplete, method);
    const completedAt = new Date().toISOString();
    const status = discoveryComplete && resolved.length > 0 ? "success" : resolved.length > 0 ? "partial" : "failed";
    const stats = {
      discovered: discoveredCount,
      processed_for_matching: resolved.length,
      exact_matches: persisted.automatic,
      review_matches: persisted.review,
      unmatched: persisted.unmatched,
      catalog_rows_saved: persisted.catalogRows,
      price_rows_refreshed: persisted.priceRows,
      no_longer_seen: persisted.notSeen,
      method,
      discovery_complete: discoveryComplete,
      fallback_pages_processed: fallbackProcessed,
    };

    await db.from("competitors").update({ last_scan_at: completedAt, last_successful_scan_at: persisted.priceRows > 0 ? completedAt : competitor.last_successful_scan_at, last_scan_status: status, discovery_status: status === "failed" ? "failed" : discoveryComplete ? "completed" : "partial", discovery_progress: stats, last_discovery_at: completedAt }).eq("id", competitor.id);

    if (session?.id) await db.from("competitor_discovery_sessions").update({ status: status === "failed" ? "failed" : "completed", method, progress: stats, completed_at: completedAt }).eq("id", session.id);

    return json({ success: status !== "failed", status, competitor: competitor.name, ...stats, auth_mode: access.mode, message: `${competitor.name}: discovered ${discoveredCount} listings · ${persisted.automatic} exact · ${persisted.review} review · ${persisted.priceRows} price rows refreshed${discoveryComplete ? "" : " · partial catalogue fallback"}` });
  } catch (error: any) {
    console.error("competitor-full-catalog-scan", error);
    return json({ success: false, error: error?.message || "Full catalogue scan failed" }, 500);
  }
});
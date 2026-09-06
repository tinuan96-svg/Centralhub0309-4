// Competitor Price Scanner v3 — fixed audit logging, match persistence, error handling
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Use environment variables for model configuration with hierarchy fallbacks
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL_COMPETITOR_MATCHING") || Deno.env.get("OPENAI_MODEL_FAST") || "gpt-4o-mini";
const EXTRACTION_MODEL = Deno.env.get("OPENAI_MODEL_PRODUCT_EXTRACTION") || Deno.env.get("OPENAI_MODEL_FAST") || "gpt-4o-mini";

const REJECT_UI_PHRASES = [
  "add to cart", "buy now", "quick view", "view", "wishlist", "compare", "login", "register",
  "checkout", "continue shopping", "select options", "choose options", "sale", "off", "save",
  "reduced", "buy 1 get 1", "bogo", "in stock", "out of stock", "reviews", "delivery", "shipping",
  "price", "price:", "basket", "my account"
];

interface ExtractedProduct {
  product_name: string | null;
  brand: string | null;
  price: number | null;
  regular_price: number | null;
  sale_price: number | null;
  currency: string;
  availability: string | null;
  sku: string | null;
  gtin: string | null;
  size: string | null;
  unit: string | null;
  variant: string | null;
  image_url: string | null;
  shipping_fee: number | null;
  is_conditional: boolean;
  promotion_detail: string | null;
  confidence: number;
  price_type: "regular" | "sale";
  promotion: string | null;
  extraction_notes: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const action = body.action || "scan";

    if (action === "scan_single" || action === "scan_product_page") {
      const url: string | undefined = body.url;
      const competitorPriceId: string | undefined = body.competitorPriceId;
      if (!url) return new Response(JSON.stringify({ success: false, error: "Missing url" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const scanResult = await processUrl(url, supabase, openaiKey, competitorPriceId);
      return new Response(JSON.stringify(scanResult), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "scan_competitor") {
      const { competitor_id } = body;
      if (!competitor_id) return new Response(JSON.stringify({ success: false, error: "Missing competitor_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const { data: dueScans, error: fetchError } = await supabase
        .from("competitor_prices")
        .select(`
          id,
          product_url,
          products!inner(is_active)
        `)
        .eq("competitor_id", competitor_id)
        .eq("auto_scan_enabled", true)
        .eq("products.is_active", true)
        .not("product_url", "is", null)
        .limit(30);

      if (fetchError) throw fetchError;

      const results: any[] = [];
      let successCount = 0;
      let failCount = 0;

      for (const entry of (dueScans || [])) {
        const result = await processUrl(entry.product_url, supabase, openaiKey, entry.id);
        if (result.success) successCount++; else failCount++;
        results.push({ id: entry.id, success: result.success, url: entry.product_url });
      }

      // Also scan catalog items with URLs that haven't been linked to prices yet
      const { data: catalogUrls } = await supabase
        .from("competitor_catalog_items")
        .select("id, product_url, name")
        .eq("competitor_id", competitor_id)
        .not("product_url", "is", null)
        .limit(10);

      for (const item of (catalogUrls || [])) {
        const result = await processUrl(item.product_url, supabase, openaiKey);
        if (result.success) successCount++; else failCount++;
        results.push({ id: item.id, success: result.success, url: item.product_url });
      }

      // Update competitor scan status
      const now = new Date().toISOString();
      await supabase.from("competitors").update({
        last_scan_at: now,
        last_successful_scan_at: successCount > 0 ? now : undefined,
        last_scan_status: failCount === 0 && successCount > 0 ? "success" : successCount > 0 ? "partial" : "failed",
      }).eq("id", competitor_id);

      return new Response(JSON.stringify({
        success: true,
        processed: results.length,
        succeeded: successCount,
        failed: failCount,
        message: `Scanned ${results.length} URLs: ${successCount} succeeded, ${failCount} failed`,
        results,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "scan") {
      const { data: dueScans, error: fetchError } = await supabase
        .from("competitor_prices")
        .select(`
          id,
          product_url,
          products!inner(is_active)
        `)
        .eq("auto_scan_enabled", true)
        .eq("products.is_active", true)
        .lt("next_scan_at", new Date().toISOString())
        .not("product_url", "is", null)
        .limit(20);
      if (fetchError) throw fetchError;
      const results = [];
      for (const entry of (dueScans || [])) {
        const result = await processUrl(entry.product_url, supabase, openaiKey, entry.id);
        results.push({ id: entry.id, success: result.success });
      }
      return new Response(JSON.stringify({ success: true, processed: results.length, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "discover") {
        const { competitor_id } = body;
        if (!competitor_id) return new Response(JSON.stringify({ success: false, error: "Missing competitor_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        try {
          await supabase.from("competitors").update({ discovery_status: "discovering" }).eq("id", competitor_id);
          const { data: session } = await supabase.from("competitor_discovery_sessions").insert({
            competitor_id, status: "in_progress", started_at: new Date().toISOString()
          }).select().single();
          const result = await discoverCatalog(competitor_id, session?.id, supabase, openaiKey);
          return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (err: any) {
          try { await supabase.from("competitors").update({ discovery_status: "failed" }).eq("id", competitor_id); } catch {}
          return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
    }

    if (action === "discover_catalog") {
        const { competitorId, sessionId } = body;
        if (!competitorId) return new Response(JSON.stringify({ success: false, error: "Missing competitorId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const result = await discoverCatalog(competitorId, sessionId, supabase, openaiKey);
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "reprocess") {
       const { data: contaminated } = await supabase
        .from("competitor_prices")
        .select("id, product_url, source_product_name")
        .or(`source_product_name.ilike.%add to cart%,source_product_name.ilike.%price%,source_product_name.ilike.%off%`)
        .limit(5);
       const results = [];
       for (const entry of (contaminated || [])) {
         const result = await processUrl(entry.product_url, supabase, openaiKey, entry.id);
         results.push({ id: entry.id, success: result.success, name: result.data?.product_name });
       }
       return new Response(JSON.stringify({ success: true, batch_size: results.length, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "scan_catalog_page") {
        const { url } = body;
        if (!url) return new Response(JSON.stringify({ success: false, error: "Missing url" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        try {
            const fetchResponse = await fetch(url, {
                headers: { "User-Agent": "CentralHub-CatalogScanner/2.0" },
                signal: AbortSignal.timeout(20000),
            });
            if (!fetchResponse.ok) throw new Error(`HTTP ${fetchResponse.status}`);
            const html = await fetchResponse.text();

            const baseUrl = new URL(url).origin;
            const products = [
                ...extractProductsFromJsonLd(html, baseUrl),
                ...extractProductsFromHtmlPatterns(html, baseUrl)
            ];

            // Unique by URL
            const uniqueProducts = Array.from(new Map(products.map(p => [p.product_url, p])).values());

            // Authoritative AI Matching right during scan for better preview
            const resolvedProducts = [];
            for (const p of uniqueProducts) {
                const match = await findProductMatch(supabase, {
                    product_name: p.name,
                    brand: null,
                    price: p.price,
                    currency: "GBP",
                    availability: "unknown",
                    sku: null,
                    gtin: null,
                    size: null,
                    variant: null,
                    image_url: p.image_url,
                    shipping_fee: 0,
                    is_conditional: false,
                    promotion_detail: null,
                    confidence: 0,
                    price_type: "regular",
                    promotion: null,
                    extraction_notes: []
                }, openaiKey);

                resolvedProducts.push({
                    ...p,
                    matched_product_id: match.productId,
                    confidence: match.confidence,
                    match_reasons: match.reasons,
                    match_method: match.method,
                    ...match.meta
                });
            }

            return new Response(JSON.stringify({
                success: true,
                products: resolvedProducts,
                siteName: resolvedProducts.length > 0 ? new URL(url).hostname : null
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (err: any) {
            return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
    }

    if (action === "match_catalog_products") {
        const { products: inputProducts } = body;
        if (!inputProducts || !Array.isArray(inputProducts)) {
            return new Response(JSON.stringify({ success: false, error: "Missing products array" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const resolvedProducts = [];
        for (const p of inputProducts) {
            const match = await findProductMatch(supabase, {
                product_name: p.name,
                brand: p.brand || null,
                price: p.price,
                currency: p.currency || "GBP",
                availability: p.availability || "unknown",
                sku: p.sku || null,
                gtin: p.gtin || null,
                size: p.size || null,
                variant: p.variant || null,
                image_url: p.image_url || null,
                shipping_fee: 0,
                is_conditional: false,
                promotion_detail: null,
                confidence: 0,
                price_type: "regular",
                promotion: null,
                extraction_notes: []
            }, openaiKey);

            resolvedProducts.push({
                ...p,
                matched_product_id: match.productId,
                confidence: match.confidence,
                match_reasons: match.reasons,
                match_method: match.method,
                ...match.meta
            });
        }

        return new Response(JSON.stringify({
            success: true,
            products: resolvedProducts
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: false, error: `Unknown action: ${action}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("Edge Function Error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

const BRAND_ALIASES: Record<string, string> = {
  "ajmi": "ajmi",
  "ajmi foods": "ajmi",
  "eastern": "eastern",
  "eastern condiments": "eastern",
  "nirapara": "nirapara",
  "double horse": "double horse",
  "manjilas": "double horse",
  "brahmin": "brahmins",
  "brahmins": "brahmins",
  "pavizham": "pavizham",
  "elite": "elite",
  "grandma": "grandma",
  "saras": "saras",
  "ks": "ks",
  "nellara": "nellara",
  "melam": "melam",
  "periyar": "periyar",
  "mtr": "mtr",
  "haldiram": "haldirams",
  "haldirams": "haldirams",
  "ashirvaad": "aashirvaad",
  "aashirvaad": "aashirvaad",
  "green valley": "green valley",
  "tasty nibbles": "tasty nibbles",
  "aachi": "aachi",
  "malabar treats": "malabar treats",
  "elite malabar": "elite malabar",
  "top op": "top op",
  "grandmas": "grandmas",
  "prince foods": "prince foods",
  "unitaste": "unitaste",
  "keralagroceries": "kerala groceries",
  "malluspices": "mallu spices"
};

/**
 * Robust Product Normalization
 * Higher precision deterministic extractor
 */
function normalizeProductData(name: string, brand?: string | null, structuredWeight?: any, structuredUnit?: string | null) {
  // 0. Remove junk and UI patterns without losing meaning
  let cleaned = name.toLowerCase();

  // Replace HTML entities
  cleaned = cleaned.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');

  // Remove UI noise
  const uiPatterns = [
    /by\s+/g, /brand\s*:/g, /regular price\s*:/g, /sale price\s*:/g,
    /price\s*:/g, /\d+%\s*off/g, /buy \d+ get \d+/g, /free delivery/g,
    /quick view/g, /add to cart/g, /select options/g
  ];
  uiPatterns.forEach(p => { cleaned = cleaned.replace(p, " "); });

  // Clean special characters but preserve amp and decimal points
  cleaned = cleaned.replace(/[^a-z0-9\s.gklmpx&]/g, " ").replace(/\s+/g, " ").trim();

  // 1. Extract size and unit
  const sizeRegex = /(\d+(?:\.\d+)?)\s*(kg|g|ml|l|pcs|packet|packets|pack|pk|x|pieces|piece|gm|grams|gram|kilo|litre|litres)/i;
  const sizeMatch = cleaned.match(sizeRegex);

  let size = structuredWeight ? parseFloat(structuredWeight) : null;
  let unit = structuredUnit ? structuredUnit.toLowerCase() : null;

  if (sizeMatch) {
    // String extraction takes precedence if present, as it's often more specific to the variant
    size = parseFloat(sizeMatch[1]);
    const rawUnit = sizeMatch[2].toLowerCase();

    // Canonical units
    if (['g', 'gm', 'gram', 'grams'].includes(rawUnit)) unit = 'g';
    else if (['kg', 'kilo'].includes(rawUnit)) unit = 'kg';
    else if (['ml'].includes(rawUnit)) unit = 'ml';
    else if (['l', 'litre', 'litres'].includes(rawUnit)) unit = 'l';
    else if (['pcs', 'piece', 'pieces'].includes(rawUnit)) unit = 'pcs';
    else if (['pack', 'pk', 'packet', 'packets'].includes(rawUnit)) unit = 'pack';
    else unit = rawUnit;

    cleaned = cleaned.replace(sizeRegex, " ").replace(/\s+/g, " ").trim();
  } else if (unit) {
      // Normalize structured unit
      if (['g', 'gm', 'gram', 'grams'].includes(unit)) unit = 'g';
      else if (['kg', 'kilo'].includes(unit)) unit = 'kg';
      else if (['ml'].includes(unit)) unit = 'ml';
      else if (['l', 'litre', 'litres'].includes(unit)) unit = 'l';
      else if (['pcs', 'piece', 'pieces'].includes(unit)) unit = 'pcs';
  }

  // 2. Normalize Brand
  let detectedBrand = brand?.toLowerCase().trim() || null;
  if (detectedBrand && BRAND_ALIASES[detectedBrand]) {
    detectedBrand = BRAND_ALIASES[detectedBrand];
  }

  // If no brand provided, try to detect from the string
  let brandInName = null;
  for (const [alias, canonical] of Object.entries(BRAND_ALIASES)) {
    if (cleaned.includes(alias)) {
      if (!detectedBrand) detectedBrand = canonical;
      brandInName = alias;
      break;
    }
  }

  // Keywords for searching (excluding brand if possible)
  let searchCleaned = cleaned;
  if (brandInName) {
      searchCleaned = searchCleaned.replace(brandInName, " ");
  } else if (detectedBrand) {
      searchCleaned = searchCleaned.replace(detectedBrand, " ");
  }
  const keywords = searchCleaned.split(' ').filter(w => w.length >= 4).map(w => w.trim());

  return {
    brand: detectedBrand,
    type: cleaned, // The descriptive part of the name
    size,
    unit,
    keywords,
    canonical_name: `${detectedBrand || ''} ${cleaned} ${size || ''}${unit || ''}`.replace(/\s+/g, " ").trim()
  };
}

/**
 * AI Product Discovery Logic
 * Identifies platform -> Extracts Sitemap/JSON -> Batched Matching
 */
async function discoverCatalog(competitorId: string, sessionId: string | undefined, supabase: any, openaiKey: string | undefined) {
    const { data: competitor } = await supabase.from("competitors").select("*").eq("id", competitorId).single();
    if (!competitor || !competitor.website_url) return { success: false, error: "Competitor URL not found" };

    const baseUrl = competitor.website_url.replace(/\/$/, "");
    let discoveredItems: any[] = [];
    let method = "none";

    // 1. Check for Shopify JSON catalog (Highest efficiency)
    try {
        const res = await fetch(`${baseUrl}/products.json?limit=250`, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
            const data = await res.json();
            if (data.products && Array.isArray(data.products)) {
                discoveredItems = data.products.map((p: any) => ({
                    name: p.title,
                    price: parseFloat(p.variants?.[0]?.price),
                    url: `${baseUrl}/products/${p.handle}`,
                    brand: p.vendor,
                    sku: p.variants?.[0]?.sku,
                    image_url: p.images?.[0]?.src
                }));
                method = "shopify-json";
            }
        }
    } catch(e) { console.warn("Shopify discovery failed", e); }

    // 2. Fallback to Sitemap
    if (discoveredItems.length === 0) {
        try {
            const res = await fetch(`${baseUrl}/sitemap_products_1.xml`, { signal: AbortSignal.timeout(10000) });
            if (res.ok) {
                const xml = await res.text();
                const urls = xml.match(/<loc>(https?:\/\/[^<]+)<\/loc>/gi)?.map(l => l.replace(/<\/?loc>/g, ""));
                if (urls && urls.length > 0) {
                   // Sitemap found - we'd need to fetch some sample URLs to extract data
                   // For MVP discovery, we'll mark the method and process first 10
                   discoveredItems = urls.slice(0, 50).map(u => ({ url: u, name: "Discovered from Sitemap" }));
                   method = "sitemap";
                }
            }
        } catch(e) {}
    }

    // 3. Batch Match discovered items vs CentralHub Products (Only active ones)
    const { data: ourProducts } = await supabase.from("products").select("id, name, brand, weight, unit, gtin, sku").eq("is_deleted", false).eq("is_active", true);

    let stats = { total: discoveredItems.length, automatic: 0, review: 0, no_match: 0, new_opportunities: 0, errors: 0 };

    for (const item of discoveredItems) {
        // If we only have URL (from sitemap), we need to extract full data first
        let itemData = item;
        if (method === "sitemap") {
            const extract = await processUrl(item.url, supabase, openaiKey);
            if (extract.success && extract.data) itemData = { ...extract.data, url: item.url };
            else { stats.errors++; continue; }
        }

        // Use existing scoring engine
        const match = await findProductMatch(supabase, {
            product_name: itemData.name || itemData.product_name,
            brand: itemData.brand,
            price: itemData.price,
            gtin: itemData.gtin,
            sku: itemData.sku,
            size: itemData.size || null,
            currency: "GBP", availability: "in_stock", regular_price: null, sale_price: null, variant: null, image_url: null, confidence: 0, price_type: "regular", promotion: null, extraction_notes: []
        }, openaiKey);

        if (match.productId && match.confidence >= 95) {
            await upsertCompetitorPrice(supabase, itemData, match.productId, competitorId, "automatic", match.confidence, match.reasons, match);
            stats.automatic++;
        } else if (match.productId && match.confidence >= 80) {
            await upsertCompetitorPrice(supabase, itemData, match.productId, competitorId, "pending", match.confidence, match.reasons, match);
            stats.review++;
        } else {
            // New Product Opportunity
            await supabase.from("competitor_catalog_items").upsert({
                competitor_id: competitorId,
                name: itemData.name || itemData.product_name,
                price: itemData.price || null,
                product_url: itemData.url,
                image_url: itemData.image_url || null,
                status: "purchase_opportunity",
                confidence_score: match.confidence,
                match_reasons: match.reasons,
                match_method: match.method,
                brand_match: match.meta?.brand_match ?? null,
                size_match: match.meta?.size_match ?? null,
                product_type_match: match.meta?.product_type_match ?? null,
                ai_used: match.meta?.ai_used || false,
                ai_model: match.meta?.ai_model || null,
                source_brand: itemData.brand || null,
                source_sku: itemData.sku || null,
                source_gtin: itemData.gtin || null,
                source_size: itemData.size ? String(itemData.size) : null,
                source_unit: itemData.unit || null,
                source_currency: itemData.currency || "GBP",
                source_regular_price: itemData.regular_price || null,
                source_sale_price: itemData.sale_price || null,
                source_availability: itemData.availability || null,
                source_image_url: itemData.image_url || null,
                last_scanned_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }, { onConflict: "competitor_id,product_url" });
            stats.new_opportunities++;
        }
    }

    // 4. Update session
    if (sessionId) {
      try {
        await supabase.from("competitor_discovery_sessions").update({
            status: "completed",
            progress: stats,
            completed_at: new Date().toISOString()
        }).eq("id", sessionId);
      } catch(e) { console.warn("[discoverCatalog] Session update failed:", e); }
    }

    try {
      await supabase.from("competitors").update({
        discovery_status: "completed",
        discovery_progress: stats,
        last_discovery_at: new Date().toISOString()
      }).eq("id", competitorId);
    } catch(e) { console.warn("[discoverCatalog] Competitor status update failed:", e); }

    return { success: true, method, stats };
}

async function upsertCompetitorPrice(supabase: any, data: any, productId: string, competitorId: string, status: string, confidence: number, reasons: string[], match: any = {}) {
    const meta = match.meta || {};
    const updateData = {
        product_id: productId,
        competitor_id: competitorId,
        price: data.price || null,
        product_url: data.url || data.product_url,
        match_status: status,
        match_confidence: confidence,
        match_method: match.method || null,
        brand_match: meta.brand_match ?? null,
        size_match: meta.size_match ?? null,
        product_type_match: meta.product_type_match ?? null,
        ai_used: meta.ai_used || false,
        ai_model: meta.ai_model || null,
        auto_scan_enabled: true,
        source_product_name: data.name || data.product_name || null,
        source_brand: data.brand || null,
        source_sku: data.sku || null,
        source_gtin: data.gtin || null,
        source_image_url: data.image_url || null,
        source_currency: data.currency || "GBP",
        source_regular_price: data.regular_price || null,
        source_sale_price: data.sale_price || null,
        source_stock_status: data.availability || null,
        source_size: data.size ? String(data.size) : null,
        source_variant: data.variant || null,
        is_conditional: data.is_conditional || false,
        scan_status: data.price && data.price > 0 ? "success" : "no_price",
        last_scanned_at: new Date().toISOString(),
        last_successful_scan_at: data.price && data.price > 0 ? new Date().toISOString() : null,
        next_scan_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        discovered_at: new Date().toISOString()
    };
    await supabase.from("competitor_prices").upsert(updateData, { onConflict: "product_id,competitor_id" });

    // Also update the catalog item with extracted data
    if (data.url || data.product_url) {
      await supabase.from("competitor_catalog_items").upsert({
        competitor_id: competitorId,
        matched_product_id: productId,
        name: data.name || data.product_name || null,
        price: data.price || null,
        product_url: data.url || data.product_url,
        image_url: data.image_url || null,
        status: "price_analysis",
        match_status: status,
        match_method: match.method || null,
        brand_match: meta.brand_match ?? null,
        size_match: meta.size_match ?? null,
        product_type_match: meta.product_type_match ?? null,
        ai_used: meta.ai_used || false,
        ai_model: meta.ai_model || null,
        matched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source_brand: data.brand || null,
        source_sku: data.sku || null,
        source_gtin: data.gtin || null,
        source_size: data.size ? String(data.size) : null,
        source_unit: data.unit || null,
        source_currency: data.currency || "GBP",
        source_regular_price: data.regular_price || null,
        source_sale_price: data.sale_price || null,
        source_availability: data.availability || null,
        source_image_url: data.image_url || null,
        last_scanned_at: new Date().toISOString()
      }, { onConflict: "competitor_id,product_url" });
    }
}

async function processUrl(url: string, supabase: any, openaiKey: string | undefined, priceId?: string) {
  const scanId = crypto.randomUUID();
  let openaiUsed = false;
  let extractionMethod = "deterministic";

  try {
    const fetchResponse = await fetch(url, {
      headers: { "User-Agent": "CentralHub-PriceMonitor/2.0 (Resilient-Bot)" },
      signal: AbortSignal.timeout(20000),
    });

    if (!fetchResponse.ok) {
      await logAudit(supabase, "SCAN_FAILED", { url, error: `HTTP ${fetchResponse.status}` }, priceId);
      return { success: false, error: `HTTP ${fetchResponse.status}` };
    }

    const html = await fetchResponse.text();

    // 1. Stage A: Deterministic Extraction
    let extracted = extractDeterministicData(html, url);

    // 2. Stage B: OpenAI Normalization (GPT-5.6 Luna)
    const isContaminated = extracted.product_name && isInvalidProductName(extracted.product_name);
    if (!extracted.price || !extracted.product_name || isContaminated || extracted.confidence < 90) {
      // Check if AI-assisted extraction is enabled in settings
      let aiEnabled = true;
      try {
        const { data: aiSetting } = await supabase.from("pricing_settings")
          .select("ai_assisted_extraction")
          .is("store_id", null)
          .maybeSingle();
        aiEnabled = aiSetting?.ai_assisted_extraction !== false;
      } catch {}

      if (openaiKey && aiEnabled) {
        const lunaData = await extractWithLuna(html, url, openaiKey, supabase);
        if (lunaData) {
          extracted = mergeExtractedData(extracted, lunaData);
          openaiUsed = true;
          extractionMethod = "openai-luna";
        }
      }
    }

    if (extracted.product_name && isInvalidProductName(extracted.product_name)) {
        extracted.product_name = cleanContaminatedName(extracted.product_name);
    }

    // 3. Get Previous Data
    let previousPrice = null;
    let previousCurrency = "GBP";
    let scanFrequency = "24 hours";
    let matchedProductId = null;
    let matchStatus = "pending";

    if (priceId) {
      const { data: oldRecord } = await supabase.from("competitor_prices")
        .select("price, source_currency, scan_frequency, product_id, match_status")
        .eq("id", priceId)
        .single();

      if (oldRecord) {
        previousPrice = oldRecord.price;
        previousCurrency = oldRecord.source_currency || "GBP";
        scanFrequency = oldRecord.scan_frequency;
        matchedProductId = oldRecord.product_id;
        matchStatus = oldRecord.match_status;
      }
    }

    // 4. Price Anomaly Detection
    const validation = validatePrice(extracted, previousPrice, previousCurrency);
    const isSuspicious = validation.status === "review_required";

    // 5. Evidence-Based Product Matching
    let matchConfidence = 0;
    let matchReasons = [];
    let matchMethod = "none";
    let matchMeta = {};

    if (matchStatus === "manual" && matchedProductId) {
      matchConfidence = 100;
      matchReasons = ["Preserved manual match"];
      matchMethod = "manual";
    } else {
      const matchResult = await findProductMatch(supabase, extracted, openaiKey);
      matchedProductId = matchResult.productId;
      matchConfidence = matchResult.confidence;
      matchReasons = matchResult.reasons;
      matchMethod = matchResult.method;
      matchMeta = matchResult.meta || {};

      if (matchConfidence >= 95) matchStatus = "automatic";
      else if (matchConfidence >= 80) matchStatus = "pending";
      else matchStatus = "pending";
    }

    const nextScanAt = calculateNextScan(scanFrequency);

    // 6. Update Database (SNAPSHOT ONLY)
    // CRITICAL: Hard block on price = 0 (Requirement 6)
    const finalPrice = (extracted.price && extracted.price > 0) ? extracted.price : previousPrice;
    const scanStatus = (extracted.price && extracted.price > 0) ? (isSuspicious ? "review_required" : "success") : "failed";
    const scanError = (extracted.price && extracted.price > 0) ? (isSuspicious ? validation.error : null) : "Extraction returned zero or null price";

    const updatePayload = {
      price: finalPrice,
      data_source: openaiUsed ? "ai_scan" : "scan",
      last_scanned_at: new Date().toISOString(),
      last_successful_scan_at: (extracted.price && extracted.price > 0) ? new Date().toISOString() : null,
      scan_status: scanStatus,
      scan_error: scanError,
      next_scan_at: nextScanAt,
      extraction_status: openaiUsed ? "ai_normalized" : "deterministic",
      source_product_name: extracted.product_name,
      source_brand: extracted.brand,
      source_sku: extracted.sku,
      source_gtin: extracted.gtin,
      source_currency: extracted.currency,
      source_regular_price: extracted.regular_price,
      source_sale_price: extracted.sale_price,
      source_stock_status: extracted.availability,
      source_size: extracted.size,
      source_variant: extracted.variant,
      source_image_url: extracted.image_url,
      source_unit_value: extracted.size ? parseFloat(extracted.size) : null,
      source_unit_type: extracted.unit,
      shipping_fee: extracted.shipping_fee || 0,
      is_conditional: extracted.is_conditional || false,
      promotion_detail: extracted.promotion_detail,
      match_confidence: matchConfidence,
      match_status: matchStatus,
      match_method: matchMethod,
      brand_match: (matchMeta as any).brand_match,
      size_match: (matchMeta as any).size_match,
      product_type_match: (matchMeta as any).product_type_match,
      ai_used: (matchMeta as any).ai_used || false,
      ai_model: (matchMeta as any).ai_model,
      ...(matchedProductId ? { product_id: matchedProductId } : {}),
    };

    if (priceId) {
      if (extracted.price && extracted.price > 0 && !isSuspicious && previousPrice !== null && previousPrice !== extracted.price) {
        await supabase.from("competitor_price_history").insert({
          competitor_price_id: priceId,
          product_id: matchedProductId,
          old_price: previousPrice,
          new_price: extracted.price,
          percentage_change: ((extracted.price - previousPrice) / previousPrice) * 100,
          currency: extracted.currency,
          source_price_type: extracted.price_type,
          scan_id: scanId
        });
        await logAudit(supabase, "PRICE_CHANGED", { old: previousPrice, new: extracted.price, scan_id: scanId }, priceId);
      }
      const { error: updateError } = await supabase.from("competitor_prices").update(updatePayload).eq("id", priceId);
      if (updateError) console.error("[processUrl] DB update failed:", updateError.message, "priceId:", priceId);

      // Refresh Data Quality State
      try { await supabase.rpc('refresh_competitor_data_quality'); } catch(e) { console.warn("[processUrl] refresh_competitor_data_quality failed:", e); }
    }

    const auditAction = isSuspicious ? "SUSPICIOUS_PRICE_DETECTED" : matchedProductId ? "EXTRACTION_SUCCESS" : "PRODUCT_MATCH_REVIEW_REQUIRED";
    await logAudit(supabase, auditAction, {
      product_name: extracted.product_name,
      confidence: matchConfidence,
      reasons: matchReasons,
      openai_used: openaiUsed,
      extraction_method: extractionMethod,
      validation_error: validation.error
    }, priceId);

    return { success: !isSuspicious, data: extracted, matchedProductId, matchConfidence, openaiUsed, extractionMethod };

  } catch (err: any) {
    console.error("Process URL Error:", err);
    if (priceId) {
      try {
        const { data: existing } = await supabase.from("competitor_prices")
          .select("price, scan_status")
          .eq("id", priceId)
          .maybeSingle();
        const preservePrice = existing?.price && existing.price > 0 ? existing.price : null;
        await supabase.from("competitor_prices").update({
          scan_status: "failed",
          scan_error: err.message?.substring(0, 500) || "Unknown error",
          last_scanned_at: new Date().toISOString(),
          ...(preservePrice ? { price: preservePrice } : {})
        }).eq("id", priceId);
      } catch (updateErr) {
        console.error("[ProcessUrl] Failed to update error state:", updateErr);
      }
    }
    try { await logAudit(supabase, "SCAN_ERROR", { error: err.message?.substring(0, 500), url }, priceId); } catch {}
    return { success: false, error: err.message };
  }
}

function isInvalidProductName(name: string): boolean {
    const lower = name.toLowerCase();

    // 1. Exact matches for UI elements
    if (REJECT_UI_PHRASES.some(phrase => lower === phrase)) return true;

    // 2. Contains junk and is short (likely a button/label)
    const junkKeywords = ["add to cart", "buy now", "quick view", "out of stock", "in stock", "wishlist"];
    if (junkKeywords.some(k => lower.includes(k)) && name.length < 35) return true;

    // 3. String starts with price or currency symbol
    if (/^[£$€]\s*\d+/.test(name)) return true;

    // 4. Just numbers/price pattern
    if (/^\d+(\.\d+)?$/.test(name)) return true;

    return false;
}

function cleanContaminatedName(name: string): string {
    let cleaned = name;
    // Remove "Add to cart" junk
    cleaned = cleaned.replace(/add to cart/gi, "");
    // Remove percentages off
    cleaned = cleaned.replace(/\d+%\s*off/gi, "");
    // Remove price patterns like "Price£3.39"
    cleaned = cleaned.replace(/(price|regular price|sale price)?\s*[£$€]\s*\d+(\.\d+)?/gi, "");
    // Remove "Out of stock"
    cleaned = cleaned.replace(/out of stock|in stock/gi, "");

    // Final trim and cleanup multiple spaces
    return cleaned.replace(/\s+/g, " ").trim();
}

function extractDeterministicData(html: string, url: string): ExtractedProduct {
  const result: ExtractedProduct = {
    product_name: null, brand: null, price: null, regular_price: null, sale_price: null,
    currency: "GBP", availability: "unknown", sku: null, gtin: null, size: null, unit: null,
    variant: null, image_url: null, shipping_fee: 0, is_conditional: false, promotion_detail: null,
    confidence: 0, price_type: "regular", promotion: null, extraction_notes: []
  };

  // 1. JSON-LD (Standard for WooCommerce/Shopify)
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatch) {
    for (const block of jsonLdMatch) {
      try {
        const jsonStr = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
        const parsed = JSON.parse(jsonStr);
        const item = Array.isArray(parsed) ? parsed.find(i => i["@type"] === "Product" || i["@type"]?.includes("Product")) : parsed;

        if (item && (item["@type"]?.includes("Product"))) {
          const rawName = item.name || null;
          if (rawName && !isInvalidProductName(rawName)) result.product_name = rawName;

          result.brand = (typeof item.brand === "string" ? item.brand : (item.brand?.name || item.brand?.["@name"])) || result.brand;
          result.sku = item.sku || result.sku;

          if (item.offers) {
            const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
            // Find lowest available price
            const validOffers = offers.filter(o => !isNaN(parseFloat(o.price)) && parseFloat(o.price) > 0);
            if (validOffers.length > 0) {
              const bestOffer = validOffers.sort((a, b) => parseFloat(a.price) - parseFloat(b.price))[0];
              result.price = parseFloat(bestOffer.price);
              result.currency = bestOffer.priceCurrency || result.currency;
              result.availability = bestOffer.availability?.includes("InStock") ? "in_stock" : "out_of_stock";
            }
          }
        }
      } catch (e) {}
    }
  }

  // 2. OpenGraph Meta Tags
  if (!result.price) {
    const ogPrice = html.match(/<meta[^>]*property=["']og:price:amount["'][^>]*content=["']([^"']+)["']/i);
    if (ogPrice) result.price = parseFloat(ogPrice[1]);
  }

  // 3. Regular Expressions for common HTML price formats (Fallback)
  if (!result.price || result.price <= 0) {
    // Look for patterns like £3.99, £ 3.99, 3.99 GBP
    const priceRegex = /(?:£|GBP|&pound;)\s*(\d+(?:\.\d{2}))|(\d+(?:\.\d{2}))\s*(?:£|GBP)/gi;
    let match;
    const prices = [];
    while ((match = priceRegex.exec(html)) !== null) {
      const p = parseFloat(match[1] || match[2]);
      if (p > 0 && p < 1000) prices.push(p);
    }
    // Take the most frequent or lowest price found in the HTML body
    if (prices.length > 0) {
      result.price = Math.min(...prices);
      result.extraction_notes.push("Price extracted via regex fallback");
    }
  }

  if (result.product_name && result.price) {
    const norm = normalizeProductData(result.product_name, result.brand);
    result.size = norm.size ? String(norm.size) : result.size;
    result.unit = norm.unit || result.unit;
    result.brand = norm.brand || result.brand;
    result.confidence = 90;
  }

  return result;
}

async function extractWithLuna(html: string, url: string, apiKey: string, supabase?: any): Promise<ExtractedProduct | null> {
  const startTime = Date.now();
  const bodyContent = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
  const cleanText = bodyContent
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .substring(0, 10000);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      messages: [
        { role: "system", content: "Extract clean ecommerce product data. CRITICAL: Product name must NOT include UI text (Add to Cart), Prices, or Promotional labels (20% OFF). Keep brand and size separate. Detect if the price is conditional (e.g., Membership only, First-time buyer) and identify the shipping fee if mentioned." },
        { role: "user", content: `Extract from: ${cleanText}` }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "clean_product_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              product_name: { type: ["string", "null"] },
              brand: { type: ["string", "null"] },
              price: { type: ["number", "null"] },
              regular_price: { type: ["number", "null"] },
              sale_price: { type: ["number", "null"] },
              currency: { type: "string" },
              promotion: { type: ["string", "null"] },
              availability: { type: ["string", "null"], enum: ["in_stock", "out_of_stock", "unknown", null] },
              sku: { type: ["string", "null"] },
              gtin: { type: ["string", "null"] },
              size: { type: ["string", "null"] },
              unit: { type: ["string", "null"] },
              variant: { type: ["string", "null"] },
              image_url: { type: ["string", "null"] },
              shipping_fee: { type: ["number", "null"] },
              is_conditional: { type: "boolean" },
              promotion_detail: { type: ["string", "null"] },
              confidence: { type: "number" },
              price_type: { type: "string", enum: ["regular", "sale"] },
              extraction_notes: { type: "array", items: { type: "string" } }
            },
            required: [
              "product_name", "brand", "price", "regular_price", "sale_price", "currency",
              "promotion", "availability", "sku", "gtin", "size", "unit", "variant", "image_url",
              "shipping_fee", "is_conditional", "promotion_detail",
              "confidence", "price_type", "extraction_notes"
            ]
          }
        }
      }
    })
  });

  if (!response.ok) return null;
  const result = await response.json();
  const data = JSON.parse(result.choices[0].message.content);

  // Log usage if supabase client available
  if (supabase) {
    await supabase.from('ai_usage_logs').insert({
        feature: 'product_extraction',
        model: EXTRACTION_MODEL,
        request_type: 'extraction',
        prompt_tokens: result.usage?.prompt_tokens,
        completion_tokens: result.usage?.completion_tokens,
        total_tokens: result.usage?.total_tokens,
        duration_ms: Date.now() - startTime,
        status: 'success'
    });
  }

  return data;
}

async function findProductMatch(supabase: any, data: ExtractedProduct, openaiKey?: string) {
  const logPrefix = `[ProductMatch] "${data.product_name}"`;
  const rejections: string[] = [];

  // 1. LEVEL 1 & 2: GTIN/SKU (100% confidence)
  if (data.gtin) {
    const { data: prod } = await supabase.from("products").select("id, name").eq("gtin", data.gtin).eq("is_deleted", false).eq("is_active", true).maybeSingle();
    if (prod) return { productId: prod.id, confidence: 100, method: "gtin", reasons: ["Exact GTIN match"] };
  }
  if (data.sku) {
    const { data: prod } = await supabase.from("products").select("id, name").eq("sku", data.sku).eq("is_deleted", false).eq("is_active", true).maybeSingle();
    if (prod) return { productId: prod.id, confidence: 100, method: "sku", reasons: ["Exact SKU match"] };
  }

  if (!data.product_name) return { productId: null, confidence: 0, method: "none", reasons: ["No product name"] };

  // 2. NORMALIZATION
  const normRemote = normalizeProductData(data.product_name, data.brand, data.size);
  // Detailed log for debugging rejections
  const debugInfo = `Remote normalized: brand=${normRemote.brand}, size=${normRemote.size}${normRemote.unit}, type=${normRemote.type}`;

  // 3. CANDIDATE GENERATION
  if (normRemote.keywords.length === 0) return { productId: null, confidence: 0, method: "none", reasons: ["No descriptive keywords"] };

  let query = supabase.from("products")
    .select("id, name, brand, weight, unit, sku, gtin, category")
    .eq("is_deleted", false)
    .eq("is_active", true);

  // Use up to 4 search terms
  const searchTerms = normRemote.keywords.slice(0, 4);
  query = query.or(searchTerms.map(k => `name.ilike.%${k}%`).join(','));

  const { data: rawCandidates } = await query.limit(50);
  if (!rawCandidates || rawCandidates.length === 0) {
    return { productId: null, confidence: 0, method: "none", reasons: ["No candidates found for keywords: " + searchTerms.join(',')] };
  }

  // 4. HARD IDENTITY RULES & DETERMINISTIC SCORING
  let candidates: any[] = [];

  for (const c of rawCandidates) {
    const normLocal = normalizeProductData(c.name, c.brand || null, c.weight, c.unit);

    // RULE A: Brand Match
    let brandMatch = false;
    if (normLocal.brand && normRemote.brand) {
      if (normLocal.brand !== normRemote.brand) {
        rejections.push(`"${c.name}": Brand mismatch (${normLocal.brand} vs ${normRemote.brand})`);
        continue;
      }
      brandMatch = true;
    }

    // RULE B: Size Match
    let sizeMatch = false;
    if (normLocal.size && normRemote.size) {
      const localValue = (normLocal.unit === 'kg' || normLocal.unit === 'l') ? normLocal.size * 1000 : normLocal.size;
      const remoteValue = (normRemote.unit === 'kg' || normRemote.unit === 'l') ? normRemote.size * 1000 : normRemote.size;

      if (Math.abs(localValue - remoteValue) > 1.0) {
        rejections.push(`"${c.name}": Size mismatch (${localValue}g vs ${remoteValue}g)`);
        continue;
      }
      sizeMatch = true;
    }

    // RULE C: Product Type Integrity
    const criticalKeywords = ["mango", "lime", "lemon", "fish", "prawn", "chicken", "meat", "garlic", "ginger", "tapioca", "coconut", "jackfruit", "beans", "arvi", "yam", "mixture", "pickle", "powder", "chips", "65", "biriyani", "fried", "roasted", "sliced", "whole", "cut", "podi", "palada", "payasam", "puttu", "idli", "dosa", "appam", "pathiri", "rava", "wheat", "ragi", "matta", "ponni", "basmati", "soap", "conditioner", "liquid", "oil", "seeds", "tender", "kaduku", "kadu", "maanga", "naranga", "inchi", "veluthulli", "meen", "chemeen", "erachi", "sharkara", "jaggery", "vadam", "kondattam", "pappadam"];
    let typeConflict = null;
    for (const k of criticalKeywords) {
       // Check for presence of the word itself (not just substring) to avoid "fish" matching "fishy"
       const remoteHas = new RegExp(`\\b${k}\\b`).test(normRemote.type);
       const localHas = new RegExp(`\\b${k}\\b`).test(normLocal.type);
       if (remoteHas !== localHas) {
          typeConflict = k;
          break;
       }
    }
    if (typeConflict) {
        rejections.push(`"${c.name}": Type conflict on "${typeConflict}"`);
        continue;
    }

    // Passed hard rules, calculate deterministic score
    let score = 0;
    const intersection = normLocal.keywords.filter(k => normRemote.keywords.includes(k));
    const remoteWordCount = normRemote.keywords.length;
    const localWordCount = normLocal.keywords.length;

    // Exact canonical name match (High confidence)
    if (normLocal.canonical_name === normRemote.canonical_name) {
       score = 100;
    } else {
       // Calculation based on keyword density
       const coverage = intersection.length / Math.max(remoteWordCount, localWordCount);
       score = Math.floor(coverage * 80); // Max 80 for non-exact names

       // Bonuses
       if (brandMatch) score += 10;
       if (sizeMatch) score += 10;
    }

    candidates.push({
      ...c,
      score,
      normLocal,
      brand_match: brandMatch,
      size_match: sizeMatch,
      product_type_match: true
    });
  }

  if (candidates.length === 0) return { productId: null, confidence: 0, method: "none", reasons: [debugInfo, ...rejections.slice(0, 4)] };

  candidates.sort((a, b) => b.score - a.score);
  const bestCandidate = candidates[0];

  // 5. LEVEL 3: Deterministic High Confidence (95+)
  if (bestCandidate.score >= 95) {
    return {
      productId: bestCandidate.id,
      confidence: Math.min(100, bestCandidate.score),
      method: "deterministic",
      reasons: ["Passed all hard rules with high name similarity"],
      meta: { brand_match: bestCandidate.brand_match, size_match: bestCandidate.size_match, product_type_match: true }
    };
  }

  // 6. LEVEL 4: AI Semantic Resolver
  if (openaiKey && candidates.length > 0) {
    try {
      const aiMatch = await matchWithOpenAI(openaiKey, data, candidates.slice(0, 5), supabase);
      if (aiMatch && aiMatch.decision === 'MATCH' && aiMatch.candidate_product_id) {
        const aiCandidate = candidates.find(c => c.id === aiMatch.candidate_product_id);
        if (aiCandidate) {
          return {
            productId: aiCandidate.id,
            confidence: aiMatch.confidence,
            method: "ai",
            reasons: [aiMatch.reason],
            meta: { brand_match: aiMatch.brand_match, size_match: aiMatch.size_match, product_type_match: aiMatch.product_type_match, ai_used: true, ai_model: OPENAI_MODEL }
          };
        }
      }
    } catch (e) {
      console.warn("AI Matching failed:", e);
    }
  }

  return { productId: null, confidence: 0, method: "none", reasons: ["No reliable match found after all stages", ...rejections.slice(0, 2)] };
}

/**
 * Quick score helper for sorting candidates before AI
 */
function calculateQuickScore(candidate: any, normRemote: any): number {
    const normLocal = normalizeProductData(candidate.name, candidate.brand);
    let score = 0;
    if (normLocal.brand === normRemote.brand) score += 40;
    if (Math.abs((normLocal.unit === 'kg' ? normLocal.size * 1000 : normLocal.size) - (normRemote.unit === 'kg' ? normRemote.size * 1000 : normRemote.size)) < 0.1) score += 30;
    const intersection = normLocal.type.split(' ').filter(w => normRemote.type.includes(w));
    score += intersection.length * 5;
    return score;
}

async function matchWithOpenAI(openaiKey: string, extracted: ExtractedProduct, candidates: any[], supabase?: any) {
  const startTime = Date.now();
  const prompt = `Task: Match a competitor product to the correct CentralHub catalog product.

COMPETITOR PRODUCT:
Name: ${extracted.product_name}
Brand: ${extracted.brand || 'Unknown'}
Size: ${extracted.size || 'Unknown'}
URL: ${extracted.product_url || 'N/A'}

CENTRALHUB CANDIDATES:
${candidates.map((c, i) => `${i + 1}. [ID: ${c.id}] ${c.name} (Brand: ${c.brand || 'N/A'}, Size: ${c.weight}${c.unit || ''})`).join('\n')}

HARD IDENTITY RULES:
1. Decision must be "MATCH" only if it's the SAME product.
2. Decision must be "NO_MATCH" if the brand is different (unless it's an alias).
3. Decision must be "NO_MATCH" if the size is different (e.g. 200g vs 500g).
4. Decision must be "NO_MATCH" if the product type is different (e.g. Mango Pickle vs Lime Pickle).
5. Only choose from the provided candidates IDs.

Return ONLY JSON:
{
  "decision": "MATCH" | "NO_MATCH",
  "candidate_product_id": "UUID or null",
  "confidence": 0-100,
  "reason": "short explanation of why it matched or why it was rejected",
  "brand_match": true|false,
  "product_type_match": true|false,
  "size_match": true|false
}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) throw new Error(`OpenAI API Error: ${response.status}`);
  const result = await response.json();
  const content = JSON.parse(result.choices[0].message.content);

  // Log usage
  if (supabase) {
    await supabase.from('ai_usage_logs').insert({
        feature: 'competitor_matching',
        model: OPENAI_MODEL,
        request_type: 'matching',
        prompt_tokens: result.usage?.prompt_tokens,
        completion_tokens: result.usage?.completion_tokens,
        total_tokens: result.usage?.total_tokens,
        duration_ms: Date.now() - startTime,
        status: 'success'
    });
  }

  // Server-side validation of AI response
  if (content.decision === 'MATCH' && !candidates.some(c => c.id === content.candidate_product_id)) {
      console.warn(`[AI] Invalid candidate ID chosen: ${content.candidate_product_id}`);
      return { decision: 'NO_MATCH', confidence: 0, reason: 'AI chose invalid candidate' };
  }

  return content;
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function validatePrice(data: ExtractedProduct, previous: number | null, previousCurrency: string): { status: string, error: string | null } {
  if (!data.price || data.price <= 0) return { status: "failed", error: "Invalid price" };
  if (data.currency !== previousCurrency) return { status: "review_required", error: `Currency changed to ${data.currency}` };

  if (previous !== null) {
    const diff = ((data.price - previous) / previous) * 100;
    if (diff > 500) return { status: "review_required", error: `Suspicious increase (+${diff.toFixed(0)}%)` };
    if (diff < -80) return { status: "review_required", error: `Suspicious decrease (${diff.toFixed(0)}%)` };
  }

  return { status: "success", error: null };
}

function calculateNextScan(frequency: string): string {
  let ms = 24 * 60 * 60 * 1000;
  if (frequency.includes("1 hour")) ms = 1 * 60 * 60 * 1000;
  else if (frequency.includes("3 hour")) ms = 3 * 60 * 60 * 1000;
  else if (frequency.includes("6 hour")) ms = 6 * 60 * 60 * 1000;
  else if (frequency.includes("12 hour")) ms = 12 * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

async function logAudit(supabase: any, action: string, details: any, priceId?: string) {
  try {
    await supabase.from("competitor_audit_logs").insert({
      action, details, competitor_price_id: priceId || null, created_at: new Date().toISOString()
    });
  } catch (e) {
    console.warn("[logAudit] Non-fatal: audit log insert failed:", e);
  }
}

function mergeExtractedData(a: ExtractedProduct, b: ExtractedProduct): ExtractedProduct {
  return { ...a, ...b, extraction_notes: [...(a.extraction_notes || []), ...(b.extraction_notes || [])] };
}

// Support functions for catalog extraction
function extractProductsFromJsonLd(html: string, baseUrl: string): { name: string; price: number | null; product_url: string | null; image_url: string | null }[] {
  const results: { name: string; price: number | null; product_url: string | null; image_url: string | null }[] = [];
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (!jsonLdMatch) return results;

  for (const block of jsonLdMatch) {
    const jsonStr = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
    try {
      const parsed = JSON.parse(jsonStr);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      for (const item of items) {
        if (item["@type"] === "ItemList" && Array.isArray(item.itemListElement)) {
          for (const el of item.itemListElement) {
            const product = el.item || el;
            if (product["@type"] === "Product" && product.name) {
              results.push({
                name: product.name,
                price: extractPriceFromOffers(product.offers),
                product_url: resolveUrl(product.url || null, baseUrl),
                image_url: resolveImageUrl(product.image, baseUrl),
              });
            }
          }
        } else if (item["@type"] === "Product" && item.name) {
          results.push({
            name: item.name,
            price: extractPriceFromOffers(item.offers),
            product_url: resolveUrl(item.url || null, baseUrl),
            image_url: resolveImageUrl(item.image, baseUrl),
          });
        }
      }
    } catch { }
  }
  return results;
}

function extractPriceFromOffers(offers: any): number | null {
  if (!offers) return null;
  const offerList = Array.isArray(offers) ? offers : [offers];
  for (const offer of offerList) {
    if (offer.price) {
      const p = parseFloat(String(offer.price));
      if (!isNaN(p) && p > 0) return Math.round(p * 100) / 100;
    }
  }
  return null;
}

function resolveUrl(url: string | null, baseUrl: string): string | null {
  if (!url) return null;
  try { return new URL(url, baseUrl).href; } catch { return url; }
}

function resolveImageUrl(image: any, baseUrl: string): string | null {
  if (!image) return null;
  const imgUrl = typeof image === "string" ? image : image?.url;
  return resolveUrl(imgUrl || null, baseUrl);
}

function extractProductsFromHtmlPatterns(html: string, baseUrl: string): { name: string; price: number | null; product_url: string | null; image_url: string | null }[] {
  const results: { name: string; price: number | null; product_url: string | null; image_url: string | null }[] = [];
  const seen = new Set<string>();
  const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null && results.length < 200) {
    const href = match[1];
    const innerHtml = match[2];
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
    const isProductLink = href.includes("/product") || href.includes("/item") || href.includes("/p/") || href.includes("/products/");
    if (!isProductLink) continue;
    const text = innerHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!text || text.length < 3 || text.length > 200 || isInvalidProductName(text)) continue;
    const fullUrl = resolveUrl(href, baseUrl);
    if (!fullUrl || seen.has(fullUrl)) continue;
    seen.add(fullUrl);
    results.push({ name: text, price: null, product_url: fullUrl, image_url: null });
  }
  return results;
}

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-product-sync-secret",
};

// Store-owned merchandising fields (category, description, SEO and images) are intentionally excluded.
const PRODUCT_SELECT = "id,name,slug,brand,price,sale_price,cost_price,stock,unit,weight,weight_kg,weight_grams,is_active,is_published,is_archived,is_deleted,gtin,sku,pack_size,pack_unit,product_type,warehouse_location,backorder,allow_backorder,updated_at";
const VARIANT_SELECT = "id,product_id,variant_name,sku,barcode,unit_value,unit_type,pack_type,pack_quantity,weight_grams,price,discounted_price,cost_price,stock,is_active,sort_order,attributes,updated_at";

type Target = { slug: string; url: string; key: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorText(error: unknown): string {
  if (!error) return "Unknown error";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    const candidate = error as Record<string, unknown>;
    if (typeof candidate.message === "string") return candidate.message;
    if (typeof candidate.details === "string") return candidate.details;
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildTargets(): Target[] {
  return [
    {
      slug: "malluspices",
      url: Deno.env.get("MALLUSPICES_SUPABASE_URL") ?? "",
      key: Deno.env.get("MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY") ?? "",
    },
    {
      slug: "keralagrocery",
      url: Deno.env.get("SOURCE3_SUPABASE_URL") || Deno.env.get("KERALA_SUPABASE_URL") || "",
      key: Deno.env.get("SOURCE3_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("KERALA_SUPABASE_SERVICE_ROLE_KEY") || "",
    },
    {
      slug: "pocketgrocery",
      url: Deno.env.get("POCKET_SUPABASE_URL") ?? "",
      key: Deno.env.get("POCKET_SUPABASE_SERVICE_ROLE_KEY") ?? "",
    },
  ];
}

async function isAuthorized(db: any, req: Request) {
  const secret = String(req.headers.get("x-product-sync-secret") || "").trim();
  if (!secret) return false;
  const { data, error } = await db.rpc("verify_integration_cron_secret", {
    p_name: "product_webhook_dispatcher_secret",
    p_secret: secret,
  });
  return !error && data === true;
}

function mapVariant(variant: any) {
  return {
    centralhub_variant_id: variant.id,
    centralhub_product_id: variant.product_id,
    variant_name: variant.variant_name,
    sku: variant.sku,
    barcode: variant.barcode,
    unit_value: variant.unit_value,
    unit_type: variant.unit_type,
    pack_type: variant.pack_type,
    pack_quantity: variant.pack_quantity,
    units_per_pack: null,
    weight_grams: variant.weight_grams,
    price: variant.price ?? 0,
    discounted_price: variant.discounted_price,
    cost_price: variant.cost_price,
    stock: Math.max(0, Math.trunc(Number(variant.stock || 0))),
    reserved_stock: 0,
    is_active: variant.is_active ?? true,
    sort_order: Math.trunc(Number(variant.sort_order || 0)),
    attributes: variant.attributes ?? null,
    source_updated_at: variant.updated_at || new Date().toISOString(),
    synced_at: new Date().toISOString(),
  } as Record<string, any>;
}

function variantStockTotals(variants: Record<string, any>[]) {
  const totals = new Map<string, number>();
  for (const variant of variants) {
    if (variant.is_active !== true || Number(variant.price || 0) <= 0) continue;
    const parentId = String(variant.centralhub_product_id || "");
    if (!parentId) continue;
    const stock = Math.max(0, Math.trunc(Number(variant.stock || 0)));
    totals.set(parentId, (totals.get(parentId) ?? 0) + stock);
  }
  return totals;
}

function mapProduct(product: any, inventoryStock: Map<string, number>, variableStock: Map<string, number>) {
  const type = product.product_type || "simple";
  const fallbackStock = num(product.stock) ?? 0;
  const simpleStock = inventoryStock.has(product.id) ? inventoryStock.get(product.id)! : fallbackStock;
  const stock = type === "variable" ? (variableStock.get(String(product.id)) ?? 0) : simpleStock;
  const weight = num(product.weight) ?? num(product.weight_kg);

  return {
    centralhub_id: product.id,
    centralhub_product_id: product.id,
    name: product.name,
    slug: product.slug || (product.name ? String(product.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : ""),
    price: product.price,
    sale_price: product.sale_price,
    cost_price: product.cost_price,
    stock: Math.max(0, Math.trunc(Number(stock || 0))),
    product_type: type,
    brand: product.brand,
    warehouse_location: product.warehouse_location,
    weight,
    weight_grams: product.weight_grams,
    gtin: product.gtin,
    sku: product.sku,
    unit: product.unit,
    pack_size: product.pack_size,
    pack_unit: product.pack_unit,
    is_active: product.is_active ?? true,
    is_published: product.is_published ?? true,
    is_archived: product.is_archived ?? false,
    is_deleted: product.is_deleted ?? false,
    backorder: product.allow_backorder ?? product.backorder ?? false,
    synced_at: new Date().toISOString(),
    source_updated_at: product.updated_at || new Date().toISOString(),
  } as Record<string, any>;
}

function productForTarget(row: Record<string, any>, target: Target) {
  const timestamp = Date.parse(String(row.source_updated_at || ""));
  const orderingKey = Number.isFinite(timestamp) && timestamp > 0 ? Math.trunc(timestamp) : Date.now();
  const mapped = { ...row };
  mapped.ordering_key = target.slug === "pocketgrocery" ? orderingKey : String(orderingKey);
  if (target.slug === "pocketgrocery" && mapped.pack_size != null) mapped.pack_size = String(mapped.pack_size);
  if (target.slug === "keralagrocery") mapped.payload = { ...row, ordering_key: String(orderingKey) };
  return mapped;
}

function variantForTarget(row: Record<string, any>) {
  const timestamp = Date.parse(String(row.source_updated_at || ""));
  return {
    ...row,
    ordering_key: Number.isFinite(timestamp) && timestamp > 0 ? Math.trunc(timestamp) : Date.now(),
  };
}

async function loadCentralProducts(db: any, ids?: string[]) {
  let query = db.from("products").select(PRODUCT_SELECT).order("updated_at", { ascending: false });
  if (ids?.length) query = query.in("id", ids);
  const { data: products, error } = await query.limit(1000);
  if (error) throw new Error(`Central products read failed: ${errorText(error)}`);

  const productIdSet = new Set((products || []).map((p: any) => p.id));
  const inventoryStock = new Map<string, number>();
  const { data: inventory, error: invError } = await db
    .from("central_inventory")
    .select("product_id,stock_quantity")
    .limit(5000);
  if (invError) throw new Error(`Central inventory read failed: ${errorText(invError)}`);
  for (const row of inventory || []) {
    if (productIdSet.has(row.product_id)) inventoryStock.set(row.product_id, Number(row.stock_quantity || 0));
  }
  return { products: products || [], inventoryStock };
}

async function loadCentralVariants(db: any, parentIds?: string[]) {
  let query = db.from("product_variants").select(VARIANT_SELECT).order("updated_at", { ascending: false });
  if (parentIds?.length) query = query.in("product_id", parentIds);
  const { data, error } = await query.limit(5000);
  if (error) throw new Error(`Central variants read failed: ${errorText(error)}`);
  return (data || []).map(mapVariant);
}

function remote(target: Target) {
  return createClient(target.url, target.key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function upsertProducts(target: Target, rows: Record<string, any>[]) {
  if (!target.url || !target.key) return { success: false, configured: false, error: "Store sync credentials are not configured" };
  const db = remote(target);
  let written = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100).map((row) => productForTarget(row, target));
    const { error } = await db.from("centralhub_products_raw").upsert(batch, { onConflict: "centralhub_id" });
    if (error) return { success: false, configured: true, written, error: errorText(error) };
    written += batch.length;
  }
  return { success: true, configured: true, written };
}

async function upsertVariants(target: Target, rows: Record<string, any>[]) {
  if (!target.url || !target.key) return { success: false, configured: false, error: "Store sync credentials are not configured" };
  const db = remote(target);
  let written = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100).map(variantForTarget);
    const { error } = await db.from("centralhub_product_variants_raw").upsert(batch, { onConflict: "centralhub_variant_id" });
    if (error) return { success: false, configured: true, written, error: errorText(error) };
    written += batch.length;
  }
  return { success: true, configured: true, written };
}

async function reconcileVariants(target: Target, parentIds: string[] | null, rows: Record<string, any>[]) {
  if (!target.url || !target.key) return { success: false, configured: false, error: "Store sync credentials are not configured" };
  const db = remote(target);
  let query = db.from("centralhub_product_variants_raw").select("centralhub_variant_id,centralhub_product_id").limit(5000);
  if (parentIds?.length) query = query.in("centralhub_product_id", parentIds);
  const { data: existing, error: readError } = await query;
  if (readError) return { success: false, configured: true, error: errorText(readError) };

  const centralIds = new Set(rows.map((row) => String(row.centralhub_variant_id)));
  const orphanIds = (existing || [])
    .filter((row: any) => !centralIds.has(String(row.centralhub_variant_id)))
    .map((row: any) => row.centralhub_variant_id);

  const upsert = await upsertVariants(target, rows);
  if (!upsert.success) return upsert;
  if (orphanIds.length) {
    const { error: deleteError } = await db.from("centralhub_product_variants_raw").delete().in("centralhub_variant_id", orphanIds);
    if (deleteError) return { ...upsert, success: false, error: errorText(deleteError) };
  }
  return { ...upsert, orphans_removed: orphanIds.length };
}

async function deleteProductAndVariants(target: Target, id: string) {
  if (!target.url || !target.key) return { store: target.slug, success: false, configured: false, error: "Store sync credentials are not configured" };
  const db = remote(target);
  const productDelete = await db.from("centralhub_products_raw").delete().eq("centralhub_id", id);
  const variantDelete = await db.from("centralhub_product_variants_raw").delete().eq("centralhub_product_id", id);
  return {
    store: target.slug,
    success: !productDelete.error && !variantDelete.error,
    configured: true,
    error: productDelete.error ? errorText(productDelete.error) : variantDelete.error ? errorText(variantDelete.error) : undefined,
  };
}

async function reconcileProducts(target: Target, rows: Record<string, any>[], centralIds: Set<string>) {
  if (!target.url || !target.key) return { success: false, configured: false, error: "Store sync credentials are not configured" };
  const db = remote(target);
  const { data: rawIds, error: readError } = await db.from("centralhub_products_raw").select("centralhub_id").limit(1000);
  if (readError) return { success: false, configured: true, error: errorText(readError) };

  const remoteIds = new Set((rawIds || []).map((row: any) => String(row.centralhub_id || "")).filter(Boolean));
  const missing = rows.filter((row) => !remoteIds.has(String(row.centralhub_id)));
  const cutoff = Date.now() - 10 * 60 * 1000;
  const recentlyChanged = rows.filter((row) => {
    const ts = Date.parse(String(row.source_updated_at || ""));
    return Number.isFinite(ts) && ts >= cutoff;
  });
  const toWriteMap = new Map<string, Record<string, any>>();
  for (const row of [...missing, ...recentlyChanged]) toWriteMap.set(String(row.centralhub_id), row);
  const upsert = await upsertProducts(target, [...toWriteMap.values()]);
  if (!upsert.success) return upsert;

  const orphanIds = [...remoteIds].filter((id) => !centralIds.has(id));
  if (orphanIds.length) {
    const { error: deleteError } = await db.from("centralhub_products_raw").delete().in("centralhub_id", orphanIds);
    if (deleteError) return { ...upsert, success: false, error: errorText(deleteError) };
  }
  return {
    ...upsert,
    missing_repaired: missing.length,
    recent_refreshed: recentlyChanged.length,
    orphans_removed: orphanIds.length,
  };
}

async function writeAudit(db: any, eventType: string, productId: string | null, productName: string | null, results: any[]) {
  try {
    const success = results.every((result) => result.success === true);
    await db.from("webhook_logs").insert({
      event_type: eventType,
      product_id: productId,
      product_name: productName || (eventType === "FULL_SYNC" ? "Full product + variant sync" : eventType === "RECONCILE" ? "Product + variant reconciliation" : "Unknown"),
      attempt: 1,
      status_code: success ? 200 : 207,
      response_body: JSON.stringify(results),
      success,
      status: success ? "delivered" : "partial",
      response: JSON.stringify({ method: "multi_store_direct_sync", targets: results.map((result) => result.store) }),
    });
  } catch (error) {
    console.warn("[product-webhook-dispatcher] audit log failed", errorText(error));
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    if (!(await isAuthorized(db, req))) return json({ ok: false, error: "Unauthorized" }, 401);
    const payload = await req.json().catch(() => ({}));
    const eventType = String(payload?.event || payload?.type || "UPDATE").toUpperCase();
    const targets = buildTargets();

    if (eventType === "FULL_SYNC" || eventType === "RECONCILE") {
      const loadedProducts = await loadCentralProducts(db);
      const variants = await loadCentralVariants(db);
      const variableStock = variantStockTotals(variants);
      const products = loadedProducts.products.map((product: any) => mapProduct(product, loadedProducts.inventoryStock, variableStock));
      const centralProductIds = new Set(products.map((row: any) => String(row.centralhub_id)));

      const results = await Promise.all(targets.map(async (target) => {
        const productSync = eventType === "FULL_SYNC"
          ? await upsertProducts(target, products)
          : await reconcileProducts(target, products, centralProductIds);
        const variantSync = eventType === "FULL_SYNC"
          ? await upsertVariants(target, variants)
          : await reconcileVariants(target, null, variants);
        return { store: target.slug, success: productSync.success && variantSync.success, product_sync: productSync, variant_sync: variantSync };
      }));

      await writeAudit(db, eventType, null, null, results);
      const ok = results.every((result) => result.success === true);
      return json({ ok, event: eventType, central_products: products.length, central_variants: variants.length, stores: results }, ok ? 200 : 207);
    }

    const productId = String(payload?.data?.id ?? payload?.record?.id ?? payload?.data?.old_record?.id ?? "");
    const productName = String(payload?.data?.name ?? payload?.record?.name ?? "");
    if (!productId) return json({ ok: false, error: "Product id is required" }, 400);

    if (eventType === "DELETE") {
      const results = await Promise.all(targets.map((target) => deleteProductAndVariants(target, productId)));
      await writeAudit(db, eventType, productId, productName, results);
      const ok = results.every((result) => result.success === true);
      return json({ ok, stores: results }, ok ? 200 : 207);
    }

    const loadedProducts = await loadCentralProducts(db, [productId]);
    if (!loadedProducts.products.length) return json({ ok: false, error: "Product not found" }, 404);
    const variants = await loadCentralVariants(db, [productId]);
    const variableStock = variantStockTotals(variants);
    const product = mapProduct(loadedProducts.products[0], loadedProducts.inventoryStock, variableStock);

    const results = await Promise.all(targets.map(async (target) => {
      const productSync = await upsertProducts(target, [product]);
      const variantSync = await reconcileVariants(target, [productId], variants);
      return { store: target.slug, success: productSync.success && variantSync.success, product_sync: productSync, variant_sync: variantSync };
    }));

    await writeAudit(db, eventType, productId, productName || loadedProducts.products[0]?.name, results);
    const ok = results.every((result) => result.success === true);
    return json({ ok, variant_count: variants.length, variable_parent_stock: product.stock, stores: results }, ok ? 200 : 207);
  } catch (error) {
    const detail = errorText(error);
    console.error("[product-webhook-dispatcher]", detail);
    return json({ ok: false, error: detail }, 500);
  }
});

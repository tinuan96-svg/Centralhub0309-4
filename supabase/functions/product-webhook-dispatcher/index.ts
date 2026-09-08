import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-product-sync-secret",
};

// Category and description are store-owned merchandising fields and are intentionally excluded.
const PRODUCT_SELECT = "id,name,slug,brand,price,sale_price,cost_price,stock,unit,weight,weight_kg,weight_grams,is_active,is_published,is_archived,is_deleted,gtin,sku,pack_size,pack_unit,product_type,warehouse_location,backorder,allow_backorder,image_url,image_main,gallery_images,updated_at";

type Target = { slug: string; url: string; key: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
  } catch { return String(error); }
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildTargets(): Target[] {
  return [
    { slug: "malluspices", url: Deno.env.get("MALLUSPICES_SUPABASE_URL") ?? "", key: Deno.env.get("MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY") ?? "" },
    { slug: "keralagrocery", url: Deno.env.get("SOURCE3_SUPABASE_URL") || Deno.env.get("KERALA_SUPABASE_URL") || "", key: Deno.env.get("SOURCE3_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("KERALA_SUPABASE_SERVICE_ROLE_KEY") || "" },
    { slug: "pocketgrocery", url: Deno.env.get("POCKET_SUPABASE_URL") ?? "", key: Deno.env.get("POCKET_SUPABASE_SERVICE_ROLE_KEY") ?? "" },
  ];
}

async function isAuthorized(db: any, req: Request) {
  const secret = String(req.headers.get("x-product-sync-secret") || "").trim();
  if (!secret) return false;
  const { data, error } = await db.rpc("verify_integration_cron_secret", { p_name: "product_webhook_dispatcher_secret", p_secret: secret });
  return !error && data === true;
}

function mapProduct(product: any, stockByProduct: Map<string, number>) {
  const fallbackStock = num(product.stock) ?? 0;
  const centralStock = stockByProduct.has(product.id) ? stockByProduct.get(product.id)! : fallbackStock;
  const weight = num(product.weight) ?? num(product.weight_kg);
  return {
    centralhub_id: product.id,
    centralhub_product_id: product.id,
    name: product.name,
    slug: product.slug || (product.name ? String(product.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : ""),
    price: product.price,
    sale_price: product.sale_price,
    cost_price: product.cost_price,
    stock: Math.trunc(Number(centralStock || 0)),
    product_type: product.product_type || "simple",
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
    image_url: product.image_url || null,
    image_main: product.image_main || null,
    gallery_images: product.gallery_images || null,
    synced_at: new Date().toISOString(),
    source_updated_at: product.updated_at || new Date().toISOString(),
  } as Record<string, any>;
}

function rowForTarget(row: Record<string, any>, target: Target) {
  const timestamp = Date.parse(String(row.source_updated_at || ""));
  const orderingKey = Number.isFinite(timestamp) && timestamp > 0 ? Math.trunc(timestamp) : Date.now();
  const mapped = { ...row };
  mapped.ordering_key = target.slug === "pocketgrocery" ? orderingKey : String(orderingKey);
  if (target.slug === "pocketgrocery" && mapped.pack_size != null) mapped.pack_size = String(mapped.pack_size);
  if (target.slug === "keralagrocery") mapped.payload = { ...row, ordering_key: String(orderingKey) };
  return mapped;
}

async function loadCentralProducts(db: any, ids?: string[]) {
  let query = db.from("products").select(PRODUCT_SELECT).order("updated_at", { ascending: false });
  if (ids?.length) query = query.in("id", ids);
  const { data: products, error } = await query.limit(1000);
  if (error) throw new Error(`Central products read failed: ${errorText(error)}`);
  const productIdSet = new Set((products || []).map((p: any) => p.id));
  const stockByProduct = new Map<string, number>();
  const { data: inventory, error: invError } = await db.from("central_inventory").select("product_id,stock_quantity").limit(5000);
  if (invError) throw new Error(`Central inventory read failed: ${errorText(invError)}`);
  for (const row of inventory || []) if (productIdSet.has(row.product_id)) stockByProduct.set(row.product_id, Number(row.stock_quantity || 0));
  return { products: products || [], stockByProduct };
}

async function upsertRows(target: Target, rows: Record<string, any>[]) {
  if (!target.url || !target.key) return { store: target.slug, success: false, configured: false, error: "Store sync credentials are not configured" };
  const remote = createClient(target.url, target.key, { auth: { persistSession: false, autoRefreshToken: false } });
  let written = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100).map((row) => rowForTarget(row, target));
    const { error } = await remote.from("centralhub_products_raw").upsert(batch, { onConflict: "centralhub_id" });
    if (error) return { store: target.slug, success: false, configured: true, written, error: errorText(error) };
    written += batch.length;
  }
  return { store: target.slug, success: true, configured: true, written };
}

async function deleteRows(target: Target, ids: string[]) {
  if (!target.url || !target.key) return { store: target.slug, success: false, configured: false, error: "Store sync credentials are not configured" };
  if (!ids.length) return { store: target.slug, success: true, configured: true, deleted: 0 };
  const remote = createClient(target.url, target.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await remote.from("centralhub_products_raw").delete().in("centralhub_id", ids);
  return error ? { store: target.slug, success: false, configured: true, deleted: 0, error: errorText(error) } : { store: target.slug, success: true, configured: true, deleted: ids.length };
}

async function reconcileTarget(target: Target, centralRows: Record<string, any>[], centralIds: Set<string>) {
  if (!target.url || !target.key) return { store: target.slug, success: false, configured: false, error: "Store sync credentials are not configured" };
  const remote = createClient(target.url, target.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: rawIds, error: readError } = await remote.from("centralhub_products_raw").select("centralhub_id").limit(1000);
  if (readError) return { store: target.slug, success: false, configured: true, error: errorText(readError) };
  const remoteIds = new Set((rawIds || []).map((r: any) => String(r.centralhub_id || "")).filter(Boolean));
  const missing = centralRows.filter((row) => !remoteIds.has(String(row.centralhub_id)));
  const cutoff = Date.now() - 10 * 60 * 1000;
  const recentlyChanged = centralRows.filter((row) => { const ts = Date.parse(String(row.source_updated_at || "")); return Number.isFinite(ts) && ts >= cutoff; });
  const toWriteMap = new Map<string, Record<string, any>>();
  for (const row of [...missing, ...recentlyChanged]) toWriteMap.set(String(row.centralhub_id), row);
  const toWrite = [...toWriteMap.values()];
  const orphanIds = [...remoteIds].filter((id) => !centralIds.has(id));
  let written = 0;
  for (let i = 0; i < toWrite.length; i += 100) {
    const batch = toWrite.slice(i, i + 100).map((row) => rowForTarget(row, target));
    const { error } = await remote.from("centralhub_products_raw").upsert(batch, { onConflict: "centralhub_id" });
    if (error) return { store: target.slug, success: false, configured: true, written, error: errorText(error) };
    written += batch.length;
  }
  if (orphanIds.length) {
    const { error: deleteError } = await remote.from("centralhub_products_raw").delete().in("centralhub_id", orphanIds);
    if (deleteError) return { store: target.slug, success: false, configured: true, written, error: errorText(deleteError) };
  }
  return { store: target.slug, success: true, configured: true, missing_repaired: missing.length, recent_refreshed: recentlyChanged.length, written, orphans_removed: orphanIds.length };
}

async function writeAudit(db: any, eventType: string, productId: string | null, productName: string | null, results: any[]) {
  try {
    const success = results.every((r) => r.success === true);
    await db.from("webhook_logs").insert({ event_type: eventType, product_id: productId, product_name: productName || (eventType === "RECONCILE" ? "Product reconciliation" : eventType === "FULL_SYNC" ? "Full product sync" : "Unknown"), attempt: 1, status_code: success ? 200 : 207, response_body: JSON.stringify(results), success, status: success ? "delivered" : "partial", response: JSON.stringify({ method: "multi_store_direct_sync", targets: results.map((r) => r.store) }) });
  } catch (error) { console.warn("[product-webhook-dispatcher] audit log failed", errorText(error)); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    if (!(await isAuthorized(db, req))) return json({ ok: false, error: "Unauthorized" }, 401);
    const payload = await req.json().catch(() => ({}));
    const eventType = String(payload?.event || payload?.type || "UPDATE").toUpperCase();
    const targets = buildTargets();
    if (eventType === "RECONCILE" || eventType === "FULL_SYNC") {
      const { products, stockByProduct } = await loadCentralProducts(db);
      const rows = products.map((p: any) => mapProduct(p, stockByProduct));
      const centralIds = new Set(rows.map((r: any) => String(r.centralhub_id)));
      const results = eventType === "FULL_SYNC" ? await Promise.all(targets.map((target) => upsertRows(target, rows))) : await Promise.all(targets.map((target) => reconcileTarget(target, rows, centralIds)));
      await writeAudit(db, eventType, null, null, results);
      const ok = results.every((r) => r.success === true);
      return json({ ok, event: eventType, central_products: rows.length, stores: results }, ok ? 200 : 207);
    }
    const productId = String(payload?.data?.id ?? payload?.record?.id ?? payload?.data?.old_record?.id ?? "");
    const productName = String(payload?.data?.name ?? payload?.record?.name ?? "");
    if (!productId) return json({ ok: false, error: "Product id is required" }, 400);
    if (eventType === "DELETE") {
      const results = await Promise.all(targets.map((target) => deleteRows(target, [productId])));
      await writeAudit(db, eventType, productId, productName, results);
      const ok = results.every((r) => r.success === true);
      return json({ ok, stores: results }, ok ? 200 : 207);
    }
    const { products, stockByProduct } = await loadCentralProducts(db, [productId]);
    if (!products.length) return json({ ok: false, error: "Product not found" }, 404);
    const row = mapProduct(products[0], stockByProduct);
    const results = await Promise.all(targets.map((target) => upsertRows(target, [row])));
    await writeAudit(db, eventType, productId, productName || products[0]?.name, results);
    const ok = results.every((r) => r.success === true);
    return json({ ok, stores: results }, ok ? 200 : 207);
  } catch (error) {
    const detail = errorText(error);
    console.error("[product-webhook-dispatcher]", detail);
    return json({ ok: false, error: detail }, 500);
  }
});

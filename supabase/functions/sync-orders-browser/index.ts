import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Webhook-Secret",
};

const STORE_SLUGS = ["malluspices", "pocketgrocery", "keralagrocery", "tamilretail"] as const;
const MALLU_SCAN_LIMIT = 100;
const TARGET_CONCURRENCY = 5;

type SyncRequest = {
  orderId?: string;
  storeSlug?: string;
};

type CanonicalResult = Record<string, any> & {
  success?: boolean;
  imported?: number;
  items_synced?: number;
  stale_items_deleted?: number;
  mismatched_count?: number;
  failures?: Array<{ store?: string; error?: string }>;
  warnings?: Array<Record<string, any>>;
  stores?: Array<Record<string, any>>;
  error?: string;
  message?: string;
};

function reply(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function errorMessage(error: any) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  return error.message || error.details || String(error);
}

function normalizeSlug(value?: string | null) {
  const slug = String(value || "").trim().toLowerCase();
  if (!slug) return undefined;
  if (slug === "keralagroceries") return "keralagrocery";
  if (slug === "tamilretail.com") return "tamilretail";
  return slug;
}

async function parseRequest(req: Request): Promise<SyncRequest> {
  const url = new URL(req.url);
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  return {
    orderId: body?.orderId || url.searchParams.get("orderId") || undefined,
    storeSlug: normalizeSlug(body?.storeSlug || url.searchParams.get("storeSlug")),
  };
}

async function getCentralClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("CentralHub database configuration is missing");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function getInternalSecret(ch: any) {
  const envSecret = (
    Deno.env.get("CENTRALHUB_PUSH_API_SECRET") ||
    Deno.env.get("CENTRALHUB_WEBHOOK_SECRET") ||
    ""
  ).trim();
  if (envSecret) return envSecret;

  const { data, error } = await ch
    .from("app_config")
    .select("value")
    .eq("key", "malluspices_sync_secret")
    .maybeSingle();
  if (error) throw error;
  const stored = String(data?.value || "").trim();
  if (!stored) throw new Error("Internal order-sync secret is not configured");
  return stored;
}

async function isAuthorized(req: Request, ch: any) {
  const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  const webhookSecret = req.headers.get("x-webhook-secret")?.trim() || "";
  if (!token && !webhookSecret) return false;

  const candidates = [
    Deno.env.get("CENTRALHUB_PUSH_API_SECRET")?.trim() || "",
    Deno.env.get("CENTRALHUB_WEBHOOK_SECRET")?.trim() || "",
  ].filter(Boolean);

  if (candidates.some((secret) => secret === token || secret === webhookSecret)) return true;

  const { data } = await ch
    .from("app_config")
    .select("value")
    .eq("key", "malluspices_sync_secret")
    .maybeSingle();
  const stored = String(data?.value || "").trim();
  return Boolean(stored && (stored === token || stored === webhookSecret));
}

async function callCanonicalSync(secret: string, request: SyncRequest): Promise<CanonicalResult> {
  const centralUrl = Deno.env.get("SUPABASE_URL") || "";
  const response = await fetch(`${centralUrl}/functions/v1/sync-orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  const raw = await response.text();
  let payload: CanonicalResult;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Canonical sync returned unreadable response (HTTP ${response.status})`);
  }

  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Canonical sync failed (HTTP ${response.status})`);
  }
  return payload;
}

function isExpectedMismatch(payload: CanonicalResult) {
  if (Number(payload.mismatched_count || 0) > 0) return true;
  const text = `${payload.error || ""} ${payload.message || ""} ${(payload.failures || []).map((f) => f.error || "").join(" ")}`;
  return /unmapped product|source_order_has_no_items|has no items|missing product mapping/i.test(text);
}

async function fetchMalluSourceHead() {
  const url = Deno.env.get("MALLUSPICES_SUPABASE_URL") || "";
  const key = Deno.env.get("MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("Source credentials are not configured for malluspices");

  const remote = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let result: any = await remote
    .from("orders")
    .select("id,order_number,updated_at,created_at")
    .order("updated_at", { ascending: false })
    .limit(MALLU_SCAN_LIMIT);

  if (result.error) {
    result = await remote
      .from("orders")
      .select("id,order_number,created_at")
      .order("created_at", { ascending: false })
      .limit(MALLU_SCAN_LIMIT);
  }

  if (result.error) throw result.error;
  return (result.data || []) as Array<{
    id: string;
    order_number?: string | null;
    updated_at?: string | null;
    created_at?: string | null;
  }>;
}

async function fetchCentralMalluRows(ch: any, storeId: string, sourceRows: Array<any>) {
  const byId = new Map<string, any>();
  const byNumber = new Map<string, any>();
  const ids = [...new Set(sourceRows.map((row) => row.id).filter(Boolean))];
  const numbers = [...new Set(sourceRows.map((row) => row.order_number).filter(Boolean))] as string[];

  for (let i = 0; i < ids.length; i += 50) {
    const { data, error } = await ch
      .from("orders")
      .select("id,order_number,updated_at,last_synced_at,sync_state,sync_error")
      .eq("store_id", storeId)
      .in("id", ids.slice(i, i + 50));
    if (error) throw error;
    for (const row of data || []) byId.set(row.id, row);
  }

  for (let i = 0; i < numbers.length; i += 50) {
    const { data, error } = await ch
      .from("orders")
      .select("id,order_number,updated_at,last_synced_at,sync_state,sync_error")
      .eq("store_id", storeId)
      .in("order_number", numbers.slice(i, i + 50));
    if (error) throw error;
    for (const row of data || []) if (row.order_number) byNumber.set(row.order_number, row);
  }

  return { byId, byNumber };
}

function sourceTimestamp(row: any) {
  const value = row.updated_at || row.created_at;
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function needsRefresh(source: any, existing: any) {
  if (!existing) return true;
  if (existing.sync_state && existing.sync_state !== "synced") return true;
  if (existing.sync_error) return true;
  const sourceMs = sourceTimestamp(source);
  const centralMs = existing.updated_at ? Date.parse(existing.updated_at) : 0;
  return sourceMs > (Number.isFinite(centralMs) ? centralMs : 0) + 500;
}

async function touchMalluCheck(ch: any, storeId: string, existing: any) {
  if (!existing?.id) return;
  await ch
    .from("orders")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", existing.id)
    .eq("store_id", storeId);
}

async function syncMalluIncremental(ch: any, secret: string) {
  const { data: store, error: storeError } = await ch
    .from("stores")
    .select("id")
    .ilike("slug", "malluspices")
    .maybeSingle();
  if (storeError) throw storeError;
  if (!store?.id) throw new Error("Store not found: malluspices");

  const sourceRows = await fetchMalluSourceHead();
  if (!sourceRows.length) {
    return {
      store: "malluspices",
      configured: true,
      transport: "targeted_incremental",
      success: true,
      orders: 0,
      items: 0,
      checked: 0,
      changed: 0,
      message: "No MalluSpices source orders found.",
    };
  }

  const central = await fetchCentralMalluRows(ch, store.id, sourceRows);
  const candidates = sourceRows.filter((row) => {
    const existing = (row.order_number && central.byNumber.get(row.order_number)) || central.byId.get(row.id);
    return needsRefresh(row, existing);
  });

  let imported = 0;
  let itemsSynced = 0;
  let staleItemsDeleted = 0;
  let mismatchedCount = 0;
  const warnings: Array<Record<string, any>> = [];
  const failures: Array<{ store: string; error: string; order_id?: string }> = [];

  for (let offset = 0; offset < candidates.length; offset += TARGET_CONCURRENCY) {
    const chunk = candidates.slice(offset, offset + TARGET_CONCURRENCY);
    const results = await Promise.all(chunk.map(async (sourceOrder) => {
      try {
        const payload = await callCanonicalSync(secret, {
          storeSlug: "malluspices",
          orderId: sourceOrder.id,
        });
        return { sourceOrder, payload, error: null as string | null };
      } catch (error) {
        return { sourceOrder, payload: null as CanonicalResult | null, error: errorMessage(error) };
      }
    }));

    for (const result of results) {
      if (result.error) {
        failures.push({ store: "malluspices", order_id: result.sourceOrder.id, error: result.error });
        continue;
      }

      const payload = result.payload!;
      imported += Number(payload.imported || 0);
      itemsSynced += Number(payload.items_synced || 0);
      staleItemsDeleted += Number(payload.stale_items_deleted || 0);
      mismatchedCount += Number(payload.mismatched_count || 0);

      if (payload.success === false) {
        if (isExpectedMismatch(payload)) {
          warnings.push({
            store: "malluspices",
            order_id: result.sourceOrder.id,
            warning: payload.error || payload.message || "Order skipped because product mappings are incomplete",
          });
        } else {
          failures.push({
            store: "malluspices",
            order_id: result.sourceOrder.id,
            error: payload.error || payload.message || payload.failures?.[0]?.error || "Unknown MalluSpices sync failure",
          });
        }
      }

      if (payload.warnings?.length) warnings.push(...payload.warnings);
    }
  }

  if (failures.length === 0) {
    const first = sourceRows[0];
    const existing = (first.order_number && central.byNumber.get(first.order_number)) || central.byId.get(first.id);
    await touchMalluCheck(ch, store.id, existing);
  }

  return {
    store: "malluspices",
    configured: true,
    transport: "targeted_incremental",
    success: failures.length === 0,
    orders: imported,
    items: itemsSynced,
    stale_items_deleted: staleItemsDeleted,
    mismatched_count: mismatchedCount,
    checked: sourceRows.length,
    changed: candidates.length,
    warnings: warnings.length ? warnings : undefined,
    failures: failures.length ? failures : undefined,
    error: failures.length ? failures.map((failure) => failure.error).join("; ") : undefined,
    message: candidates.length
      ? `MalluSpices checked ${sourceRows.length} recent source orders and refreshed ${candidates.length} changed or missing order(s).`
      : `MalluSpices checked ${sourceRows.length} recent source orders; CentralHub was already current.`,
  };
}

async function syncDelegatedStore(secret: string, storeSlug: string, orderId?: string) {
  const payload = await callCanonicalSync(secret, { storeSlug, orderId });
  const storeResult = payload.stores?.find((row: any) => row.store === storeSlug) || {};
  return {
    store: storeSlug,
    configured: storeResult.configured !== false,
    transport: storeResult.transport || "canonical_sync",
    success: payload.success !== false,
    orders: Number(storeResult.orders ?? payload.imported ?? 0),
    items: Number(storeResult.items ?? payload.items_synced ?? 0),
    stale_items_deleted: Number(storeResult.stale_items_deleted ?? payload.stale_items_deleted ?? 0),
    mismatched_count: Number(payload.mismatched_count || 0),
    warnings: payload.warnings,
    error: payload.error || payload.failures?.[0]?.error,
    message: payload.message,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (!["GET", "POST"].includes(req.method)) return reply({ success: false, error: "Method not allowed" }, 405);

  try {
    const ch = await getCentralClient();
    if (!(await isAuthorized(req, ch))) return reply({ success: false, error: "Unauthorized sync request" }, 401);

    const request = await parseRequest(req);
    if (request.orderId && !request.storeSlug) {
      return reply({ success: false, error: "storeSlug is required when orderId is supplied" }, 400);
    }
    if (request.storeSlug && !STORE_SLUGS.includes(request.storeSlug as any)) {
      return reply({ success: false, error: `Unsupported store: ${request.storeSlug}` }, 400);
    }

    const secret = await getInternalSecret(ch);
    const selected = request.storeSlug ? [request.storeSlug] : [...STORE_SLUGS];

    const results = await Promise.all(selected.map(async (slug) => {
      try {
        if (slug === "malluspices" && !request.orderId) {
          return await syncMalluIncremental(ch, secret);
        }
        return await syncDelegatedStore(secret, slug, request.orderId);
      } catch (error) {
        return {
          store: slug,
          configured: true,
          success: false,
          orders: 0,
          items: 0,
          error: errorMessage(error),
        };
      }
    }));

    const imported = results.reduce((sum, row: any) => sum + Number(row.orders || 0), 0);
    const itemsSynced = results.reduce((sum, row: any) => sum + Number(row.items || 0), 0);
    const staleItemsDeleted = results.reduce((sum, row: any) => sum + Number(row.stale_items_deleted || 0), 0);
    const mismatchedCount = results.reduce((sum, row: any) => sum + Number(row.mismatched_count || 0), 0);
    const failures = results
      .filter((row: any) => !row.success)
      .map((row: any) => ({ store: row.store, error: row.error || "Unknown sync failure" }));
    const warnings = results.flatMap((row: any) => row.warnings || []);

    return reply({
      success: failures.length === 0,
      partial_success: failures.length > 0 && failures.length < results.length,
      targeted: Boolean(request.orderId || request.storeSlug),
      order_id: request.orderId || null,
      store_slug: request.storeSlug || null,
      imported,
      items_synced: itemsSynced,
      stale_items_deleted: staleItemsDeleted,
      mismatched_count: mismatchedCount,
      stores: results,
      failures: failures.length ? failures : undefined,
      warnings: warnings.length ? warnings : undefined,
      message: failures.length
        ? `Sync completed with ${failures.length} store failure(s).`
        : `Sync complete: ${imported} order(s) imported or refreshed; ${staleItemsDeleted} stale item row(s) removed.`,
    });
  } catch (error) {
    return reply({ success: false, error: errorMessage(error) }, 500);
  }
});

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function getErrorMessage(err: any): string {
  if (!err) return "Unknown error";
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  if (err.details) return err.details;
  return String(err);
}

function isUuid(id: any): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return typeof id === 'string' && uuidRegex.test(id);
}

function generateSafeUuid(preferredId?: any, fallbackNamespace?: string): string {
  if (isUuid(preferredId)) return preferredId;
  if (fallbackNamespace) {
    let hash = 0;
    for (let i = 0; i < fallbackNamespace.length; i++) { hash = ((hash << 5) - hash) + fallbackNamespace.charCodeAt(i); hash |= 0; }
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    return `${hex}-0000-4000-8000-000000000000`;
  }
  return crypto.randomUUID();
}

const mapOrderData = (order: any, storeId: string) => {
  const paymentMethodMap: Record<string, string> = { card: "card", cod: "cod", mollie: "card", paypal: "paypal", wallet: "wallet" };
  const orderStatusMap: Record<string, string> = {
    pending: "pending_payment",
    confirmed: "confirmed",
    processing: "packing",
    packed: "packed",
    shipped: "shipped",
    cancelled: "cancelled",
    refunded: "refunded",
    paid: "paid",
    picking: "picking",
    picked: "picked",
    packing: "packing",
    ready_to_ship: "ready_to_ship",
    shipment_booked: "shipment_booked",
    collected: "collected",
    at_local_depot: "at_local_depot",
    out_for_delivery: "out_for_delivery",
    delivered: "delivered",
    completed: "completed",
    failed: "failed",
    returned: "returned",
    delivery_attempted: "delivery_attempted",
    ready_for_collection: "ready_for_collection",
    delivery_rescheduled: "delivery_rescheduled"
  };
  const paymentStatusMap: Record<string, string> = { pending: "pending", paid: "paid", failed: "failed", refunded: "refunded" };

  const total = Number(order.total || order.total_amount || 0);
  const delivery_fee = Number(order.delivery_fee || order.shipping_cost || 0);
  const subtotal = order.subtotal ? Number(order.subtotal) : (total - delivery_fee);

  const mapped: any = {
    id: order.id, store_id: storeId,
    order_number: order.order_number, customer_name: order.customer_name ?? "Guest",
    customer_email: order.customer_email ?? "", customer_phone: order.customer_phone ?? "",
    delivery_address: order.delivery_address ?? "", delivery_city: order.delivery_city ?? "",
    delivery_postcode: order.delivery_postcode ?? "", subtotal, delivery_fee, total,
    payment_method: paymentMethodMap[String(order.payment_method).toLowerCase()] ?? "card",
    payment_status: paymentStatusMap[String(order.payment_status).toLowerCase()] ?? "pending",
    order_status: orderStatusMap[String(order.order_status ?? order.status).toLowerCase()] ?? "pending_payment",
    created_at: order.created_at, updated_at: order.updated_at,
    inventory_sync_status: 'pending',
    stock_deducted: false,
  };

  const paidStatuses = ['confirmed', 'picking', 'packing', 'packed', 'ready_to_ship', 'shipment_booked', 'shipped', 'collected', 'out_for_delivery', 'at_local_depot', 'delivered', 'completed'];
  if (mapped.payment_status !== 'paid' && paidStatuses.includes(mapped.order_status)) {
    mapped.payment_status = 'paid';
  }

  return mapped;
};

/**
 * Strictly matches remote products to CentralHub products.
 * Priority: 1. Direct ID/UUID match, 2. SKU backup match.
 * NEVER creates new products.
 */
async function getProductMappings(supabase: any, remoteProducts: any[], storeId: string): Promise<{ remoteIdToChUuid: Map<string, string>; unmatchedSkus: Set<string> }> {
  const remoteIdToChUuid = new Map<string, string>();
  const unmatchedSkus = new Set<string>();

  if (!remoteProducts || remoteProducts.length === 0) return { remoteIdToChUuid, unmatchedSkus };

  // 1. PHASE 1: Match by IDs (Direct UUID links)
  const idsToCheck = new Set<string>();
  remoteProducts.forEach(p => {
    if (isUuid(p.id)) idsToCheck.add(p.id);
    if (isUuid(p.centralhub_product_id)) idsToCheck.add(p.centralhub_product_id);
  });

  if (idsToCheck.size > 0) {
    const { data: existing } = await supabase.from('products').select('id').in('id', Array.from(idsToCheck));
    const existingIds = new Set((existing || []).map((p: any) => p.id));

    remoteProducts.forEach(p => {
      // Priority 1: Use centralhub_product_id if it exists in CH
      if (isUuid(p.centralhub_product_id) && existingIds.has(p.centralhub_product_id)) {
        remoteIdToChUuid.set(p.id, p.centralhub_product_id);
      }
      // Priority 2: Use remote ID if it is a valid CH UUID
      else if (isUuid(p.id) && existingIds.has(p.id)) {
        remoteIdToChUuid.set(p.id, p.id);
      }
    });
  }

  // 2. PHASE 2: Match by SKU (Backup plan)
  const unmatchedProducts = remoteProducts.filter(p => !remoteIdToChUuid.has(p.id));
  const skusToCheck = unmatchedProducts.map(p => p.sku).filter(Boolean);

  if (skusToCheck.length > 0) {
    const { data: existing } = await supabase.from('products').select('id, sku').in('sku', skusToCheck);
    const skuMap = new Map((existing || []).map((p: any) => [p.sku, p.id]));

    unmatchedProducts.forEach(p => {
      if (p.sku && skuMap.has(p.sku)) {
        remoteIdToChUuid.set(p.id, skuMap.get(p.sku)!);
      } else {
        unmatchedSkus.add(p.sku || `Unnamed (ID: ${p.id})`);
      }
    });
  }

  // Product identity is established by centralhub_product_id/SKU.
  // Stores use separate databases; never create store-product assignment rows.
  return { remoteIdToChUuid, unmatchedSkus };
}

async function getLastSyncTimestamp(centralHubSupabase: any, storeId: string): Promise<string | null> {
  try {
    const { data } = await centralHubSupabase.from('orders')
      .select('created_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.created_at ?? null;
  } catch { return null; }
}

async function syncFromSource(
  centralHubUrl: string,
  centralHubKey: string,
  supabaseUrl: string,
  serviceKey: string,
  storeSlug: string,
  specificOrderId?: string
): Promise<{ success: boolean; orders?: number; items?: number; mismatched_orders?: any[]; error?: string }> {
  const centralHubSupabase = createClient(centralHubUrl, centralHubKey);
  const remoteSupabase = createClient(supabaseUrl, serviceKey);
  const { data: store } = await centralHubSupabase.from('stores').select('id').ilike('slug', storeSlug).maybeSingle();
  if (!store) return { success: false, error: "Store not found" };

  try {
    let query = remoteSupabase.from("orders").select("*");
    if (specificOrderId) {
      query = query.eq('id', specificOrderId);
    } else {
      const lastSync = await getLastSyncTimestamp(centralHubSupabase, store.id);
      if (lastSync) {
        query = query.gte('created_at', lastSync).order('created_at', { ascending: false }).limit(100);
      } else {
        query = query.order('created_at', { ascending: false }).limit(100);
      }
    }
    const { data: orders } = await query;
    if (!orders || orders.length === 0) return { success: true, orders: 0, items: 0 };

    // Fetch all order items from remote
    const { data: allTableItems } = await remoteSupabase.from("order_items").select("*").in('order_id', orders.map((o: any) => o.id));
    if (!allTableItems) return { success: true, orders: orders.length, items: 0 };

    // Identify unique remote products to match
    const uniqueRemoteProductIds = new Set<string>();
    allTableItems.forEach((i: any) => { if (i.product_id) uniqueRemoteProductIds.add(i.product_id); });

    let remoteIdToChUuid = new Map<string, string>();
    const remoteProductSkuMap = new Map<string, string>(); // remote_product_id -> sku

    if (uniqueRemoteProductIds.size > 0) {
      const { data: remoteProducts } = await remoteSupabase.from('products').select('*').in('id', Array.from(uniqueRemoteProductIds));
      if (remoteProducts) {
        const mappings = await getProductMappings(centralHubSupabase, remoteProducts, store.id);
        remoteIdToChUuid = mappings.remoteIdToChUuid;
        remoteProducts.forEach((p: any) => { if (p.sku) remoteProductSkuMap.set(p.id, p.sku); });
      }
    }

    const mismatchedOrders: any[] = [];
    const validOrdersToUpsert: any[] = [];
    const validItemsToUpsert: any[] = [];

    const orderIds = orders.map((o: any) => o.id);
    const { data: existingOrders } = await centralHubSupabase.from("orders").select('id, inventory_sync_status').in('id', orderIds);
    const existingMap = new Map((existingOrders || []).map((o: any) => [o.id, o]));

    for (const remoteOrder of orders) {
      const remoteItems = allTableItems.filter(i => i.order_id === remoteOrder.id);
      const mappedItems: any[] = [];
      const missingSkus: string[] = [];

      for (const item of remoteItems) {
        // Priority 1: Check if the order item itself carries a valid CentralHub Product UUID
        let chUuid = isUuid(item.centralhub_product_id) ? item.centralhub_product_id : null;

        // Priority 2: Use the pre-computed product mapping (ID-match then SKU-match)
        if (!chUuid) {
          chUuid = remoteIdToChUuid.get(item.product_id);
        }

        const resolvedSku = item.sku || remoteProductSkuMap.get(item.product_id);

        if (!chUuid) {
          missingSkus.push(resolvedSku || item.product_name || `ID:${item.product_id}`);
          continue;
        }

        mappedItems.push({
          id: generateSafeUuid(item.id, `${remoteOrder.id}-${item.product_id}-${item.quantity}`),
          order_id: remoteOrder.id,
          product_id: chUuid,
          product_name: item.product_name || item.name || 'Item',
          quantity: Number(item.quantity || 1),
          unit_price: Number(item.unit_price || 0),
          total_price: Number(item.total_price || 0),
          sku: resolvedSku
        });
      }

      // STRICT RULE: If any item in the order is missing a SKU match, skip the entire order
      if (missingSkus.length > 0) {
        mismatchedOrders.push({
          order_number: remoteOrder.order_number,
          missing_skus: missingSkus
        });
        continue;
      }

      const mappedOrder = mapOrderData(remoteOrder, store.id);
      const existing = existingMap.get(remoteOrder.id);

      // Preserve sync status if already processed
      if (existing?.inventory_sync_status === 'synced') {
        mappedOrder.inventory_sync_status = 'synced';
        mappedOrder.stock_deducted = true;
      }

      validOrdersToUpsert.push({ ...mappedOrder, items: mappedItems.map(i => ({ name: i.product_name, quantity: i.quantity, price: i.unit_price, product_id: i.product_id })) });
      mappedItems.forEach(i => validItemsToUpsert.push(i));
    }

    if (validOrdersToUpsert.length > 0) {
      await centralHubSupabase.from("orders").upsert(validOrdersToUpsert, { onConflict: 'id' });
    }
    if (validItemsToUpsert.length > 0) {
      await centralHubSupabase.from("order_items").upsert(validItemsToUpsert, { onConflict: 'id' });
    }

    return {
      success: true,
      orders: validOrdersToUpsert.length,
      items: validItemsToUpsert.length,
      mismatched_orders: mismatchedOrders.length > 0 ? mismatchedOrders : undefined
    };
  } catch (err) { return { success: false, error: getErrorMessage(err) }; }
}

async function syncFromSourceWithTimeout(
  centralHubUrl: string, centralHubKey: string,
  supabaseUrl: string, serviceKey: string,
  storeSlug: string, specificOrderId: string | undefined,
  timeoutMs: number
): Promise<{ success: boolean; orders?: number; items?: number; mismatched_orders?: any[]; error?: string }> {
  const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) =>
    setTimeout(() => resolve({ success: false, error: `Sync timed out after ${timeoutMs / 1000}s` }), timeoutMs)
  );
  return Promise.race([
    syncFromSource(centralHubUrl, centralHubKey, supabaseUrl, serviceKey, storeSlug, specificOrderId),
    timeoutPromise,
  ]);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const centralHubUrl = Deno.env.get("SUPABASE_URL") || "";
    const centralHubKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const sources = [
      { url: Deno.env.get("MALLUSPICES_SUPABASE_URL"), key: Deno.env.get("MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY"), slug: 'malluspices' },
      { url: Deno.env.get("POCKET_SUPABASE_URL"), key: Deno.env.get("POCKET_SUPABASE_SERVICE_ROLE_KEY"), slug: 'pocketgrocery' },
      { url: Deno.env.get("SOURCE3_SUPABASE_URL") || Deno.env.get("KERALA_SUPABASE_URL"), key: Deno.env.get("SOURCE3_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("KERALA_SUPABASE_SERVICE_ROLE_KEY"), slug: 'keralagrocery' }
    ].filter(s => s.url && s.key);

    if (sources.length === 0) {
      return new Response(JSON.stringify({ success: true, imported: 0, message: 'No remote stores configured.' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const PER_STORE_TIMEOUT = 45000;
    const results = await Promise.all(
      sources.map(source =>
        syncFromSourceWithTimeout(centralHubUrl, centralHubKey, source.url!, source.key!, source.slug!, undefined, PER_STORE_TIMEOUT)
      )
    );

    const imported = results.reduce((sum, r) => sum + (r.orders || 0), 0);
    const items_synced = results.reduce((sum, r) => sum + (r.items || 0), 0);
    const allMismatches = results.reduce((acc, r) => r.mismatched_orders ? acc.concat(r.mismatched_orders) : acc, [] as any[]);
    const failures = results.filter(r => !r.success).map((r, i) => ({
      store: sources[i]?.slug,
      error: r.error,
    }));

    let message = `Sync Complete: ${imported} Orders imported.`;
    if (allMismatches.length > 0) {
      message += `\n\n⚠️ ${allMismatches.length} orders SKIPPED due to unmatched SKUs:`;
      allMismatches.slice(0, 5).forEach(m => {
        message += `\n- Order ${m.order_number}: Missing [${m.missing_skus.join(', ')}]`;
      });
      if (allMismatches.length > 5) message += `\n...and ${allMismatches.length - 5} more.`;
    }

    return new Response(JSON.stringify({
      success: failures.length === 0,
      imported,
      items_synced,
      mismatched_count: allMismatches.length,
      message,
      failures: failures.length > 0 ? failures : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: getErrorMessage(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

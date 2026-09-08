import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Webhook-Secret",
};

type SyncRequest = { orderId?: string; storeSlug?: string };
type SourceConfig = { slug: string; url?: string; key?: string };
type Bundle = { orders: any[]; order_items: any[]; products: any[] };

function reply(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorMessage(error: any) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  return error.message || error.details || String(error);
}


async function notifyCentralHubPhonePush(eventType: "ORDER_RECEIVED" | "PAYMENT_CONFIRMED", order: any) {
  const secret = Deno.env.get("CENTRALHUB_PUSH_API_SECRET") || "";
  if (!secret) return { sent: false, skipped: true, reason: "CENTRALHUB_PUSH_API_SECRET is not configured" };

  const orderNumber = text(order.order_number) || "new order";
  const customerName = text(order.customer_name) || "Customer";
  const amount = money(order.total);
  const amountText = amount > 0 ? ` — £${amount.toFixed(2)}` : "";
  const confirmed = eventType === "PAYMENT_CONFIRMED";
  const response = await fetch("https://centralhub.network/api/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      title: confirmed ? "Order confirmed" : "New order received",
      message: confirmed
        ? `Order ${orderNumber} has been confirmed${amountText}.`
        : `Order ${orderNumber} from ${customerName}${amountText}.`,
      url: "/orders",
      storeId: order.store_id || null,
      severity: "info",
      category: confirmed ? "order_confirmed" : "order_received",
      metadata: {
        source: "supabase-sync-orders",
        event_type: eventType,
        order_id: order.id || null,
        order_number: order.order_number || null,
      },
    }),
  });

  if (!response.ok) throw new Error(`CentralHub phone push failed (${response.status})`);
  return await response.json().catch(() => ({ sent: true }));
}


async function isAuthorizedSyncRequest(req: Request) {
  const configuredSecrets = [
    Deno.env.get("CENTRALHUB_PUSH_API_SECRET")?.trim() || "",
    Deno.env.get("CENTRALHUB_WEBHOOK_SECRET")?.trim() || "",
  ].filter(Boolean);
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  const webhookSecret = req.headers.get("x-webhook-secret")?.trim() || "";

  if (configuredSecrets.some((secret) => secret === token || secret === webhookSecret)) {
    return true;
  }

  // Keep the store-to-CentralHub secret out of source control. The service-role
  // client can read the protected runtime config row when no Edge secret is set.
  try {
    const chUrl = Deno.env.get("SUPABASE_URL") || "";
    const chKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!chUrl || !chKey) return false;
    const ch = createClient(chUrl, chKey, { auth: { persistSession: false } });
    const { data } = await ch
      .from("app_config")
      .select("value")
      .eq("key", "malluspices_sync_secret")
      .maybeSingle();
    const storedSecret = String(data?.value || "").trim();
    return Boolean(storedSecret && (storedSecret === token || storedSecret === webhookSecret));
  } catch (error) {
    console.error("[sync-orders] Authorization lookup failed", error instanceof Error ? error.message : "unknown error");
    return false;
  }
}

function isUuid(value: any): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function normalizeSlug(value?: string | null) {
  const slug = String(value || "").trim().toLowerCase();
  if (!slug) return undefined;
  if (slug === "keralagroceries") return "keralagrocery";
  if (slug === "tamilretail.com") return "tamilretail";
  return slug;
}

function money(value: any) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function text(value: any) {
  if (value == null) return "";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  return "";
}

function safeUuid(preferred: any, namespace: string) {
  if (isUuid(preferred)) return preferred;
  let hash = 0;
  for (let i = 0; i < namespace.length; i++) {
    hash = ((hash << 5) - hash) + namespace.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  return `${hex}-0000-4000-8000-000000000000`;
}

function addressParts(order: any) {
  const shipping = order.shipping_address && typeof order.shipping_address === "object"
    ? order.shipping_address
    : {};
  const line1 = text(order.delivery_address)
    || text(order.shipping_address_line1)
    || text(shipping.line1)
    || text(shipping.address_line1);
  const line2 = text(order.shipping_address_line2)
    || text(shipping.line2)
    || text(shipping.address_line2);
  return {
    address: [line1, line2].filter(Boolean).join(", "),
    city: text(order.delivery_city) || text(order.shipping_city) || text(shipping.city),
    postcode: text(order.delivery_postcode)
      || text(order.shipping_postcode)
      || text(shipping.postal_code)
      || text(shipping.postcode),
  };
}

function mapOrder(order: any, storeId: string) {
  const paymentMethodMap: Record<string, string> = {
    card: "card", online: "card", cod: "cod", mollie: "mollie",
    paypal: "paypal", wallet: "wallet", globalpayments: "globalpayments",
    trustpayments: "trustpayments", clearpay: "clearpay",
  };
  const statusMap: Record<string, string> = {
    pending: "pending_payment", pending_payment: "pending_payment", paid: "paid",
    confirmed: "confirmed", processing: "packing", picking: "picking", picked: "picked",
    packing: "packing", packed: "packed", ready_to_ship: "ready_to_ship",
    shipment_booked: "shipment_booked", collected: "collected", shipped: "shipped",
    at_local_depot: "at_local_depot", out_for_delivery: "out_for_delivery",
    delivered: "delivered", completed: "completed", cancelled: "cancelled",
    refunded: "refunded", delivery_attempted: "delivery_attempted",
    ready_for_collection: "ready_for_collection", delivery_rescheduled: "delivery_rescheduled",
    returned: "returned", failed: "failed",
  };
  const paymentStatusMap: Record<string, string> = {
    pending: "pending", paid: "paid", completed: "paid", failed: "failed", refunded: "refunded",
  };

  const method = String(order.payment_method || "card").toLowerCase();
  const total = money(order.total ?? order.total_amount);
  const deliveryFee = money(order.delivery_fee ?? order.delivery_charge ?? order.shipping_cost);
  const subtotal = order.subtotal != null ? money(order.subtotal) : money(total - deliveryFee);
  const status = statusMap[String(order.order_status || order.status || "pending").toLowerCase()] || "pending_payment";
  const address = addressParts(order);
  const mollieId = order.mollie_payment_id || (method === "mollie" ? order.payment_reference : null);
  const legacyEstimate = money(order.gateway_fee_estimated ?? order.payment_fee);
  const actualVerified = order.gateway_fee_source === "mollie_balance_transaction" && order.gateway_fee_actual != null;

  const mapped: Record<string, any> = {
    id: order.id,
    store_id: storeId,
    order_number: order.order_number,
    customer_name: text(order.customer_name) || text(order.shipping_name) || "Guest",
    customer_email: text(order.customer_email) || text(order.shipping_email),
    customer_phone: text(order.customer_phone) || text(order.shipping_phone),
    delivery_address: address.address,
    delivery_city: address.city,
    delivery_postcode: address.postcode,
    subtotal,
    delivery_fee: deliveryFee,
    total,
    payment_method: paymentMethodMap[method] || "card",
    payment_status: paymentStatusMap[String(order.payment_status || "pending").toLowerCase()] || "pending",
    order_status: status,
    payment_reference: order.payment_reference || mollieId || null,
    mollie_payment_id: mollieId || null,
    created_at: order.created_at,
    updated_at: order.updated_at || order.created_at,
    inventory_sync_status: "pending",
    stock_deducted: false,
    sync_state: "synced",
    sync_error: null,
    last_synced_at: new Date().toISOString(),
  };

  if (method === "mollie") {
    mapped.payment_fee = legacyEstimate;
    mapped.gateway_fee_estimated = legacyEstimate;
    if (actualVerified) {
      mapped.gateway_fee_actual = money(order.gateway_fee_actual);
      mapped.gateway_fee_net = money(order.gateway_fee_net ?? order.gateway_fee_actual);
      mapped.gateway_fee_vat = order.gateway_fee_vat == null ? null : money(order.gateway_fee_vat);
      mapped.gateway_fee_gross = order.gateway_fee_gross == null ? null : money(order.gateway_fee_gross);
      mapped.gateway_fee_source = "mollie_balance_transaction";
      mapped.gateway_fee_reconciled_at = order.gateway_fee_reconciled_at || new Date().toISOString();
    } else {
      mapped.gateway_fee_net = legacyEstimate;
      mapped.gateway_fee_source = "store_estimate";
      mapped.gateway_fee_meta = {
        estimate_origin: "malluspices_legacy_formula",
        store_order_number: order.order_number || null,
      };
    }
  }

  const operationalPaid = new Set([
    "confirmed", "picking", "picked", "packing", "packed", "ready_to_ship",
    "shipment_booked", "collected", "shipped", "at_local_depot",
    "out_for_delivery", "delivered", "completed",
  ]);
  if (mapped.payment_status !== "paid" && operationalPaid.has(status)) mapped.payment_status = "paid";
  return mapped;
}

const SUCCESSFUL_PAYMENT_STATUSES = new Set([
  "paid",
  "completed",
  "complete",
  "success",
  "successful",
  "confirmed",
  "authorised",
  "authorized",
]);

function isSuccessfulSourcePayment(order: any, mapped: any) {
  const rawPayment = text(
    order.payment_status
      ?? order.paymentStatus
      ?? order.payment_state
      ?? order.paymentState
  ).trim().toLowerCase();

  // Notifications are intentionally fail-closed. Do not infer payment success
  // from an operational status such as confirmed, picking, or completed.
  return Boolean(
    rawPayment
      && SUCCESSFUL_PAYMENT_STATUSES.has(rawPayment)
      && mapped.payment_status === "paid"
  );
}

async function fetchDirectBundle(source: SourceConfig, orderId?: string): Promise<Bundle> {
  const remote = createClient(source.url!, source.key!);
  let orderQuery = remote.from("orders").select("*");
  let orderResult: any;

  if (orderId) {
    orderResult = await orderQuery.eq("id", orderId).limit(1);
  } else {
    orderResult = await orderQuery.order("updated_at", { ascending: false }).limit(100);
    if (orderResult.error) {
      orderQuery = remote.from("orders").select("*");
      orderResult = await orderQuery.order("created_at", { ascending: false }).limit(100);
    }
  }

  if (orderResult.error) throw orderResult.error;
  const orders = orderResult.data || [];
  if (!orders.length) return { orders: [], order_items: [], products: [] };

  const orderIds = orders.map((order: any) => order.id);
  const itemResult = await remote.from("order_items").select("*").in("order_id", orderIds);
  if (itemResult.error) throw itemResult.error;
  const orderItems = itemResult.data || [];

  const productIds = [...new Set(orderItems.map((item: any) => item.product_id).filter(Boolean))];
  let products: any[] = [];
  if (productIds.length) {
    const productResult = await remote.from("products").select("*").in("id", productIds);
    if (productResult.error) throw productResult.error;
    products = productResult.data || [];
  }

  return { orders, order_items: orderItems, products };
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signedTamilRequest(action: string, params: Record<string, any> = {}) {
  const secret = Deno.env.get("CENTRALHUB_WEBHOOK_SECRET") || "";
  if (!secret) throw new Error("CentralHub signed gateway is not configured");
  const payload = JSON.stringify({ action, params });
  const timestamp = Date.now().toString();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = toHex(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  ));

  const response = await fetch(
    "https://gokapknjocmgciwnxnxr.supabase.co/functions/v1/centralhub-orders",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestamp, payload, signature }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || `TamilRetail gateway failed (${response.status})`);
  }
  return data;
}

async function persistBundle(ch: any, storeSlug: string, bundle: Bundle, specificOrderId?: string) {
  const { data: store, error: storeError } = await ch
    .from("stores")
    .select("id")
    .ilike("slug", storeSlug)
    .maybeSingle();
  if (storeError || !store) return { success: false, error: `Store not found: ${storeSlug}` };

  const orders = (bundle.orders || []).filter((order: any) =>
    !String(order.order_number || "").toLowerCase().startsWith("compat-test-")
  );
  const items = bundle.order_items || [];
  const products = bundle.products || [];

  if (!orders.length) {
    return specificOrderId
      ? { success: false, orders: 0, items: 0, error: `Order ${specificOrderId} was not found on ${storeSlug}` }
      : { success: true, orders: 0, items: 0 };
  }

  const productByRemoteId = new Map(products.map((product: any) => [product.id, product]));
  const candidateIds = new Set<string>();
  for (const product of products) {
    if (isUuid(product.id)) candidateIds.add(product.id);
    if (isUuid(product.centralhub_product_id)) candidateIds.add(product.centralhub_product_id);
    if (isUuid(product.source_product_id)) candidateIds.add(product.source_product_id);
  }
  for (const item of items) {
    if (isUuid(item.centralhub_product_id)) candidateIds.add(item.centralhub_product_id);
  }

  const centralIdResult = candidateIds.size
    ? await ch.from("products").select("id").in("id", [...candidateIds])
    : { data: [], error: null };
  if (centralIdResult.error) throw centralIdResult.error;
  const validCentralIds = new Set((centralIdResult.data || []).map((product: any) => product.id));

  const skus = [...new Set([
    ...products.map((product: any) => product.sku),
    ...items.map((item: any) => item.sku),
  ].filter(Boolean))];
  const skuResult = skus.length
    ? await ch.from("products").select("id,sku").in("sku", skus)
    : { data: [], error: null };
  if (skuResult.error) throw skuResult.error;
  const centralBySku = new Map((skuResult.data || []).map((product: any) => [product.sku, product.id]));

  const orderIds = orders.map((order: any) => order.id);
  const existingByIdResult = await ch
    .from("orders")
    .select("id,order_number,inventory_sync_status,order_status,payment_status")
    .in("id", orderIds);
  if (existingByIdResult.error) throw existingByIdResult.error;
  const existingById = new Map((existingByIdResult.data || []).map((order: any) => [order.id, order]));

  const orderNumbers = [...new Set(orders.map((order: any) => order.order_number).filter(Boolean))];
  const existingByNumberResult = orderNumbers.length
    ? await ch
        .from("orders")
        .select("id,order_number,inventory_sync_status,order_status,payment_status")
        .eq("store_id", store.id)
        .in("order_number", orderNumbers)
    : { data: [], error: null };
  if (existingByNumberResult.error) throw existingByNumberResult.error;
  const existingByNumber = new Map((existingByNumberResult.data || []).map((order: any) => [order.order_number, order]));

  const validOrders: any[] = [];
  const validItems: any[] = [];
  const mismatches: any[] = [];
  const phonePushEvents: Array<{ eventType: "ORDER_RECEIVED" | "PAYMENT_CONFIRMED"; order: any }> = [];
  const canonicalIdsToReplace = new Set<string>();

  for (const remoteOrder of orders) {
    const numberMatch = existingByNumber.get(remoteOrder.order_number);
    const targetOrderId = numberMatch?.id || remoteOrder.id;
    if (targetOrderId !== remoteOrder.id) canonicalIdsToReplace.add(targetOrderId);

    const remoteItems = items.filter((item: any) => item.order_id === remoteOrder.id);
    const mappedItems: any[] = [];
    const missing: string[] = [];

    for (const item of remoteItems) {
      const product = productByRemoteId.get(item.product_id) as any;
      const preferred = [
        item.centralhub_product_id,
        product?.centralhub_product_id,
        product?.source_product_id,
        product?.id,
      ].find((value) => isUuid(value) && validCentralIds.has(value));
      const sku = item.sku || product?.sku || null;
      const centralProductId = preferred || (sku ? centralBySku.get(sku) : undefined);

      if (!centralProductId) {
        missing.push(sku || item.product_name || item.name || product?.name || `ID:${item.product_id}`);
        continue;
      }

      const quantity = Number(item.quantity || 1);
      const unitPrice = money(item.unit_price ?? item.product_price);
      mappedItems.push({
        id: safeUuid(item.id, `${remoteOrder.id}-${item.product_id}-${quantity}`),
        order_id: targetOrderId,
        product_id: centralProductId,
        product_name: item.product_name || item.name || product?.name || "Item",
        quantity,
        unit_price: unitPrice,
        total_price: money(item.total_price ?? item.subtotal ?? unitPrice * quantity),
        sku,
      });
    }

    if (missing.length) {
      mismatches.push({ order_id: targetOrderId, order_number: remoteOrder.order_number, missing_skus: missing });
      continue;
    }

    const mapped = mapOrder(remoteOrder, store.id);
    mapped.id = targetOrderId;
    const existing = existingById.get(remoteOrder.id) || numberMatch;
    const paymentConfirmed = Boolean(
      existing && (
        (existing.payment_status !== "paid" && mapped.payment_status === "paid")
        || (existing.order_status !== "confirmed" && mapped.order_status === "confirmed")
      )
    );
    const paymentSuccessful = isSuccessfulSourcePayment(remoteOrder, mapped);
    if (!existing && paymentSuccessful) {
      phonePushEvents.push({ eventType: "ORDER_RECEIVED", order: mapped });
    } else if (existing && paymentConfirmed && paymentSuccessful) {
      phonePushEvents.push({ eventType: "PAYMENT_CONFIRMED", order: mapped });
    }
    if (existing?.inventory_sync_status === "synced") {
      mapped.inventory_sync_status = "synced";
      mapped.stock_deducted = true;
    }
    mapped.items = mappedItems.map((item: any) => ({
      name: item.product_name,
      quantity: item.quantity,
      price: item.unit_price,
      product_id: item.product_id,
    }));

    validOrders.push(mapped);
    validItems.push(...mappedItems);
  }

  if (validOrders.length) {
    const upsertOrders = await ch.from("orders").upsert(validOrders, { onConflict: "id" });
    if (upsertOrders.error) throw upsertOrders.error;
  }

  for (const orderId of canonicalIdsToReplace) {
    const deletion = await ch.from("order_items").delete().eq("order_id", orderId);
    if (deletion.error) throw deletion.error;
  }

  if (validItems.length) {
    const upsertItems = await ch.from("order_items").upsert(validItems, { onConflict: "id" });
    if (upsertItems.error) throw upsertItems.error;
  }

  const phonePushResults = [];
  for (const event of phonePushEvents) {
    try {
      phonePushResults.push({ event_type: event.eventType, ...(await notifyCentralHubPhonePush(event.eventType, event.order)) });
    } catch (error) {
      phonePushResults.push({ event_type: event.eventType, sent: false, error: errorMessage(error) });
    }
  }

  for (const order of validOrders) {
    try {
      await ch.rpc("recalculate_order_profitability", { p_order_id: order.id });
    } catch {
      // Derived profitability must never make transport fail.
    }
  }

  if (specificOrderId && mismatches.length) {
    return {
      success: false,
      orders: 0,
      items: 0,
      mismatched_orders: mismatches,
      error: `Order ${specificOrderId} has unmapped product(s): ${mismatches[0].missing_skus.join(", ")}`,
    };
  }

  return {
    success: true,
    orders: validOrders.length,
    items: validItems.length,
    mismatched_orders: mismatches.length ? mismatches : undefined,
    phone_push_events: phonePushResults.length ? phonePushResults : undefined,
  };
}

async function syncSource(chUrl: string, chKey: string, source: SourceConfig, orderId?: string) {
  const ch = createClient(chUrl, chKey);
  try {
    const bundle: Bundle = source.slug === "tamilretail" && (!source.url || !source.key)
      ? await signedTamilRequest("pull", { orderId: orderId || null })
      : await fetchDirectBundle(source, orderId);
    return await persistBundle(ch, source.slug, bundle, orderId);
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

async function withTimeout(promise: Promise<any>, timeoutMs = 45000) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(
      () => resolve({ success: false, error: `Sync timed out after ${timeoutMs / 1000}s` }),
      timeoutMs,
    )),
  ]);
}

async function parseRequest(req: Request): Promise<SyncRequest> {
  const url = new URL(req.url);
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  return {
    orderId: body?.orderId || url.searchParams.get("orderId") || undefined,
    storeSlug: normalizeSlug(body?.storeSlug || url.searchParams.get("storeSlug")),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (!["GET", "POST"].includes(req.method)) return reply({ success: false, error: "Method not allowed" }, 405);
  if (!(await isAuthorizedSyncRequest(req))) {
    return reply({ success: false, error: "Unauthorized sync request" }, 401);
  }

  try {
    const chUrl = Deno.env.get("SUPABASE_URL") || "";
    const chKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const request = await parseRequest(req);
    if (request.orderId && !request.storeSlug) {
      return reply({ success: false, error: "storeSlug is required when orderId is supplied" }, 400);
    }

    const sources: SourceConfig[] = [
      {
        slug: "malluspices",
        url: Deno.env.get("MALLUSPICES_SUPABASE_URL"),
        key: Deno.env.get("MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY"),
      },
      {
        slug: "pocketgrocery",
        url: Deno.env.get("POCKET_SUPABASE_URL"),
        key: Deno.env.get("POCKET_SUPABASE_SERVICE_ROLE_KEY"),
      },
      {
        slug: "keralagrocery",
        url: Deno.env.get("SOURCE3_SUPABASE_URL") || Deno.env.get("KERALA_SUPABASE_URL"),
        key: Deno.env.get("SOURCE3_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("KERALA_SUPABASE_SERVICE_ROLE_KEY"),
      },
      {
        slug: "tamilretail",
      },
    ];

    const selected = request.storeSlug
      ? sources.filter((source) => source.slug === request.storeSlug)
      : sources;
    if (request.storeSlug && !selected.length) {
      return reply({ success: false, error: `Unsupported store: ${request.storeSlug}` }, 400);
    }

    const results = await Promise.all(selected.map(async (source) => {
      const usesTamilGateway = source.slug === "tamilretail" && (!source.url || !source.key);
      if ((!source.url || !source.key) && !usesTamilGateway) {
        return {
          store: source.slug,
          configured: false,
          success: false,
          orders: 0,
          items: 0,
          error: `Source credentials are not configured for ${source.slug}`,
        };
      }
      const result: any = await withTimeout(syncSource(chUrl, chKey, source, request.orderId));
      return {
        store: source.slug,
        configured: true,
        transport: usesTamilGateway ? "signed_gateway" : "direct_service_role",
        ...result,
      };
    }));

    const imported = results.reduce((sum: number, result: any) => sum + Number(result.orders || 0), 0);
    const itemsSynced = results.reduce((sum: number, result: any) => sum + Number(result.items || 0), 0);
    const mismatches = results.flatMap((result: any) => result.mismatched_orders || []);
    const failures = results
      .filter((result: any) => !result.success)
      .map((result: any) => ({ store: result.store, error: result.error || "Unknown sync failure" }));
    const warnings = results
      .filter((result: any) => result.success && (result.mismatched_orders?.length || 0) > 0)
      .map((result: any) => ({
        store: result.store,
        warning: `${result.mismatched_orders.length} order(s) skipped because product mappings are missing`,
      }));

    return reply({
      success: failures.length === 0,
      partial_success: failures.length > 0 && failures.length < results.length,
      targeted: Boolean(request.orderId || request.storeSlug),
      order_id: request.orderId || null,
      store_slug: request.storeSlug || null,
      imported,
      items_synced: itemsSynced,
      mismatched_count: mismatches.length,
      stores: results,
      failures: failures.length ? failures : undefined,
      warnings: warnings.length ? warnings : undefined,
      message: failures.length
        ? `Sync completed with ${failures.length} store failure(s).`
        : `Sync complete: ${imported} order(s) imported or refreshed.`,
    });
  } catch (error) {
    return reply({ success: false, error: errorMessage(error) }, 500);
  }
});

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const statusMap: Record<string, string> = {
  pending_payment: "pending", paid: "paid", confirmed: "confirmed",
  picking: "picking", picked: "picked", packing: "processing", packed: "packed",
  ready_to_ship: "ready_to_ship", shipment_booked: "shipment_booked",
  collected: "collected", shipped: "shipped", at_local_depot: "at_local_depot",
  out_for_delivery: "out_for_delivery", delivered: "delivered", completed: "completed",
  cancelled: "cancelled", refunded: "refunded", delivery_attempted: "delivery_attempted",
  ready_for_collection: "ready_for_collection", delivery_rescheduled: "delivery_rescheduled",
  returned: "returned", failed: "failed",
};

function reply(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function message(error: any) {
  return error?.message || error?.details || String(error || "Unknown error");
}

function normalizeSlug(value: string) {
  const slug = String(value || "").toLowerCase();
  if (slug === "keralagroceries") return "keralagrocery";
  if (slug === "tamilretail.com") return "tamilretail";
  return slug;
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signedTamilRequest(action: string, params: Record<string, any>) {
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return reply({ success: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const central = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return reply({ success: false, error: "Unauthorized" }, 401);

  const internalServiceCall = Boolean(serviceKey) && bearer === serviceKey;
  if (!internalServiceCall) {
    const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!publishableKey) return reply({ success: false, error: "Authentication is not configured" }, 500);

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return reply({ success: false, error: "Unauthorized" }, 401);

    const metadataRole = String(user.app_metadata?.role || user.user_metadata?.profile_role || "").toLowerCase();
    let allowed = ["admin", "superadmin", "administrator"].includes(metadataRole);
    if (!allowed) {
      const { data: profile } = await central
        .from("user_profiles")
        .select("profile_role,is_active")
        .eq("id", user.id)
        .maybeSingle();
      allowed = profile?.is_active !== false && ["admin", "superadmin", "administrator"].includes(String(profile?.profile_role || "").toLowerCase());
    }
    if (!allowed) return reply({ success: false, error: "Forbidden: admin only" }, 403);
  }

  let orderId: string | undefined;
  const markSync = async (state: "synced" | "failed", error?: string | null) => {
    if (!orderId) return;
    const update: Record<string, any> = { sync_state: state, sync_error: error || null };
    if (state === "synced") update.last_synced_at = new Date().toISOString();
    await central.from("orders").update(update).eq("id", orderId);
  };

  try {
    const body = await req.json().catch(() => ({}));
    orderId = body?.orderId;
    const requestedStatus = body?.status;
    const notes = body?.notes || null;
    if (!orderId || !requestedStatus) return reply({ success: false, error: "orderId and status are required" }, 400);

    const { data: order, error: orderError } = await central
      .from("orders")
      .select("id,store_id,order_number,payment_status,tracking_number,courier_name,shipment_status,shipment_label_url,shipment_number")
      .eq("id", orderId)
      .single();
    if (orderError || !order) return reply({ success: false, error: "Order not found" }, 404);

    const { data: store, error: storeError } = await central
      .from("stores")
      .select("slug")
      .eq("id", order.store_id)
      .single();
    if (storeError || !store) {
      await markSync("failed", "Store not found for this order");
      return reply({ success: false, error: "Store not found for this order" }, 404);
    }

    const slug = normalizeSlug(store.slug);
    const remoteStatus = statusMap[requestedStatus] || requestedStatus;
    const configs: Record<string, { url?: string; key?: string; shipmentFields: boolean }> = {
      malluspices: {
        url: Deno.env.get("MALLUSPICES_SUPABASE_URL"),
        key: Deno.env.get("MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY"),
        shipmentFields: true,
      },
      pocketgrocery: {
        url: Deno.env.get("POCKET_SUPABASE_URL"),
        key: Deno.env.get("POCKET_SUPABASE_SERVICE_ROLE_KEY"),
        shipmentFields: false,
      },
      keralagrocery: {
        url: Deno.env.get("SOURCE3_SUPABASE_URL") || Deno.env.get("KERALA_SUPABASE_URL"),
        key: Deno.env.get("SOURCE3_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("KERALA_SUPABASE_SERVICE_ROLE_KEY"),
        shipmentFields: false,
      },
      tamilretail: {
        shipmentFields: false,
      },
    };

    const config = configs[slug];
    if (!config) {
      const error = `Unsupported remote store: ${slug}`;
      await markSync("failed", error);
      return reply({ success: false, store: slug, error }, 400);
    }

    if (slug === "tamilretail" && (!config.url || !config.key)) {
      const result = await signedTamilRequest("update_status", {
        orderId: order.id,
        orderNumber: order.order_number,
        status: remoteStatus,
        paymentStatus: order.payment_status,
      });
      await markSync("synced");
      return reply({
        success: true,
        store: slug,
        transport: "signed_gateway",
        order_id: order.id,
        remote_order_id: result.remote_order_id || null,
        status: remoteStatus,
        notes,
      });
    }

    if (!config.url || !config.key) {
      const error = `Remote credentials are not configured for ${slug}`;
      await markSync("failed", error);
      return reply({ success: false, store: slug, error }, 503);
    }

    const remote = createClient(config.url, config.key);
    let remoteOrder: any = null;

    const byId = await remote.from("orders").select("id,order_number").eq("id", order.id).maybeSingle();
    if (byId.error) throw byId.error;
    remoteOrder = byId.data;

    if (!remoteOrder) {
      const byNumber = await remote.from("orders").select("id,order_number").eq("order_number", order.order_number).maybeSingle();
      if (byNumber.error) throw byNumber.error;
      remoteOrder = byNumber.data;
    }

    if (!remoteOrder) {
      const error = `Order ${order.order_number} was not found on ${slug}`;
      await markSync("failed", error);
      return reply({ success: false, store: slug, error }, 404);
    }

    const update: Record<string, any> = {
      order_status: remoteStatus,
      updated_at: new Date().toISOString(),
    };
    if (order.payment_status) update.payment_status = order.payment_status;
    if (config.shipmentFields) {
      if (order.tracking_number) update.tracking_number = order.tracking_number;
      if (order.courier_name) update.courier_name = order.courier_name;
      if (order.shipment_status) update.shipment_status = order.shipment_status;
      if (order.shipment_label_url) update.shipment_label_url = order.shipment_label_url;
      if (order.shipment_number) update.shipment_number = order.shipment_number;
    }

    const firstPayload = { ...update, status: remoteStatus };
    let result = await remote.from("orders").update(firstPayload).eq("id", remoteOrder.id);
    if (result.error) {
      result = await remote.from("orders").update(update).eq("id", remoteOrder.id);
    }
    if (result.error) throw result.error;

    await markSync("synced");
    return reply({
      success: true,
      store: slug,
      transport: "direct_service_role",
      order_id: order.id,
      remote_order_id: remoteOrder.id,
      status: remoteStatus,
      notes,
    });
  } catch (error: any) {
    const text = message(error);
    await markSync("failed", text);
    return reply({ success: false, error: text }, 500);
  }
});

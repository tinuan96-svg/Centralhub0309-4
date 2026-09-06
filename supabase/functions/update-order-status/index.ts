import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Reverse mapping: CentralHub status -> remote store status
const chToRemoteStatusMap: Record<string, string> = {
  pending_payment: "pending",
  confirmed: "confirmed",
  picking: "picking",
  packing: "processing",
  packed: "packed",
  ready_to_ship: "ready_to_ship",
  shipment_booked: "shipment_booked",
  shipped: "shipped",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  completed: "completed",
  cancelled: "cancelled",
  refunded: "refunded",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { orderId, status, notes } = await req.json();

    if (!orderId || !status) {
      return new Response(
        JSON.stringify({ success: false, error: "orderId and status are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const centralHubUrl = Deno.env.get("SUPABASE_URL") || "";
    const centralHubKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const centralHub = createClient(centralHubUrl, centralHubKey);

    // 1. Get the order and store info
    const { data: order, error: orderError } = await centralHub
      .from("orders")
      .select("id, store_id, order_number, payment_status, tracking_number, courier_name, shipment_status, shipment_label_url, shipment_number")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ success: false, error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: store, error: storeError } = await centralHub
      .from("stores")
      .select("slug")
      .eq("id", order.store_id)
      .single();

    if (storeError || !store) {
      return new Response(
        JSON.stringify({ success: false, error: "Store not found for this order" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Identify the remote store credentials
    let remoteUrl: string | undefined;
    let remoteKey: string | undefined;

    if (store.slug === "malluspices") {
      remoteUrl = Deno.env.get("MALLUSPICES_SUPABASE_URL");
      remoteKey = Deno.env.get("MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY");
    } else if (store.slug === "pocketgrocery") {
      remoteUrl = Deno.env.get("POCKET_SUPABASE_URL");
      remoteKey = Deno.env.get("POCKET_SUPABASE_SERVICE_ROLE_KEY");
    } else if (store.slug === "keralagrocery" || store.slug === "keralagroceries") {
      remoteUrl = Deno.env.get("SOURCE3_SUPABASE_URL") || Deno.env.get("KERALA_SUPABASE_URL");
      remoteKey = Deno.env.get("SOURCE3_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("KERALA_SUPABASE_SERVICE_ROLE_KEY");
    }

    // 3. Push to remote if credentials exist
    if (remoteUrl && remoteKey) {
      const remoteSupabase = createClient(remoteUrl, remoteKey);

      // Map CentralHub status to remote store's expected status
      const remoteStatus = chToRemoteStatusMap[status] || status;

      // Resilience: Update order_status and status columns separately or with fallback
      // to avoid failing the whole query if one column doesn't exist
      const updatePayload: any = {
        updated_at: new Date().toISOString(),
      };

      // Update the main status field
      updatePayload.order_status = remoteStatus;

      // Also push payment_status so the remote store knows payment was confirmed
      if (order.payment_status === "paid") {
        updatePayload.payment_status = "paid";
      }

      // Push shipment data fields if present on the CentralHub order
      if (order.tracking_number) updatePayload.tracking_number = order.tracking_number;
      if (order.courier_name) updatePayload.courier_name = order.courier_name;
      if (order.shipment_status) updatePayload.shipment_status = order.shipment_status;
      if (order.shipment_label_url) updatePayload.shipment_label_url = order.shipment_label_url;
      if (order.shipment_number) updatePayload.shipment_number = order.shipment_number;

      // Look up the remote order by order_number
      const { data: remoteOrder, error: remoteFetchError } = await remoteSupabase
        .from("orders")
        .select("id, order_number")
        .eq("order_number", order.order_number)
        .maybeSingle();

      if (remoteFetchError) {
        console.error(`Failed to find remote order by order_number "${order.order_number}": ${remoteFetchError.message}`);
        return new Response(
          JSON.stringify({ success: false, error: `Remote order lookup failed: ${remoteFetchError.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!remoteOrder) {
        console.warn(`Order ${order.order_number} not found on remote store ${store.slug} — skipping remote update`);
        return new Response(
          JSON.stringify({ success: true, message: `Order ${order.order_number} not found on ${store.slug} — local update only` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // First attempt: try updating both columns (standard for CH-compatible stores)
      const { error: remoteError1 } = await remoteSupabase
        .from("orders")
        .update({ ...updatePayload, status: remoteStatus })
        .eq("id", remoteOrder.id);

      if (remoteError1) {
        console.warn(`Initial remote update failed (possibly missing 'status' column): ${remoteError1.message}. Retrying with only 'order_status'...`);

        // Second attempt: retry without the 'status' alias column
        const { error: remoteError2 } = await remoteSupabase
          .from("orders")
          .update(updatePayload)
          .eq("id", remoteOrder.id);

        if (remoteError2) {
          console.error(`Final remote update failed: ${remoteError2.message}`);
          return new Response(
            JSON.stringify({ success: false, error: `Remote update failed: ${remoteError2.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: `Status '${remoteStatus}' pushed to ${store.slug} for order ${order.order_number}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "No remote store configured — local update only" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

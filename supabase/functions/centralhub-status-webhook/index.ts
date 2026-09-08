import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-centralhub-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_ORDER_STATUSES = new Set([
  "pending_payment", "paid", "confirmed", "picking", "picked", "packing", "packed",
  "ready_to_ship", "shipment_booked", "collected", "shipped", "at_local_depot",
  "out_for_delivery", "delivered", "completed", "cancelled", "refunded",
  "delivery_attempted", "ready_for_collection", "delivery_rescheduled", "returned", "failed",
]);

const ALLOWED_PACKING_STATUSES = new Set(["pending", "packed", "completed"]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalize(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return v || null;
}

function derivePackingStatus(orderStatus: string): string {
  if (["packed", "ready_to_ship", "shipment_booked", "collected", "shipped", "at_local_depot", "out_for_delivery", "delivered", "completed", "returned"].includes(orderStatus)) return "packed";
  if (["cancelled", "refunded", "failed"].includes(orderStatus)) return "pending";
  return "pending";
}

function deriveFulfillmentStatus(orderStatus: string): string {
  switch (orderStatus) {
    case "picking":
    case "picked":
    case "packing":
    case "packed":
    case "ready_to_ship":
    case "shipment_booked":
    case "collected":
    case "shipped":
    case "at_local_depot":
    case "out_for_delivery":
    case "delivered":
    case "completed":
    case "returned":
    case "failed":
      return orderStatus;
    case "cancelled":
    case "refunded":
      return orderStatus;
    default:
      return "pending";
  }
}

function deriveShipmentStatus(orderStatus: string): string | null {
  if (["shipment_booked", "collected", "shipped", "at_local_depot", "out_for_delivery", "delivered", "delivery_attempted", "delivery_rescheduled", "returned", "failed"].includes(orderStatus)) return orderStatus;
  return null;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64ToBytes(value: string): Uint8Array | null {
  try {
    const bin = atob(value);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function verifySignature(body: string, signature: string | null): Promise<boolean> {
  const secret = Deno.env.get("CENTRALHUB_WEBHOOK_SECRET");
  // The endpoint is an external webhook. If a secret is configured, a valid
  // HMAC signature is mandatory. This keeps verify_jwt=false while authenticating
  // CentralHub at the application layer.
  if (!secret) return true;
  if (!signature) return false;

  const supplied = signature.replace(/^sha256=/i, "").trim();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expectedBytes = new Uint8Array(expected);
  const suppliedHex = /^[0-9a-f]{64}$/i.test(supplied) ? supplied : null;
  if (suppliedHex) {
    const suppliedBytes = new Uint8Array(suppliedHex.match(/.{2}/g)!.map((x) => parseInt(x, 16)));
    return crypto.subtle.verify("HMAC", key, suppliedBytes, new TextEncoder().encode(body));
  }

  const suppliedBase64 = base64ToBytes(supplied);
  if (suppliedBase64) {
    return crypto.subtle.verify("HMAC", key, suppliedBase64, new TextEncoder().encode(body));
  }

  return bytesToHex(new Uint8Array(expected)).toLowerCase() === supplied.toLowerCase();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const bodyText = await req.text();

  try {
    if (!(await verifySignature(bodyText, req.headers.get("x-centralhub-signature")))) {
      return json({ error: "Invalid webhook signature" }, 401);
    }

    const payload = JSON.parse(bodyText) as Record<string, unknown>;
    const eventId = normalize(payload.event_id);
    const centralHubOrderId = normalize(payload.order_id) ?? normalize(payload.centralhub_order_id);
    const orderNumber = normalize(payload.order_number);
    const orderStatus = normalize(payload.order_status ?? payload.status);

    if (!eventId) return json({ error: "event_id is required" }, 400);
    if (!centralHubOrderId && !orderNumber) return json({ error: "order_id/centralhub_order_id or order_number is required" }, 400);
    if (!orderStatus || !ALLOWED_ORDER_STATUSES.has(orderStatus)) {
      return json({ error: "Unsupported order status", status: orderStatus }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Idempotency first. The unique external_event_id constraint prevents
    // duplicate webhook deliveries from changing an order twice.
    const { error: insertError } = await supabase
      .from("centralhub_webhook_events")
      .insert({ external_event_id: eventId, raw_payload: payload, process_status: "received" });

    if (insertError?.code === "23505") return json({ success: true, duplicate: true });
    if (insertError) throw insertError;

    const incomingFulfillment = normalize(payload.fulfillment_status);
    const incomingPacking = normalize(payload.packing_status);
    const incomingShipment = normalize(payload.shipment_status);

    const fulfillmentStatus = incomingFulfillment ?? deriveFulfillmentStatus(orderStatus);
    const packingStatus = incomingPacking && ALLOWED_PACKING_STATUSES.has(incomingPacking)
      ? incomingPacking
      : derivePackingStatus(orderStatus);
    const shipmentStatus = incomingShipment ?? deriveShipmentStatus(orderStatus);

    let query = supabase
      .from("orders")
      .update({
        order_status: orderStatus,
        status: orderStatus,
        fulfillment_status: fulfillmentStatus,
        packing_status: packingStatus,
        shipment_status: shipmentStatus,
        warehouse_status: ["picking", "picked", "packing", "packed", "ready_to_ship"].includes(orderStatus)
          ? orderStatus
          : undefined,
        shipment_booked_at: orderStatus === "shipment_booked" ? new Date().toISOString() : undefined,
        dispatched_at: ["shipped", "collected"].includes(orderStatus) ? new Date().toISOString() : undefined,
        delivered_at: ["delivered", "completed"].includes(orderStatus) ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
        sync_origin: "centralhub",
        sync_updated_at: new Date().toISOString(),
      })
      .select("id, order_number, centralhub_order_id, order_status, fulfillment_status, packing_status, shipment_status")
      .limit(1);

    const { data: updatedRows, error: updateError } = centralHubOrderId
      ? await query.eq("centralhub_order_id", centralHubOrderId)
      : await query.eq("order_number", orderNumber!);

    if (updateError) throw updateError;
    if (!updatedRows || updatedRows.length === 0) {
      await supabase.from("centralhub_webhook_events")
        .update({ process_status: "failed", error_message: "Order not found" })
        .eq("external_event_id", eventId);
      return json({ error: "Order not found", event_id: eventId }, 404);
    }

    await supabase
      .from("centralhub_webhook_events")
      .update({ process_status: "processed", processed_at: new Date().toISOString() })
      .eq("external_event_id", eventId);

    return json({ success: true, order: updatedRows[0] });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[centralhub-status-webhook] ${errorMsg}`);
    return json({ error: errorMsg }, 500);
  }
});
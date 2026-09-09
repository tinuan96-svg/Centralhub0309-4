import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DHL_BASE = Deno.env.get("DHL_ENV") === "uat"
  ? "https://api-uat.dhl.com/parceluk"
  : "https://api.dhl.com/parceluk";
const DHL_CLIENT_ID = Deno.env.get("DHL_CLIENT_ID") || "";
const DHL_CLIENT_SECRET = Deno.env.get("DHL_CLIENT_SECRET") || "";
const DHL_TRACKING_KEY = Deno.env.get("DHL_TRACKING_KEY") || "";
const TRACKING_TEMPLATE_NAME = "delivery_tracking_update_v1";
const CUSTOMER_EVENT_MAX_AGE_MS = 60 * 60 * 1000;

let cachedToken: { token: string; expiresAt: number } | null = null;

const statusMap: Record<string, string> = {
  PU: "collected", PL: "in_transit", IT: "in_transit", WC: "ready_for_collection",
  DF: "out_for_delivery", OK: "delivered", DL: "delivered", RD: "returned",
  CA: "cancelled", AX: "delivery_attempted", RE: "delivery_rescheduled", AD: "at_local_depot",
  LABEL_CREATED: "label_created", COLLECTED: "collected", IN_TRANSIT: "in_transit",
  ARRIVED_AT_DEPOT: "in_transit", ARRIVED_AT_DELIVERY_DEPOT: "at_local_depot",
  OUT_FOR_DELIVERY: "out_for_delivery", DELIVERED: "delivered", FAILED: "failed",
  CANCELLED: "cancelled", RETURNED: "returned", DELIVERY_ATTEMPTED: "delivery_attempted",
  READY_FOR_COLLECTION: "ready_for_collection", DELIVERY_REARRANGED: "delivery_rescheduled",
};

const shipmentToOrderStatus: Record<string, string> = {
  label_created: "shipment_booked", ready_to_ship: "ready_to_ship", collected: "shipped",
  in_transit: "shipped", at_local_depot: "shipped", ready_for_collection: "shipped",
  delivery_attempted: "shipped", delivery_rescheduled: "shipped", out_for_delivery: "out_for_delivery",
  delivered: "delivered", returned: "returned", failed: "failed", cancelled: "cancelled",
};

function mapStatus(value: string | null | undefined) {
  const key = String(value || "").toUpperCase();
  return statusMap[key] || "in_transit";
}

function shouldQueueCustomerTrackingEvent(event: TrackingEvent) {
  const description = String(event.description || "").replace(/\s+/g, " ").trim();
  const text = description.toLowerCase();
  if (!description) return false;

  const eventTime = new Date(event.timestamp).getTime();
  if (!Number.isFinite(eventTime) || Math.abs(Date.now() - eventTime) > CUSTOMER_EVENT_MAX_AGE_MS) return false;

  // Dedicated lifecycle templates already cover these milestones. Keep the
  // carrier-event template for the useful scans between them so customers do
  // not receive two WhatsApp messages for the same milestone.
  if (
    text.includes("shipment created and ready for pickup") ||
    text.includes("external shipment recorded manually") ||
    text.includes("notification for delivery has been sent") ||
    text === "the parcel is in transit" ||
    text.includes("out for delivery") ||
    text.includes("successfully delivered") ||
    text === "the shipment has been collected"
  ) return false;

  const status = String(event.status || "").toLowerCase();
  if (["out_for_delivery", "delivered"].includes(status)) return false;
  return true;
}

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.token;
  if (!DHL_CLIENT_ID || !DHL_CLIENT_SECRET) throw new Error("DHL client credentials are not configured");
  const response = await fetch(`${DHL_BASE}/auth/v1/accesstoken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: DHL_CLIENT_ID, client_secret: DHL_CLIENT_SECRET }).toString(),
  });
  if (!response.ok) throw new Error(`DHL auth failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const data = await response.json();
  const token = data.accessToken || data.access_token;
  if (!token) throw new Error("DHL auth response did not contain a token");
  cachedToken = { token, expiresAt: Date.now() + Number(data.expiresIn || data.expires_in || 3600) * 1000 };
  return token;
}

type TrackingEvent = { status: string; location: string; description: string; timestamp: string };
type TrackingResult = { ok: boolean; status?: string; events?: TrackingEvent[]; estimatedDelivery?: string; actualDelivery?: string; error?: string };

async function trackShipment(trackingNumber: string): Promise<TrackingResult> {
  let data: any = null;
  if (DHL_TRACKING_KEY) {
    try {
      const response = await fetch(`https://api.dhl.com/track/shipments?trackingNumber=${encodeURIComponent(trackingNumber)}`, {
        headers: { "DHL-API-Key": DHL_TRACKING_KEY, Accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });
      if (response.ok) data = await response.json();
    } catch (error) {
      console.warn("[dhl-tracking] unified tracking unavailable", error);
    }
  }

  if (!data) {
    try {
      const token = await getAccessToken();
      const response = await fetch(`${DHL_BASE}/tracking/v1/shipments?trackingNumber=${encodeURIComponent(trackingNumber)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) return { ok: false, error: `DHL tracking failed (${response.status}): ${(await response.text()).slice(0, 300)}` };
      data = await response.json();
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "DHL tracking request failed" };
    }
  }

  const candidates = data?.shipments || data?.trackingDetails || [];
  const shipment = Array.isArray(candidates) ? candidates[0] : candidates;
  if (!shipment) return { ok: false, error: "No tracking information found" };
  const rawEvents = shipment.events || shipment.trackingEvents || [];
  const events: TrackingEvent[] = rawEvents.map((event: any) => ({
    status: String(event.statusCode || event.status || ""),
    location: typeof event.location === "object" && event.location
      ? String(event.location.addressLocality || event.location.name || "")
      : String(event.location || ""),
    description: String(event.description || event.statusDescription || ""),
    timestamp: String(event.timestamp || event.dateTime || new Date().toISOString()),
  }));
  return {
    ok: true,
    status: String(shipment?.status?.statusCode || shipment?.status?.status || shipment?.statusCode || "unknown"),
    events,
    estimatedDelivery: shipment?.estimatedTimeOfDelivery?.estimatedDeliveryDate || shipment?.estimatedDelivery || undefined,
    actualDelivery: shipment?.details?.proofOfDelivery?.timestamp || shipment?.actualDelivery || undefined,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ success: false, error: "method_not_allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Supabase server credentials are missing");
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();

    const { data: shipments, error: fetchError } = await db.from("shipments")
      .select("id,tracking_number,status,carrier,order_id,tracking_retry_count,last_tracked_at")
      .eq("carrier", "dhl")
      .not("tracking_number", "is", null)
      .not("status", "in", '("delivered","cancelled","returned")')
      .lt("tracking_retry_count", 5)
      .or(`last_tracked_at.is.null,last_tracked_at.lt.${fiveMinutesAgo}`)
      .order("updated_at", { ascending: true })
      .limit(30);
    if (fetchError) throw fetchError;

    const results: any[] = [];
    for (const row of shipments || []) {
      const result: any = { id: row.id, tracking_number: row.tracking_number, old_status: row.status, new_status: row.status, changed: false, events_added: 0, whatsapp_events_queued: 0 };
      try {
        const tracking = await trackShipment(row.tracking_number);
        if (!tracking.ok) {
          const retry = Number(row.tracking_retry_count || 0) + 1;
          await db.from("shipments").update({ last_tracked_at: new Date().toISOString(), tracking_retry_count: retry, tracking_error: tracking.error || "tracking_failed", updated_at: new Date().toISOString() }).eq("id", row.id);
          result.error = tracking.error;
          results.push(result);
          continue;
        }

        for (const event of tracking.events || []) {
          const { data: existing } = await db.from("shipment_events").select("id").eq("shipment_id", row.id).eq("event_time", event.timestamp).limit(1).maybeSingle();
          if (!existing) {
            const queueWhatsApp = shouldQueueCustomerTrackingEvent(event);
            const { error } = await db.from("shipment_events").insert({
              shipment_id: row.id,
              status: event.status,
              location: event.location || null,
              description: event.description,
              event_time: event.timestamp,
              whatsapp_status: queueWhatsApp ? "pending" : null,
              whatsapp_template_name: queueWhatsApp ? TRACKING_TEMPLATE_NAME : null,
            });
            if (!error) {
              result.events_added += 1;
              if (queueWhatsApp) result.whatsapp_events_queued += 1;
            }
          }
        }

        const newStatus = mapStatus(tracking.status);
        result.new_status = newStatus;
        result.changed = newStatus !== row.status;
        const now = new Date().toISOString();
        const update: Record<string, unknown> = { last_tracked_at: now, tracking_retry_count: 0, tracking_error: null, updated_at: now };
        if (result.changed) update.status = newStatus;
        if (tracking.estimatedDelivery) update.estimated_delivery = tracking.estimatedDelivery;
        if (tracking.actualDelivery) update.actual_delivery = tracking.actualDelivery;
        const { error: updateError } = await db.from("shipments").update(update).eq("id", row.id);
        if (updateError) throw updateError;

        if (result.changed && row.order_id) {
          const [{ data: order }, { data: updatedShipment }] = await Promise.all([
            db.from("orders").select("order_number,store_id,order_status").eq("id", row.order_id).maybeSingle(),
            db.from("shipments").select("*").eq("id", row.id).maybeSingle(),
          ]);
          if (order && updatedShipment) {
            const events = tracking.events || [];
            const payload = {
              shipment_status: updatedShipment.status,
              order_status: order.order_status || shipmentToOrderStatus[newStatus] || "shipped",
              tracking_number: updatedShipment.tracking_number,
              tracking_url: updatedShipment.tracking_url || `https://www.dhl.com/en-gb/home/tracking.html?tracking-id=${updatedShipment.tracking_number}`,
              shipment_label_url: updatedShipment.label_url,
              shipment_booked_at: updatedShipment.booked_at || updatedShipment.created_at,
              courier_name: "DHL eCommerce UK",
              carrier: updatedShipment.carrier,
              service_type: updatedShipment.service_type,
              shipment_number: updatedShipment.shipment_number,
              label_printed: updatedShipment.label_printed,
              estimated_delivery: updatedShipment.estimated_delivery,
              actual_delivery: updatedShipment.actual_delivery,
              last_tracking_status: updatedShipment.status,
              events: events.map((event) => ({ status: event.status, location: event.location || null, description: event.description, event_time: event.timestamp })),
              sync_updated_at: now,
            };
            const { error: queueError } = await db.from("shipment_sync_queue").insert({ event_type: "STATUS_UPDATE", store_id: order.store_id, order_number: order.order_number, shipment_id: row.id, payload, status: "pending" });
            if (queueError) console.error("[dhl-tracking] queue failed", queueError);
            else {
              try { await db.functions.invoke("shipment-sync-worker", { body: { action: "process" } }); }
              catch (error) { console.error("[dhl-tracking] shipment worker invoke failed", error); }
            }
          }
        }
      } catch (error) {
        const retry = Number(row.tracking_retry_count || 0) + 1;
        const message = error instanceof Error ? error.message : "tracking_processing_failed";
        await db.from("shipments").update({ last_tracked_at: new Date().toISOString(), tracking_retry_count: retry, tracking_error: message, updated_at: new Date().toISOString() }).eq("id", row.id);
        result.error = message;
      }
      results.push(result);
    }

    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      status_changes: results.filter((r) => r.changed).length,
      total_events_added: results.reduce((sum, r) => sum + Number(r.events_added || 0), 0),
      total_whatsapp_events_queued: results.reduce((sum, r) => sum + Number(r.whatsapp_events_queued || 0), 0),
      details: results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "tracking_worker_failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

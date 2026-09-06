import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DHL_BASE =
  Deno.env.get("DHL_ENV") === "uat"
    ? "https://api-uat.dhl.com/parceluk"
    : "https://api.dhl.com/parceluk";

const DHL_CLIENT_ID = Deno.env.get("DHL_CLIENT_ID") || "";
const DHL_CLIENT_SECRET = Deno.env.get("DHL_CLIENT_SECRET") || "";
const DHL_TRACKING_KEY = Deno.env.get("DHL_TRACKING_KEY") || "";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }
  const response = await fetch(`${DHL_BASE}/auth/v1/accesstoken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: DHL_CLIENT_ID,
      client_secret: DHL_CLIENT_SECRET,
    }).toString(),
  });
  if (!response.ok) {
    const t = await response.text();
    throw new Error(`DHL auth failed (${response.status}): ${t.substring(0, 400)}`);
  }
  const data = await response.json();
  const token = data.accessToken || data.access_token;
  if (!token) throw new Error("DHL auth: no token in response");
  cachedToken = {
    token,
    expiresAt: Date.now() + (data.expiresIn || data.expires_in || 3600) * 1000,
  };
  return token;
}

const statusMap: Record<string, string> = {
  PU: "collected",
  PL: "in_transit",
  IT: "in_transit",
  WC: "ready_for_collection",
  DF: "out_for_delivery",
  OK: "delivered",
  DL: "delivered",
  RD: "returned",
  CA: "cancelled",
  AX: "delivery_attempted",
  RE: "delivery_rescheduled",
  AD: "at_local_depot",
  LABEL_CREATED: "label_created",
  COLLECTED: "collected",
  IN_TRANSIT: "in_transit",
  ARRIVED_AT_DEPOT: "in_transit",
  ARRIVED_AT_DELIVERY_DEPOT: "at_local_depot",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  FAILED: "failed",
  CANCELLED: "cancelled",
  RETURNED: "returned",
  DELIVERY_ATTEMPTED: "delivery_attempted",
  READY_FOR_COLLECTION: "ready_for_collection",
  DELIVERY_REARRANGED: "delivery_rescheduled",
};

function mapStatus(carrierStatus: string): string {
  const s = carrierStatus.toUpperCase();
  return statusMap[s] || "in_transit";
}

// Maps shipment-level statuses to valid orders table order_status values.
// The orders table CHECK constraint only accepts:
//   pending, pending_payment, confirmed, picking, packing, packed,
//   ready_to_ship, shipment_booked, shipped, out_for_delivery,
//   delivered, completed, cancelled, refunded
// Shipment statuses like in_transit, at_local_depot, collected, etc.
// are valid on the shipments table but NOT on the orders table.
const shipmentToOrderStatusMap: Record<string, string> = {
  label_created: "shipment_booked",
  collected: "shipped",
  in_transit: "shipped",
  at_local_depot: "shipped",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  ready_for_collection: "shipped",
  delivery_attempted: "shipped",
  delivery_rescheduled: "shipped",
  failed: "cancelled",
  returned: "cancelled",
  cancelled: "cancelled",
  not_shipped: "pending",
  ready_to_ship: "ready_to_ship",
};

function shipmentToOrderStatus(shipmentStatus: string): string {
  return shipmentToOrderStatusMap[shipmentStatus] || "shipped";
}

interface TrackingEvent {
  status: string;
  location: string;
  description: string;
  timestamp: string;
}

async function trackShipment(trackingNumber: string): Promise<{
  success: boolean;
  status?: string;
  events?: TrackingEvent[];
  estimatedDelivery?: string;
  actualDelivery?: string;
  error?: string;
}> {
  let data: any;

  // 1. Try Unified Tracking API first if key is available
  if (DHL_TRACKING_KEY) {
    try {
      const resp = await fetch(
        `https://api.dhl.com/track/shipments?trackingNumber=${encodeURIComponent(trackingNumber)}`,
        { headers: { "DHL-API-Key": DHL_TRACKING_KEY, Accept: "application/json" } }
      );
      if (resp.ok) data = await resp.json();
    } catch (e) {
      console.error("Unified Tracking failed, falling back:", e);
    }
  }

  // 2. Fallback to Parcel UK tracking
  if (!data) {
    try {
      const token = await getAccessToken();
      const response = await fetch(
        `${DHL_BASE}/tracking/v1/shipments?trackingNumber=${encodeURIComponent(trackingNumber)}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
      );
      if (!response.ok) {
        const t = await response.text();
        let msg = `Tracking failed (${response.status})`;
        try {
          const j = JSON.parse(t);
          msg = j.detail || j.title || msg;
        } catch {
          msg += `: ${t.substring(0, 200)}`;
        }
        return { success: false, error: msg };
      }
      data = await response.json();
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Tracking auth failed",
      };
    }
  }

  const shipments = data.shipments || data.trackingDetails || [];
  if (Array.isArray(shipments) && shipments.length === 0) {
    return { success: false, error: "No tracking information found" };
  }
  const shipment = Array.isArray(shipments) ? shipments[0] : shipments;
  const rawEvents = shipment.events || shipment.trackingEvents || [];
  const events: TrackingEvent[] = rawEvents.map((e: Record<string, unknown>) => ({
    status: (e.statusCode as string) || (e.status as string) || "",
    location:
      typeof e.location === "object" && e.location
        ? ((e.location as Record<string, unknown>).addressLocality as string) || ""
        : (e.location as string) || "",
    description: (e.description as string) || (e.statusDescription as string) || "",
    timestamp: (e.timestamp as string) || new Date().toISOString(),
  }));

  return {
    success: true,
    status:
      shipment.status?.statusCode || shipment.status?.status || "unknown",
    events,
    estimatedDelivery:
      shipment.estimatedTimeOfDelivery?.estimatedDeliveryDate || undefined,
    actualDelivery: shipment.details?.proofOfDelivery?.timestamp || undefined,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch active shipments that need tracking
    // Skip shipments checked within the last 5 minutes to avoid overlap
    // Skip shipments with 5+ consecutive failures
    // Only track DHL shipments with tracking numbers
    // Limit to 30 per run to stay within edge function time limits
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data: shipments, error: fetchError } = await supabase
      .from("shipments")
      .select(
        "id, tracking_number, status, carrier, order_id, tracking_retry_count, last_tracked_at"
      )
      .eq("carrier", "dhl")
      .not("tracking_number", "is", null)
      .not("status", "in", '("delivered","cancelled","returned")')
      .lt("tracking_retry_count", 5)
      .or(`last_tracked_at.is.null,last_tracked_at.lt.${fiveMinAgo}`)
      .order("updated_at", { ascending: true })
      .limit(30);

    if (fetchError) {
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!shipments || shipments.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No shipments need tracking" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{
      id: string;
      trackingNumber: string;
      oldStatus: string;
      newStatus: string;
      statusChanged: boolean;
      eventsAdded: number;
      error?: string;
    }> = [];

    for (const shipment of shipments) {
      const result = {
        id: shipment.id,
        trackingNumber: shipment.tracking_number,
        oldStatus: shipment.status,
        newStatus: shipment.status,
        statusChanged: false,
        eventsAdded: 0,
      };

      try {
        const tracking = await trackShipment(shipment.tracking_number);

        if (!tracking.success || !tracking.events) {
          // Tracking failed - increment retry count and record error
          const newRetryCount = (shipment.tracking_retry_count || 0) + 1;
          await supabase
            .from("shipments")
            .update({
              last_tracked_at: new Date().toISOString(),
              tracking_retry_count: newRetryCount,
              tracking_error: tracking.error || "Unknown tracking error",
              updated_at: new Date().toISOString(),
            })
            .eq("id", shipment.id);

          result.error = tracking.error;
          results.push(result);
          continue;
        }

        // Insert new events that don't already exist
        let eventsAdded = 0;
        for (const event of tracking.events) {
          const { data: existingEvent } = await supabase
            .from("shipment_events")
            .select("id")
            .eq("shipment_id", shipment.id)
            .eq("event_time", event.timestamp)
            .maybeSingle();

          if (!existingEvent) {
            await supabase.from("shipment_events").insert({
              shipment_id: shipment.id,
              status: event.status,
              location: event.location || null,
              description: event.description,
              event_time: event.timestamp,
            });
            eventsAdded++;
          }
        }
        result.eventsAdded = eventsAdded;

        // Map and update status
        const newStatus = mapStatus(tracking.status || "unknown");
        result.newStatus = newStatus;

        const updatePayload: Record<string, unknown> = {
          last_tracked_at: new Date().toISOString(),
          tracking_retry_count: 0,
          tracking_error: null,
          updated_at: new Date().toISOString(),
        };

        if (tracking.estimatedDelivery) {
          updatePayload.estimated_delivery = tracking.estimatedDelivery;
        }
        if (tracking.actualDelivery) {
          updatePayload.actual_delivery = tracking.actualDelivery;
        }

        if (newStatus !== shipment.status) {
          updatePayload.status = newStatus;
          result.statusChanged = true;
        }

        await supabase
          .from("shipments")
          .update(updatePayload)
          .eq("id", shipment.id);

        // If status changed and there's a linked order, sync to store
        if (result.statusChanged && shipment.order_id) {
          // Convert shipment status to a valid order status
          // The orders table has a different set of allowed values than the shipments table
          const orderStatus = shipmentToOrderStatus(newStatus);

          // Update local order status using the mapped order status
          await supabase
            .from("orders")
            .update({
              order_status: orderStatus,
              updated_at: new Date().toISOString(),
            })
            .eq("id", shipment.order_id);

          // Record in order history using the mapped order status
          await supabase.from("order_status_history").insert([
            {
              order_id: shipment.order_id,
              new_status: orderStatus,
              notes: `Shipment status auto-updated via DHL tracking poller: ${newStatus.replace(/_/g, " ")}`,
              inventory_action: "none",
            },
          ]);

          // Get order info for sync
          const { data: orderData } = await supabase
            .from("orders")
            .select("order_number, store_id")
            .eq("id", shipment.order_id)
            .single();

          if (orderData) {
            // Push order status to remote store via edge function
            // Use the mapped order status so the remote store receives a valid value
            try {
              await supabase.functions.invoke("update-order-status", {
                body: {
                  orderId: shipment.order_id,
                  status: orderStatus,
                  notes: `DHL tracking: ${newStatus.replace(/_/g, " ")}`,
                },
              });
            } catch (err) {
              console.error(
                `[tracking-poller] Failed to push status for ${orderData.order_number}:`,
                err
              );
            }

            // Queue shipment sync to remote store
            const { data: updatedShipment } = await supabase
              .from("shipments")
              .select("*")
              .eq("id", shipment.id)
              .single();

            if (updatedShipment) {
              // Include the new tracking events in the sync payload so the
n              // shipment-sync-worker can push them to the remote store's
              // shipment_events table for the customer-facing timeline
              const newEvents = tracking.events || [];

              const syncPayload = {
                shipment_status: updatedShipment.status,
                order_status: orderStatus,
                tracking_number: updatedShipment.tracking_number,
                tracking_url:
                  updatedShipment.tracking_url ||
                  `https://www.dhl.com/en-gb/home/tracking.html?tracking-id=${updatedShipment.tracking_number}`,
                shipment_label_url: updatedShipment.label_url,
                shipment_booked_at:
                  updatedShipment.booked_at || updatedShipment.created_at,
                courier_name: "DHL eCommerce UK",
                carrier: updatedShipment.carrier,
                service_type: updatedShipment.service_type,
                shipment_number: updatedShipment.shipment_number,
                label_printed: updatedShipment.label_printed,
                estimated_delivery: updatedShipment.estimated_delivery,
                actual_delivery: updatedShipment.actual_delivery,
                last_tracking_status: updatedShipment.status,
                events: newEvents.map((ev) => ({
                  status: ev.status,
                  location: ev.location || null,
                  description: ev.description,
                  event_time: ev.timestamp,
                })),
                sync_updated_at: new Date().toISOString(),
              };

              await supabase.from("shipment_sync_queue").insert({
                event_type: "STATUS_UPDATE",
                store_id: orderData.store_id,
                order_number: orderData.order_number,
                shipment_id: shipment.id,
                payload: syncPayload,
                status: "pending",
              });

              // Trigger the shipment-sync-worker immediately so the
              // status and events reach the remote store without waiting
              // for the next worker poll cycle
              try {
                await supabase.functions.invoke("shipment-sync-worker", {
                  body: { action: "process" },
                });
              } catch (err) {
                console.error(
                  `[tracking-poller] Failed to trigger shipment-sync-worker:`,
                  err
                );
              }
            }
          }
        }
      } catch (err: any) {
        // Individual shipment error - don't crash the whole poller
        const newRetryCount = (shipment.tracking_retry_count || 0) + 1;
        await supabase
          .from("shipments")
          .update({
            last_tracked_at: new Date().toISOString(),
            tracking_retry_count: newRetryCount,
            tracking_error: err.message || "Unknown error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", shipment.id);

        result.error = err.message;
      }

      results.push(result);
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        statusChanges: results.filter((r) => r.statusChanged).length,
        totalEventsAdded: results.reduce((sum, r) => sum + r.eventsAdded, 0),
        details: results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("DHL tracking poller error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

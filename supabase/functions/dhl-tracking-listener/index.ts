/**
 * dhl-tracking-listener
 *
 * Receives DHL tracking webhook events (or poll results) and sends a
 * customer notification only when the status changes.
 *
 * Request body:
 * {
 *   tracking_number: string
 *   order_id:        string
 *   status:          string   – DHL status code e.g. "PICKED_UP"
 *   customer_phone:  string
 * }
 *
 * Response:
 * { success: boolean, notified: boolean, channel?: string, reason?: string }
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STATUS_MESSAGES: Record<string, string> = {
  PICKED_UP:           "Your order has been picked up and is on the way!",
  IN_TRANSIT:          "Your parcel is moving through our network.",
  OUT_FOR_DELIVERY:    "Out for delivery today — keep an eye out!",
  DELIVERED:           "Delivered! We hope you enjoy your order.",
  DELIVERY_ATTEMPTED:  "Delivery was attempted. A re-delivery will be arranged.",
  EXCEPTION:           "There's a delay with your delivery. We're on it.",
  RETURNED:            "Your parcel is being returned. Our team will be in touch.",
};

const TRACKING_BASE = "https://www.dhl.com/gb-en/home/tracking/tracking-parcel.html?submit=1&tracking-id=";

function buildMessage(orderId: string, trackingNumber: string, status: string): string {
  const statusLine = STATUS_MESSAGES[status] ?? `Status updated: ${status}`;
  const trackingUrl = `${TRACKING_BASE}${encodeURIComponent(trackingNumber)}`;

  return (
    `Kerala Grocery UK — Order Update\n\n` +
    `Order: #${orderId}\n` +
    `${statusLine}\n\n` +
    `Track your parcel:\n${trackingUrl}`
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { tracking_number, order_id, status, customer_phone } = await req.json() as {
      tracking_number: string;
      order_id: string;
      status: string;
      customer_phone: string;
    };

    if (!tracking_number || !order_id || !status || !customer_phone) {
      return new Response(
        JSON.stringify({ success: false, error: "tracking_number, order_id, status, and customer_phone are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Deduplication: only notify on status change ───────────────────────────
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, last_tracking_status")
      .eq("order_number", order_id)
      .maybeSingle();

    if (orderErr) {
      console.error("[dhl-tracking-listener] order lookup error:", orderErr);
    }

    if (order && order.last_tracking_status === status) {
      return new Response(
        JSON.stringify({ success: true, notified: false, reason: "status_unchanged" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Persist tracking number + new status ─────────────────────────────────
    if (order) {
      await supabase
        .from("orders")
        .update({ tracking_number, last_tracking_status: status })
        .eq("id", order.id);
    }

    // ── Send notification ─────────────────────────────────────────────────────
    const message     = buildMessage(order_id, tracking_number, status);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const res = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ phone: customer_phone, message, order_id }),
    });

    const result = await res.json();

    return new Response(
      JSON.stringify({ success: result.success, notified: true, channel: result.channel, error: result.error }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[dhl-tracking-listener] error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

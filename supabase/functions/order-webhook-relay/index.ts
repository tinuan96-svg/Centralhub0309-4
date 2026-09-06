import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ORDER_WEBHOOK_URL = "https://ixzbnifmsxunlarhfimp.supabase.co/functions/v1/centralhub-order-sync";
const MAX_RETRIES = 3;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const secret = Deno.env.get("CENTRALHUB_WEBHOOK_SECRET") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const payload = await req.json();
    const body = JSON.stringify(payload);
    const orderId = payload?.record?.id ?? "unknown";
    const orderNumber = payload?.record?.order_number ?? "";

    let lastError = "";

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 1) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt - 2) * 1000));
      }

      try {
        const res = await fetch(ORDER_WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webhook-secret": secret,
          },
          body,
        });

        const resBody = await res.text();

        try {
          await supabase.from("webhook_logs").insert({
            event_type: "ORDER_UPDATE",
            product_id: orderId,
            product_name: orderNumber,
            attempt,
            status_code: res.status,
            response_body: resBody.slice(0, 2000),
            success: res.ok,
            status: res.ok ? "delivered" : "failed",
            response: JSON.stringify({ http_status: res.status }),
          });
        } catch { /* best-effort */ }

        if (res.ok) {
          return new Response(
            JSON.stringify({ ok: true, status: res.status, attempt }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        lastError = `HTTP ${res.status}: ${resBody.slice(0, 200)}`;
      } catch (err) {
        lastError = (err as Error).message;
        try {
          await supabase.from("webhook_logs").insert({
            event_type: "ORDER_UPDATE",
            product_id: orderId,
            product_name: orderNumber,
            attempt,
            status_code: 0,
            response_body: lastError.slice(0, 2000),
            success: false,
            status: "failed",
          });
        } catch { /* best-effort */ }
      }
    }

    return new Response(
      JSON.stringify({ ok: false, error: lastError }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

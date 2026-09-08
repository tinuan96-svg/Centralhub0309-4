import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-webhook-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

function authToken(req: Request) {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

function parseRawBody(value: unknown) {
  if (value && typeof value === "object") return value;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return { raw: value.slice(0, 10000) }; }
  }
  return {};
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const allowed = [
    serviceKey,
    Deno.env.get("CENTRALHUB_PUSH_API_SECRET") || "",
    Deno.env.get("CENTRALHUB_WEBHOOK_SECRET") || "",
  ].filter(Boolean);
  const token = authToken(req) || (req.headers.get("x-webhook-secret") || "").trim();
  if (!url || !serviceKey || !token || !allowed.includes(token)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const eventId = String(body?.event_id || "").trim();
    const paymentId = String(body?.mollie_payment_id || "").trim();
    const storeSlug = String(body?.store_slug || "").trim().toLowerCase();
    if (!eventId || !/^[A-Za-z0-9_-]{8,128}$/.test(eventId)) return json({ ok: false, error: "invalid_event_id" }, 400);
    if (!paymentId || !/^tr_[A-Za-z0-9]+$/.test(paymentId)) return json({ ok: false, error: "invalid_payment_id" }, 400);
    if (storeSlug !== "malluspices") return json({ ok: false, error: "unsupported_store" }, 400);

    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const receivedAt = body?.received_at && !Number.isNaN(Date.parse(String(body.received_at)))
      ? new Date(String(body.received_at)).toISOString()
      : new Date().toISOString();
    const { error } = await db.from("mollie_webhook_events").upsert({
      id: eventId,
      store_slug: storeSlug,
      mollie_payment_id: paymentId,
      payment_status: body?.payment_status ? String(body.payment_status) : null,
      processed: body?.processed === true,
      raw_body: parseRawBody(body?.raw_body),
      error_message: body?.error_message ? String(body.error_message).slice(0, 1000) : null,
      source: "malluspices:mollie-webhook",
      received_at: receivedAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) throw error;
    return json({ ok: true, event_id: eventId }, 200);
  } catch (error) {
    console.error("[mollie-audit-ingest]", error instanceof Error ? error.message : "unknown error");
    return json({ ok: false, error: "audit_write_failed" }, 500);
  }
});

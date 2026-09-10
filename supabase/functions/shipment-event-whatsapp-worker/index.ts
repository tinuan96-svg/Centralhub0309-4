import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-whatsapp-retry-secret",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const FALLBACK_TEMPLATE_NAME = "delivery_tracking_update_v2";
const TEMPLATE_LANGUAGE = "en_GB";
const MAX_RETRIES = 3;
const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

async function authorize(req: Request, db: any, serviceRoleKey: string) {
  const cronSecret = String(req.headers.get("x-whatsapp-retry-secret") || "").trim();
  if (cronSecret) {
    const { data, error } = await db.rpc("verify_integration_cron_secret", {
      p_name: "whatsapp_retry_cron_secret",
      p_secret: cronSecret,
    });
    if (!error && data === true) return { ok: true, mode: "cron" };
  }

  const auth = String(req.headers.get("authorization") || "");
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, mode: "none" };
  if (token === serviceRoleKey) return { ok: true, mode: "service_role" };

  const { data: userData, error: userError } = await db.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return { ok: false, mode: "invalid_user" };

  const { data: profile } = await db.from("user_profiles")
    .select("profile_role,is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.profile_role === "admin" && profile?.is_active !== false) return { ok: true, mode: "admin" };
  return { ok: false, mode: "forbidden" };
}

function cleanText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function friendlyTrackingUpdate(description: unknown, status: unknown): string | null {
  const raw = cleanText(description);
  const text = raw.toLowerCase();
  const statusText = cleanText(status).toLowerCase();
  if (!raw) return null;

  // These are covered by dedicated order-stage WhatsApp templates.
  if (
    text.includes("shipment created and ready for pickup") ||
    text.includes("external shipment recorded manually") ||
    text.includes("notification for delivery has been sent") ||
    text === "the parcel is in transit" ||
    text.includes("out for delivery") ||
    text.includes("successfully delivered") ||
    text === "the shipment has been collected" ||
    statusText === "out_for_delivery" ||
    statusText === "delivered"
  ) return null;

  if (text.includes("collection depot")) return "Parcel at the collection depot";
  if (text.includes("processed at depot")) return "Parcel processed at the depot";
  if (text.includes("on its way to delivery depot")) return "Parcel on its way to the delivery depot";
  if (text.includes("at the delivery depot")) return "Parcel at the delivery depot";
  if (text.includes("loaded to delivery vehicle") || text.includes("loaded to the van")) return "Parcel loaded onto the delivery vehicle";
  if (text.includes("arrived at depot")) return "Parcel arrived at a DHL depot";
  if (text.includes("possibly delayed") || text.includes("delay")) return "Delivery may be delayed";
  if (text.includes("delivery attempted") || text.includes("attempted delivery")) return "Delivery attempt made";
  if (text.includes("rescheduled") || text.includes("rearranged")) return "Delivery has been rescheduled";
  if (text.includes("ready for collection")) return "Parcel ready for collection";

  return raw.slice(0, 180);
}

function formatUkTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(",", "");
}

function normalizePhone(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function versionOf(name: unknown) {
  const match = String(name || "").match(/_v(\d+)$/i);
  return match ? Number(match[1]) : 0;
}

async function ensureConversation(db: any, storeId: string, phone: string, displayName: string) {
  const digits = normalizePhone(phone);
  const variants = Array.from(new Set([String(phone || "").trim(), digits, digits ? `+${digits}` : ""].filter(Boolean)));

  let contact: any = null;
  if (variants.length) {
    const { data } = await db.from("whatsapp_contacts")
      .select("id,display_name,phone_number")
      .eq("store_id", storeId)
      .in("phone_number", variants)
      .limit(1)
      .maybeSingle();
    contact = data;
  }

  if (!contact) {
    const canonicalPhone = digits || String(phone || "").trim();
    const { data, error } = await db.from("whatsapp_contacts").upsert({
      store_id: storeId,
      phone_number: canonicalPhone,
      display_name: displayName || canonicalPhone,
      last_message_at: new Date().toISOString(),
    }, { onConflict: "store_id,phone_number" }).select("id,display_name,phone_number").single();
    if (error) throw error;
    contact = data;
  }

  let conversation: any = null;
  const { data: existing } = await db.from("whatsapp_conversations")
    .select("id,store_id,contact_id")
    .eq("contact_id", contact.id)
    .maybeSingle();
  conversation = existing;

  if (!conversation) {
    const { data, error } = await db.from("whatsapp_conversations").upsert({
      store_id: storeId,
      contact_id: contact.id,
      status: "open",
      handling_mode: "AI",
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "contact_id" }).select("id,store_id,contact_id").single();
    if (error) throw error;
    conversation = data;
  }

  return conversation;
}

async function hasRecentDuplicate(db: any, event: any, friendlyUpdate: string) {
  const eventTime = new Date(event.event_time).getTime();
  if (!Number.isFinite(eventTime)) return false;
  const start = new Date(eventTime - DUPLICATE_WINDOW_MS).toISOString();
  const end = new Date(eventTime + DUPLICATE_WINDOW_MS).toISOString();

  const { data } = await db.from("shipment_events")
    .select("id,description,status,whatsapp_status,event_time")
    .eq("shipment_id", event.shipment_id)
    .neq("id", event.id)
    .gte("event_time", start)
    .lte("event_time", end)
    .in("whatsapp_status", ["sent", "delivered", "read"])
    .order("event_time", { ascending: false })
    .limit(10);

  return (data || []).some((row: any) => friendlyTrackingUpdate(row.description, row.status) === friendlyUpdate);
}

async function resolveTrackingTemplate(db: any, storeId: string, requestedName: string | null) {
  const { data: mapping } = await db.from("whatsapp_event_template_mappings")
    .select("template:whatsapp_template_registry(meta_template_name,language,status,variables)")
    .eq("store_id", storeId)
    .eq("event_key", "shipment.tracking_update")
    .eq("enabled", true)
    .maybeSingle();

  const mapped = mapping?.template || null;
  if (mapped && ["approved", "active"].includes(String(mapped.status || "").toLowerCase())) return mapped;

  const name = requestedName || FALLBACK_TEMPLATE_NAME;
  const { data } = await db.from("whatsapp_template_registry")
    .select("meta_template_name,language,status,variables")
    .eq("store_id", storeId)
    .eq("meta_template_name", name)
    .eq("language", TEMPLATE_LANGUAGE)
    .maybeSingle();
  return data || null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (!["GET", "POST"].includes(req.method)) return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Supabase service configuration missing" }, 500);

    const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const access = await authorize(req, db, serviceRoleKey);
    if (!access.ok) return json({ error: "Unauthorized" }, 401);

    const { data: events, error: eventsError } = await db.from("shipment_events")
      .select("id,shipment_id,status,location,description,event_time,whatsapp_status,whatsapp_template_name,whatsapp_retry_count")
      .eq("whatsapp_status", "pending")
      .order("event_time", { ascending: true })
      .limit(25);
    if (eventsError) return json({ error: eventsError.message }, 500);

    let processed = 0;
    let sent = 0;
    let skipped = 0;
    let deferred = 0;
    let failed = 0;

    for (const event of events || []) {
      processed++;
      const eventAge = Date.now() - new Date(event.event_time).getTime();
      if (Number.isFinite(eventAge) && eventAge > STALE_AFTER_MS) {
        await db.from("shipment_events").update({ whatsapp_status: "skipped", whatsapp_error: "stale_tracking_event" }).eq("id", event.id);
        skipped++;
        continue;
      }

      const friendlyUpdate = friendlyTrackingUpdate(event.description, event.status);
      if (!friendlyUpdate) {
        await db.from("shipment_events").update({ whatsapp_status: "skipped", whatsapp_error: "covered_by_order_stage_or_not_customer_visible" }).eq("id", event.id);
        skipped++;
        continue;
      }

      if (await hasRecentDuplicate(db, event, friendlyUpdate)) {
        await db.from("shipment_events").update({ whatsapp_status: "skipped", whatsapp_error: "duplicate_tracking_update_within_15_minutes" }).eq("id", event.id);
        skipped++;
        continue;
      }

      const { data: shipment, error: shipmentError } = await db.from("shipments")
        .select("id,order_id,tracking_number,tracking_url,carrier,recipient_phone,status")
        .eq("id", event.shipment_id)
        .maybeSingle();
      if (shipmentError || !shipment?.order_id) {
        await db.from("shipment_events").update({ whatsapp_status: "failed", whatsapp_error: shipmentError?.message || "shipment_or_order_link_missing" }).eq("id", event.id);
        failed++;
        continue;
      }

      const { data: order, error: orderError } = await db.from("orders")
        .select("id,store_id,order_number,customer_name,customer_phone,order_status,payment_status")
        .eq("id", shipment.order_id)
        .maybeSingle();
      if (orderError || !order?.store_id) {
        await db.from("shipment_events").update({ whatsapp_status: "failed", whatsapp_error: orderError?.message || "order_missing" }).eq("id", event.id);
        failed++;
        continue;
      }

      if (String(order.payment_status || "").toLowerCase() !== "paid") {
        await db.from("shipment_events").update({ whatsapp_status: "skipped", whatsapp_error: "payment_not_received" }).eq("id", event.id);
        skipped++;
        continue;
      }

      if (["cancelled", "returned", "refunded"].includes(String(order.order_status || "").toLowerCase())) {
        await db.from("shipment_events").update({ whatsapp_status: "skipped", whatsapp_error: "order_not_active" }).eq("id", event.id);
        skipped++;
        continue;
      }

      const phone = String(order.customer_phone || shipment.recipient_phone || "").trim();
      if (!phone) {
        await db.from("shipment_events").update({ whatsapp_status: "failed", whatsapp_error: "customer_phone_missing" }).eq("id", event.id);
        failed++;
        continue;
      }

      const template = await resolveTrackingTemplate(db, order.store_id, event.whatsapp_template_name || null);
      if (!template) {
        await db.from("shipment_events").update({ whatsapp_error: "tracking_template_missing" }).eq("id", event.id);
        deferred++;
        continue;
      }

      const templateStatus = String(template.status || "").toLowerCase();
      if (!["approved", "active"].includes(templateStatus)) {
        await db.from("shipment_events").update({ whatsapp_error: `tracking_template_awaiting_meta_approval:${templateStatus || "unknown"}` }).eq("id", event.id);
        deferred++;
        continue;
      }

      const location = cleanText(event.location) || "DHL network";
      const trackingTime = formatUkTime(event.event_time);
      const trackingUrl = String(shipment.tracking_url || "").trim() ||
        (shipment.tracking_number ? `https://www.dhl.com/en-gb/home/tracking.html?tracking-id=${encodeURIComponent(shipment.tracking_number)}` : "https://malluspices.com");
      const varMap: Record<string, string> = {
        order_number: order.order_number || "Order",
        tracking_update: friendlyUpdate,
        tracking_location: location,
        tracking_time: trackingTime,
        tracking_url: trackingUrl,
      };
      const templateVars = Array.isArray(template.variables) ? template.variables : [];
      const bodyParameters = templateVars.map((variable: string) => ({ type: "text", text: String(varMap[variable] ?? `[${variable}]`) }));
      const components: any[] = [{ type: "body", parameters: bodyParameters }];

      if (String(template.meta_template_name) === "delivery_tracking_update_v3" || versionOf(template.meta_template_name) >= 3) {
        components.push({
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: String(order.order_number || "Order") }],
        });
      }

      const sendPayload = {
        to: phone,
        type: "template",
        template: {
          name: template.meta_template_name,
          language: template.language || TEMPLATE_LANGUAGE,
          components,
        },
        storeId: order.store_id,
      };

      let response: Response;
      let result: any = {};
      try {
        response = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(sendPayload),
        });
        const raw = await response.text();
        try { result = raw ? JSON.parse(raw) : {}; } catch { result = { error: raw }; }
      } catch (error: any) {
        const retryCount = Number(event.whatsapp_retry_count || 0) + 1;
        await db.from("shipment_events").update({
          whatsapp_status: retryCount >= MAX_RETRIES ? "failed" : "pending",
          whatsapp_retry_count: retryCount,
          whatsapp_error: error?.message || "whatsapp_send_network_error",
        }).eq("id", event.id);
        failed++;
        continue;
      }

      const success = response!.ok && (result?.success === true || result?.message_id);
      if (!success) {
        const metaCode = String(result?.meta_code || "");
        const reason = String(result?.error || `whatsapp-send ${response!.status}`);
        if (metaCode === "132001" || /template.*not.*ready|does not exist in the translation/i.test(reason)) {
          await db.from("shipment_events").update({ whatsapp_status: "pending", whatsapp_error: reason }).eq("id", event.id);
          deferred++;
          continue;
        }
        const retryCount = Number(event.whatsapp_retry_count || 0) + 1;
        await db.from("shipment_events").update({
          whatsapp_status: retryCount >= MAX_RETRIES ? "failed" : "pending",
          whatsapp_retry_count: retryCount,
          whatsapp_error: reason,
        }).eq("id", event.id);
        failed++;
        continue;
      }

      const messageId = String(result.message_id || "").trim();
      const portalUrl = `https://malluspices.com/track-order?order=${encodeURIComponent(order.order_number || "")}`;
      const renderedText = `*DELIVERY TRACKING UPDATE*\n\nOrder: ${order.order_number || "Order"}\nUpdate: ${friendlyUpdate}\nLocation: ${location}\nTime: ${trackingTime}\nTrack: ${portalUrl}\n\nThis is the latest update from our delivery partner.`;

      try {
        const conversation = await ensureConversation(db, order.store_id, phone, order.customer_name || "Customer");
        if (conversation?.id && messageId) {
          await db.from("whatsapp_messages").upsert({
            conversation_id: conversation.id,
            wa_message_id: messageId,
            direction: "outbound",
            message_type: "template",
            message_text: renderedText,
            status: "sent",
            ai_generated: false,
            channel_type: "whatsapp",
          }, { onConflict: "wa_message_id" });
          await db.from("whatsapp_conversations").update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", conversation.id);
        }
      } catch (chatError: any) {
        console.error("[shipment-event-whatsapp] chat log failed", chatError?.message || chatError);
      }

      let finalStatus = "sent";
      let deliveredAt: string | null = null;
      let readAt: string | null = null;
      if (messageId) {
        const { data: log } = await db.from("whatsapp_outbound_log")
          .select("status,delivered_at,read_at,error_message")
          .eq("wa_message_id", messageId)
          .maybeSingle();
        if (log?.status === "read" || log?.read_at) finalStatus = "read";
        else if (log?.status === "delivered" || log?.delivered_at) finalStatus = "delivered";
        deliveredAt = log?.delivered_at || null;
        readAt = log?.read_at || null;
      }

      await db.from("shipment_events").update({
        whatsapp_status: finalStatus,
        whatsapp_template_name: template.meta_template_name,
        whatsapp_message_id: messageId || null,
        whatsapp_error: null,
        whatsapp_sent_at: new Date().toISOString(),
        whatsapp_delivered_at: deliveredAt,
        whatsapp_read_at: readAt,
      }).eq("id", event.id);
      sent++;
    }

    return json({ processed, sent, skipped, deferred, failed, auth_mode: access.mode });
  } catch (error: any) {
    console.error("[shipment-event-whatsapp] fatal", error?.message || error);
    return json({ error: error?.message || String(error) }, 500);
  }
});

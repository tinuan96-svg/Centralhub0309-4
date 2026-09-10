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

const terminalNotificationStatuses = new Set(["sent", "delivered", "read", "superseded"]);
const approvedTemplateStatuses = new Set(["active", "approved"]);

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

  const { data: profile } = await db
    .from("user_profiles")
    .select("profile_role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.profile_role === "admin" && profile?.is_active !== false) {
    return { ok: true, mode: "admin" };
  }
  return { ok: false, mode: "forbidden" };
}

async function deferForTemplate(db: any, retry: any, notification: any, reason: string) {
  const nextRetryAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await db.from("whatsapp_notification_queue").update({
    status: "pending",
    last_error: reason,
    next_retry_at: nextRetryAt,
    updated_at: new Date().toISOString(),
  }).eq("id", retry.id);

  await db.from("order_whatsapp_notifications").update({
    status: "queued",
    error_message: reason,
    updated_at: new Date().toISOString(),
  }).eq("id", notification.id).in("status", ["queued", "sending", "failed"]);
}

function versionOf(name: unknown) {
  const match = String(name || "").match(/_v(\d+)$/i);
  return match ? Number(match[1]) : 0;
}

function usesDynamicTrackButton(templateName: unknown) {
  const name = String(templateName || "");
  return (name === "delivery_tracking_update_v3") ||
    (/^(shipment_booked|order_shipped|order_out_for_delivery|order_confirm|order_delivered|order_cancelled|order_returned)_v\d+$/i.test(name) && versionOf(name) >= 4);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (!["GET", "POST"].includes(req.method)) return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Supabase service configuration missing" }, 500);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const access = await authorize(req, supabase, serviceRoleKey);
    if (!access.ok) return json({ error: "Unauthorized" }, 401);

    const { data: pendingRetries, error: fetchError } = await supabase
      .from("whatsapp_notification_queue")
      .select("id, notification_id, retry_count, max_retries, next_retry_at, status, last_error")
      .eq("status", "pending")
      .lte("next_retry_at", new Date().toISOString())
      .order("next_retry_at", { ascending: true })
      .limit(20);

    if (fetchError) return json({ error: fetchError.message }, 500);
    if (!pendingRetries?.length) {
      return json({ processed: 0, message: "No pending retries", auth_mode: access.mode });
    }

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let deferred = 0;

    for (const retry of pendingRetries) {
      if (retry.retry_count >= retry.max_retries) {
        await supabase.from("whatsapp_notification_queue").update({
          status: "exhausted",
          updated_at: new Date().toISOString(),
        }).eq("id", retry.id);
        processed++;
        continue;
      }

      const { data: notification, error: notificationError } = await supabase
        .from("order_whatsapp_notifications")
        .select("id, store_id, order_id, customer_phone, phone_number, event_key, order_status, template_name, language, status")
        .eq("id", retry.notification_id)
        .maybeSingle();

      if (notificationError) {
        await supabase.from("whatsapp_notification_queue").update({
          status: "pending",
          last_error: notificationError.message,
          next_retry_at: new Date(Date.now() + 120000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", retry.id);
        failed++;
        processed++;
        continue;
      }

      if (!notification) {
        await supabase.from("whatsapp_notification_queue").update({
          status: "failed",
          last_error: "Original notification not found",
          updated_at: new Date().toISOString(),
        }).eq("id", retry.id);
        failed++;
        processed++;
        continue;
      }

      if (terminalNotificationStatuses.has(String(notification.status || "").toLowerCase())) {
        await supabase.from("whatsapp_notification_queue").update({
          status: "completed",
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", retry.id);
        processed++;
        continue;
      }

      const customerPhone = String(notification.customer_phone || notification.phone_number || "").trim();
      const eventKey = String(
        notification.event_key || (notification.order_status ? `order.${notification.order_status}` : "")
      ).trim();

      if (!customerPhone) {
        const reason = "Customer phone missing";
        await supabase.from("whatsapp_notification_queue").update({
          status: "failed",
          last_error: reason,
          updated_at: new Date().toISOString(),
        }).eq("id", retry.id);
        await supabase.from("order_whatsapp_notifications").update({
          status: "failed",
          error_message: reason,
          updated_at: new Date().toISOString(),
        }).eq("id", notification.id);
        failed++;
        processed++;
        continue;
      }

      let template: any = null;

      if (eventKey) {
        const { data: mapping } = await supabase
          .from("whatsapp_event_template_mappings")
          .select("template:whatsapp_template_registry(meta_template_name, language, variables, status)")
          .eq("store_id", notification.store_id)
          .eq("event_key", eventKey)
          .eq("enabled", true)
          .maybeSingle();
        template = mapping?.template || null;
      }

      if (!template && notification.template_name) {
        const { data: registryTemplate } = await supabase
          .from("whatsapp_template_registry")
          .select("meta_template_name, language, variables, status")
          .eq("store_id", notification.store_id)
          .eq("meta_template_name", notification.template_name)
          .maybeSingle();
        template = registryTemplate || null;
      }

      if (!template) {
        const reason = `Template mapping missing for ${eventKey || notification.template_name || "notification"}`;
        await supabase.from("whatsapp_notification_queue").update({
          status: "failed",
          last_error: reason,
          updated_at: new Date().toISOString(),
        }).eq("id", retry.id);
        await supabase.from("order_whatsapp_notifications").update({
          status: "failed",
          error_message: reason,
          updated_at: new Date().toISOString(),
        }).eq("id", notification.id).in("status", ["queued", "sending", "failed"]);
        failed++;
        processed++;
        continue;
      }

      const templateStatus = String(template.status || "unknown").toLowerCase();
      if (!approvedTemplateStatuses.has(templateStatus)) {
        const reason = `Template ${template.meta_template_name || notification.template_name} awaiting Meta approval (${templateStatus})`;
        await deferForTemplate(supabase, retry, notification, reason);
        deferred++;
        processed++;
        continue;
      }

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("customer_name, order_number, tracking_number, tracking_url, carrier")
        .eq("id", notification.order_id)
        .maybeSingle();

      if (orderError || !order) {
        const reason = orderError?.message || "Order not found";
        await supabase.from("whatsapp_notification_queue").update({
          status: "failed",
          last_error: reason,
          updated_at: new Date().toISOString(),
        }).eq("id", retry.id);
        failed++;
        processed++;
        continue;
      }

      const trackingUrl = String(order.tracking_url || "").trim() ||
        (/dhl/i.test(String(order.carrier || "")) && order.tracking_number
          ? `https://www.dhl.com/en/express/tracking.html?AWB=${order.tracking_number}`
          : "https://malluspices.com");

      const templateVars = Array.isArray(template.variables) ? template.variables : [];
      const varMap: Record<string, string> = {
        customer_name: order.customer_name || "Customer",
        order_number: order.order_number || "Order",
        tracking_number: order.tracking_number || "Not available",
        tracking_url: trackingUrl,
      };
      const parameters = templateVars.map((v: string) => ({
        type: "text",
        text: String(varMap[v] ?? `[${v}]`),
      }));

      const components: any[] = parameters.length ? [{ type: "body", parameters }] : [];
      if (usesDynamicTrackButton(template.meta_template_name)) {
        components.push({
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: String(order.order_number || "Order") }],
        });
      }

      const sendPayload = {
        to: customerPhone,
        type: "template",
        template: {
          name: template.meta_template_name,
          language: template.language || notification.language || "en_GB",
          components,
        },
        storeId: notification.store_id,
        notificationId: notification.id,
      };

      let sendSuccess = false;
      let sendError = "";
      let metaCode: string | number | null = null;

      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(sendPayload),
        });
        const raw = await response.text();
        let result: any = {};
        try { result = raw ? JSON.parse(raw) : {}; } catch { result = { raw }; }
        metaCode = result?.meta_code ?? null;
        sendSuccess = response.ok && (result?.success === true || result?.message_id != null);
        if (!sendSuccess) {
          const code = metaCode ? ` [Meta code ${metaCode}]` : "";
          sendError = `${result?.error || `whatsapp-send returned ${response.status}`}${code}`;
        }
      } catch (error: any) {
        sendError = error?.message || "Network error calling whatsapp-send";
      }

      if (sendSuccess) {
        await supabase.from("whatsapp_notification_queue").update({
          status: "completed",
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", retry.id);
        succeeded++;
      } else if (String(metaCode) === "132001" || /does not exist in the translation/i.test(sendError)) {
        const reason = `Meta template is not ready on the sender account yet: ${sendError}`;
        await deferForTemplate(supabase, retry, notification, reason);
        deferred++;
      } else {
        const permanent = /invalid|unauthorized|forbidden|not found|recipient|authentication|expired|(#?190)|credential|phone number/i.test(sendError);
        const newRetryCount = retry.retry_count + 1;
        const shouldStop = permanent || newRetryCount >= retry.max_retries;

        await supabase.from("whatsapp_notification_queue").update({
          retry_count: newRetryCount,
          status: shouldStop ? (permanent ? "failed" : "exhausted") : "pending",
          last_error: sendError,
          next_retry_at: shouldStop ? null : new Date(Date.now() + 120000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", retry.id);

        await supabase.from("order_whatsapp_notifications").update({
          status: shouldStop ? "failed" : "sending",
          error_message: sendError,
          updated_at: new Date().toISOString(),
        }).eq("id", notification.id).in("status", ["queued", "sending", "failed"]);
        failed++;
      }

      processed++;
    }

    return json({ processed, succeeded, failed, deferred, auth_mode: access.mode });
  } catch (error: any) {
    return json({ error: error?.message || String(error) }, 500);
  }
});

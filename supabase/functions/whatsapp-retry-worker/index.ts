import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-whatsapp-retry-secret",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const terminalNotificationStatuses = new Set(["sent", "delivered", "read", "superseded"]);

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

    for (const retry of pendingRetries) {
      if (retry.retry_count >= retry.max_retries) {
        await supabase
          .from("whatsapp_notification_queue")
          .update({ status: "exhausted", updated_at: new Date().toISOString() })
          .eq("id", retry.id);
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
        await supabase.from("whatsapp_notification_queue").update({
          status: "failed",
          last_error: "Customer phone missing",
          updated_at: new Date().toISOString(),
        }).eq("id", retry.id);
        await supabase.from("order_whatsapp_notifications").update({
          status: "failed",
          error_message: "Customer phone missing",
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

      // Compatibility fallback for notifications created by an older trigger.
      if (!template && notification.template_name) {
        const { data: registryTemplate } = await supabase
          .from("whatsapp_template_registry")
          .select("meta_template_name, language, variables, status")
          .eq("store_id", notification.store_id)
          .eq("meta_template_name", notification.template_name)
          .maybeSingle();
        template = registryTemplate || null;
      }

      if (!template || !["active", "approved"].includes(String(template.status || "").toLowerCase())) {
        const reason = "Active WhatsApp template mapping not found";
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
          : "");

      const templateVars = Array.isArray(template.variables) ? template.variables : [];
      const varMap: Record<string, string> = {
        customer_name: order.customer_name || "",
        order_number: order.order_number || "",
        tracking_number: order.tracking_number || "",
        tracking_url: trackingUrl,
      };
      const parameters = templateVars.map((v: string) => ({
        type: "text",
        text: String(varMap[v] ?? `[${v}]`),
      }));

      const sendPayload = {
        to: customerPhone,
        type: "template",
        template: {
          name: template.meta_template_name,
          language: template.language || notification.language || "en_GB",
          components: parameters.length ? [{ type: "body", parameters }] : [],
        },
        storeId: notification.store_id,
        notificationId: notification.id,
      };

      let sendSuccess = false;
      let sendError = "";

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
        sendSuccess = response.ok && (result?.success === true || result?.message_id != null);
        if (!sendSuccess) {
          const code = result?.meta_code ? ` [Meta code ${result.meta_code}]` : "";
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
      } else {
        const permanent = /invalid|unauthorized|forbidden|not found|template|recipient|authentication|expired|(#?190)|credential|phone number/i.test(sendError);
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

    return json({ processed, succeeded, failed, auth_mode: access.mode });
  } catch (error: any) {
    return json({ error: error?.message || String(error) }, 500);
  }
});

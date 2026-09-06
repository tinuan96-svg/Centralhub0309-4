import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: pendingRetries, error: fetchError } = await supabase
      .from("whatsapp_notification_queue")
      .select("id, notification_id, retry_count, max_retries, next_retry_at, status, last_error")
      .eq("status", "pending")
      .lte("next_retry_at", new Date().toISOString())
      .order("next_retry_at", { ascending: true })
      .limit(20);

    if (fetchError) return json({ error: fetchError.message }, 500);
    if (!pendingRetries?.length) return json({ processed: 0, message: "No pending retries" });

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
        .select("id, store_id, order_id, customer_phone, event_key, template_name, status")
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

      if (notification.status === "sent") {
        await supabase.from("whatsapp_notification_queue").update({
          status: "completed",
          updated_at: new Date().toISOString(),
        }).eq("id", retry.id);
        processed++;
        continue;
      }

      const { data: mapping, error: mappingError } = await supabase
        .from("whatsapp_event_template_mappings")
        .select("template:whatsapp_template_registry(meta_template_name, language, variables)")
        .eq("store_id", notification.store_id)
        .eq("event_key", notification.event_key)
        .eq("enabled", true)
        .maybeSingle();

      if (mappingError || !mapping?.template) {
        await supabase.from("whatsapp_notification_queue").update({
          status: "failed",
          last_error: mappingError?.message || "Template mapping not found",
          updated_at: new Date().toISOString(),
        }).eq("id", retry.id);
        failed++;
        processed++;
        continue;
      }

      const template = mapping.template as any;
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("customer_name, order_number, tracking_number, carrier")
        .eq("id", notification.order_id)
        .maybeSingle();

      if (orderError || !order) {
        await supabase.from("whatsapp_notification_queue").update({
          status: "failed",
          last_error: orderError?.message || "Order not found",
          updated_at: new Date().toISOString(),
        }).eq("id", retry.id);
        failed++;
        processed++;
        continue;
      }

      const templateVars = Array.isArray(template.variables) ? template.variables : [];
      const varMap: Record<string, string> = {
        customer_name: order.customer_name || "",
        order_number: order.order_number || "",
        tracking_number: order.tracking_number || "",
        tracking_url: order.carrier === "DHL" && order.tracking_number
          ? `https://www.dhl.com/en/express/tracking.html?AWB=${order.tracking_number}`
          : "",
      };
      const parameters = templateVars.map((v: string) => ({
        type: "text",
        text: String(varMap[v] ?? `[${v}]`),
      }));

      const sendPayload = {
        to: notification.customer_phone,
        type: "template",
        template: {
          name: template.meta_template_name,
          language: template.language || "en_GB",
          components: parameters.length ? [{ type: "body", parameters }] : [],
        },
        storeId: notification.store_id,
        notificationId: notification.id,
      };

      let sendSuccess = false;
      let sendError = "";

      try {
        // Route retries through the canonical sender so token, WABA, phone ID,
        // Meta error handling, notification state and outbound logging cannot drift.
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

        // whatsapp-send normally updates this, but make sure retry state is also
        // persisted when the sender itself is unavailable.
        if (!sendSuccess) {
          await supabase.from("order_whatsapp_notifications").update({
            status: shouldStop ? "failed" : "sending",
            error_message: sendError,
            updated_at: new Date().toISOString(),
          }).eq("id", notification.id).neq("status", "sent");
        }
        failed++;
      }

      processed++;
    }

    return json({ processed, succeeded, failed });
  } catch (error: any) {
    return json({ error: error?.message || String(error) }, 500);
  }
});

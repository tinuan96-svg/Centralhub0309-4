import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" };

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (typeof part?.text === "string") return part.text;
    }
  }
  return "";
}

function decodeBase64(value: string): Uint8Array {
  const clean = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sum(rows: any[], keys: string[]) {
  return rows.reduce((total, row) => {
    for (const key of keys) {
      const value = Number(row?.[key]);
      if (Number.isFinite(value) && value !== 0) return total + value;
    }
    return total;
  }, 0);
}

function upstreamCode(payload: any): string | null {
  const value = payload?.error?.code ?? payload?.error?.type ?? payload?.code ?? null;
  return value ? String(value).slice(0, 120) : null;
}

async function getSnapshot(db: any, userId: string) {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [storesRes, orders24Res, orders7Res, securityRes, healthRes, stockRes, poRes, competitorRes, historyRes] = await Promise.all([
    db.from("stores").select("id,name,slug,domain").eq("visibility", true),
    db.from("orders").select("store_id,total,total_amount,total_revenue,gross_profit,order_profit,order_status,status,payment_status,created_at").gte("created_at", since24h).limit(1000),
    db.from("orders").select("store_id,total,total_amount,total_revenue,gross_profit,order_profit,created_at").gte("created_at", since7d).limit(2000),
    db.from("security_events").select("store_id,event_type,severity,status,title,occurrence_count,last_seen_at").gte("last_seen_at", since7d).order("last_seen_at", { ascending: false }).limit(30),
    db.from("site_health_issues").select("store_id,title,category,severity,risk_level,status,last_seen_at").in("status", ["open", "queued", "fixing", "failed"]).order("last_seen_at", { ascending: false }).limit(40),
    db.from("products").select("name,brand,category,stock,reorder_level,stock_status").eq("is_active", true).order("stock", { ascending: true, nullsFirst: true }).limit(25),
    db.from("purchase_orders").select("po_number,status,order_date,expected_delivery_date,total_cost,currency,updated_at").order("updated_at", { ascending: false }).limit(20),
    db.from("competitor_prices").select("scan_status,scan_error,match_status,data_quality_state,last_scanned_at,updated_at").order("updated_at", { ascending: false }).limit(40),
    db.from("voice_assistant_commands").select("mode,input_text,response_text,intent,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(6),
  ]);

  const stores = storesRes.data ?? [];
  const storeMap = Object.fromEntries(stores.map((s: any) => [s.id, s.name]));
  const orders24 = orders24Res.data ?? [];
  const orders7 = orders7Res.data ?? [];
  const byStore: Record<string, { orders24h: number; revenue24h: number; profit24h: number }> = {};

  for (const store of stores) byStore[store.name] = { orders24h: 0, revenue24h: 0, profit24h: 0 };
  for (const order of orders24) {
    const name = storeMap[order.store_id] ?? "Unknown";
    byStore[name] ??= { orders24h: 0, revenue24h: 0, profit24h: 0 };
    byStore[name].orders24h += 1;
    byStore[name].revenue24h += sum([order], ["total_revenue", "total_amount", "total"]);
    byStore[name].profit24h += sum([order], ["gross_profit", "order_profit"]);
  }

  const security = (securityRes.data ?? []).map((x: any) => ({ ...x, store: storeMap[x.store_id] ?? null }));
  const health = (healthRes.data ?? []).map((x: any) => ({ ...x, store: storeMap[x.store_id] ?? null }));
  const lowStock = (stockRes.data ?? []).filter((p: any) => {
    const stock = Number(p.stock ?? 0);
    const reorder = Number(p.reorder_level ?? 0);
    return p.stock_status === "out_of_stock" || stock <= reorder || stock <= 3;
  }).slice(0, 15);
  const competitorRows = competitorRes.data ?? [];

  return {
    generatedAt: new Date().toISOString(),
    stores: stores.map((s: any) => ({ name: s.name, slug: s.slug, domain: s.domain })),
    operations: {
      last24h: {
        orders: orders24.length,
        revenue: Number(sum(orders24, ["total_revenue", "total_amount", "total"]).toFixed(2)),
        profit: Number(sum(orders24, ["gross_profit", "order_profit"]).toFixed(2)),
        byStore,
      },
      last7d: {
        orders: orders7.length,
        revenue: Number(sum(orders7, ["total_revenue", "total_amount", "total"]).toFixed(2)),
        profit: Number(sum(orders7, ["gross_profit", "order_profit"]).toFixed(2)),
      },
      securityOpen: security.filter((x: any) => String(x.status).toLowerCase() !== "resolved").slice(0, 12),
      siteHealthOpen: health.slice(0, 15),
      lowStock,
      recentPurchaseOrders: (poRes.data ?? []).slice(0, 10),
      competitorScanProblems: competitorRows.filter((x: any) => x.scan_error || ["failed", "error"].includes(String(x.scan_status).toLowerCase())).slice(0, 10),
    },
    recentConversation: (historyRes.data ?? []).reverse(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { success: false, error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) return reply(500, { success: false, error: "server_not_configured" });

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return reply(401, { success: false, error: "missing_auth" });

  const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return reply(401, { success: false, error: "invalid_auth" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return reply(400, { success: false, error: "invalid_json" });
  }
  const action = String(body?.action ?? "");

  if (action === "transcribe") {
    if (!openaiKey) return reply(503, { success: false, error: "openai_not_configured" });
    const audioBase64 = String(body?.audioBase64 ?? "");
    const mimeType = String(body?.mimeType ?? "audio/webm").slice(0, 80);
    if (!audioBase64 || audioBase64.length > 12_000_000) return reply(400, { success: false, error: "audio_missing_or_too_large" });

    try {
      const bytes = decodeBase64(audioBase64);
      const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("wav") ? "wav" : "webm";
      const form = new FormData();
      form.append("file", new File([bytes], `centralhub-command.${ext}`, { type: mimeType }));
      form.append("model", Deno.env.get("CENTRALHUB_TRANSCRIBE_MODEL") ?? "gpt-4o-transcribe");
      form.append("prompt", "CentralHub business command. The speaker may code-switch between Malayalam and English. Important terms include CentralHub, MalluSpices, KeralaGrocery, PocketGrocery, Supabase, GitHub, Netlify, DHL, Mollie, WhatsApp, dashboard, orders, profit, stock, competitors, board meeting, scan, deploy, notifications.");

      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: form,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return reply(502, { success: false, error: "transcription_failed", status: response.status, upstream_code: upstreamCode(payload) });
      const text = String(payload?.text ?? "").trim();
      if (!text) return reply(422, { success: false, error: "empty_transcript" });
      return reply(200, { success: true, transcript: text });
    } catch (error) {
      return reply(500, { success: false, error: error instanceof Error ? error.message : "transcription_error" });
    }
  }

  if (action === "command") {
    if (!openaiKey) return reply(503, { success: false, error: "openai_not_configured" });
    const text = String(body?.text ?? "").trim().slice(0, 6000);
    const requestedMode = ["operations", "board", "developer"].includes(String(body?.mode)) ? String(body.mode) : "operations";
    if (!text) return reply(400, { success: false, error: "missing_command" });

    const snapshot = await getSnapshot(db, user.id);
    const prompt = `You are CentralHub Voice, the private business copilot inside CentralHub. The user may speak Malayalam, English, or mix both. Reply naturally in the same language mix as the user and keep the spoken reply concise. Use concrete numbers only when they are present in the live snapshot.\n\nModes: operations = operational scan; board = executive briefing; developer = technical explanation.\n\nSafety rules:\n- The live snapshot is read-only. Never invent data.\n- Never claim that code, database rows, orders, prices, messages, refunds, users, files, deployments or other external systems were changed.\n- Any requested write/destructive/external action must set requires_confirmation=true and describe the proposed action.\n- Read-only questions and summaries use risk_level=read_only and requires_confirmation=false.\n- If asked to inspect GitHub/Netlify/Supabase beyond this snapshot, explain that connected execution is separate; do not pretend it ran.\n- navigation_path must be one of /dashboard, /orders, /products, /competitors, /finance, /banking, /purchase, /marketing, /business-intelligence, /settings/notifications, or null.\n\nReturn ONLY valid JSON with exactly these fields:\n{"reply":"string","intent":"string","mode":"operations|board|developer","risk_level":"read_only|low|medium|high","requires_confirmation":false,"suggested_action":null,"navigation_path":null,"speak":true}\n\nUSER MODE: ${requestedMode}\nUSER COMMAND: ${text}\nLIVE SNAPSHOT JSON:\n${JSON.stringify(snapshot)}`;

    const configuredModel = String(Deno.env.get("CENTRALHUB_VOICE_MODEL") || Deno.env.get("OPENAI_MODEL_FAST") || "").trim();
    const candidateModels = Array.from(new Set(["gpt-5.6-luna", configuredModel, "gpt-5.6-terra"].filter(Boolean)));
    let raw: any = null;
    let aiResponse: Response | null = null;
    let usedModel = "";

    for (const model of candidateModels) {
      usedModel = model;
      aiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          store: false,
          input: prompt,
          max_output_tokens: 1200,
          text: {
            format: {
              type: "json_schema",
              name: "centralhub_voice_reply",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  reply: { type: "string" },
                  intent: { type: "string" },
                  mode: { type: "string", enum: ["operations", "board", "developer"] },
                  risk_level: { type: "string", enum: ["read_only", "low", "medium", "high"] },
                  requires_confirmation: { type: "boolean" },
                  suggested_action: { type: ["string", "null"] },
                  navigation_path: { type: ["string", "null"] },
                  speak: { type: "boolean" }
                },
                required: ["reply", "intent", "mode", "risk_level", "requires_confirmation", "suggested_action", "navigation_path", "speak"]
              }
            }
          }
        }),
      });

      raw = await aiResponse.json().catch(() => null);
      if (aiResponse.ok) break;

      const code = upstreamCode(raw);
      const retryableModelError = aiResponse.status === 404 && (code === "model_not_found" || code === "not_found_error");
      if (!retryableModelError) break;
    }

    if (!aiResponse?.ok) {
      return reply(502, {
        success: false,
        error: "assistant_failed",
        status: aiResponse?.status ?? 502,
        upstream_code: upstreamCode(raw),
        attempted_model: usedModel || null,
      });
    }

    const content = extractOutputText(raw).trim();
    let result: any;
    try {
      result = JSON.parse(content);
    } catch {
      return reply(502, { success: false, error: "invalid_assistant_output", attempted_model: usedModel || null });
    }

    const safeMode = ["operations", "board", "developer"].includes(String(result?.mode)) ? String(result.mode) : requestedMode;
    const safeRisk = ["read_only", "low", "medium", "high"].includes(String(result?.risk_level)) ? String(result.risk_level) : "read_only";
    const requiresConfirmation = Boolean(result?.requires_confirmation);
    const finalResult = {
      reply: String(result?.reply ?? "CentralHub Voice is ready.").slice(0, 5000),
      intent: String(result?.intent ?? "general").slice(0, 200),
      mode: safeMode,
      risk_level: safeRisk,
      requires_confirmation: requiresConfirmation,
      suggested_action: result?.suggested_action == null ? null : String(result.suggested_action).slice(0, 500),
      navigation_path: typeof result?.navigation_path === "string" ? result.navigation_path : null,
      speak: result?.speak !== false,
    };

    const status = requiresConfirmation ? "pending_confirmation" : "completed";
    const { error: historyError } = await db.from("voice_assistant_commands").insert({
      user_id: user.id,
      mode: finalResult.mode,
      input_text: text,
      response_text: finalResult.reply,
      intent: finalResult.intent,
      risk_level: finalResult.risk_level,
      requires_confirmation: finalResult.requires_confirmation,
      action_name: finalResult.suggested_action,
      action_payload: { navigation_path: finalResult.navigation_path, model: usedModel },
      status,
    });
    if (historyError) console.error("centralhub-voice history insert failed", historyError.message);

    return reply(200, { success: true, transcript: text, ...finalResult, status });
  }

  return reply(400, { success: false, error: "invalid_action" });
});

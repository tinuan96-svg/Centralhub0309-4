import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" };
const TRANSCRIBE_HINT = "Shruthi, CentralHub, MalluSpices, KeralaGrocery, PocketGrocery, bank balance, stock, orders, customers, finance, Supabase, GitHub, Netlify, DHL, Mollie, WhatsApp.";

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}
function textOut(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) if (typeof part?.text === "string") return part.text;
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
function words(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter(Boolean);
}
function domainsFor(text: string) {
  const value = text.toLowerCase();
  const domains = new Set<string>(["core", "banking", "stock"]);
  const add = (name: string, pattern: RegExp) => { if (pattern.test(value)) domains.add(name); };
  add("orders", /order|sale|revenue|profit|payout|delivery|shipment|fulfil|ഓർഡർ|സെയിൽ|ஆர்டர்|சேல்ஸ்/iu);
  add("finance", /finance|payable|creditor|cashflow|p&l|pnl|expense|invoice|vat|margin|ഫിനാൻസ്|நிதி|செலவு/iu);
  add("customers", /customer|buyer|repeat|lifetime|spend|കസ്റ്റമർ|வாடிக்கையாளர்/iu);
  add("purchase", /purchase|supplier|procure|\bpo\b|backorder|replenish|സപ്ലയർ|പർച്ചേസ്|சப்ளையர்|பர்சேஸ்/iu);
  add("marketing", /marketing|campaign|audience|attribution|traffic|google ads|meta ads|മാർക്കറ്റിംഗ്|மார்க்கெட்டிங்/iu);
  add("support", /support|ticket|complaint|inbox|whatsapp|customer care|സപ്പോർട്ട്|டிக்கெட்/iu);
  add("security", /security|hack|risk|threat|attack|incident|സെക്യൂരിറ്റി|பாதுகாப்பு/iu);
  add("health", /site health|error|sync|deployment|uptime|monitor|issue|bug|സിങ്ക്|എറർ|பிழை|சிங்க்/iu);
  add("competitors", /competitor|keralataste|pickeasy|veensa|indianshelf|price comparison|കോമ്പറ്റിറ്റർ|போட்டியாளர்/iu);
  if (/everything|all data|full overview|business overview|what needs attention|summari[sz]e|overall|എല്ലാം|മൊത്തം|மொத்தம்/iu.test(value)) {
    ["orders", "finance", "customers", "purchase", "marketing", "support", "security", "health", "competitors"].forEach((x) => domains.add(x));
  }
  return [...domains];
}
function matchingProducts(products: any[], text: string) {
  const stop = new Set(["what", "whats", "is", "the", "a", "an", "of", "for", "show", "tell", "me", "please", "current", "status", "stock", "inventory", "product", "products", "how", "much", "many", "available", "shruthi", "nora", "and", "in", "on", "at", "to", "today"]);
  const tokens = words(text).filter((x) => x.length > 1 && !stop.has(x));
  if (!tokens.length) return [];
  return products.map((p: any) => {
    const hay = words(`${p.name ?? ""} ${p.brand ?? ""} ${p.category ?? ""} ${p.sku ?? ""}`);
    const score = tokens.reduce((n, token) => n + (hay.some((w) => w === token || w.includes(token) || token.includes(w)) ? 1 : 0), 0);
    return { p, score };
  }).filter((x: any) => x.score > 0).sort((a: any, b: any) => b.score - a.score).slice(0, 15).map((x: any) => x.p);
}

async function getSnapshot(db: any, userId: string, userText: string) {
  const now = Date.now();
  const since24h = new Date(now - 86400000).toISOString();
  const since7d = new Date(now - 7 * 86400000).toISOString();
  const domains = domainsFor(userText);
  const wants = (name: string) => domains.includes(name);

  const [storesRes, ordersRes, productsRes, bankRes, cashRes, historyRes] = await Promise.all([
    db.from("stores").select("id,name,slug,domain").eq("visibility", true),
    db.from("orders").select("store_id,order_number,total,total_amount,total_revenue,gross_profit,order_profit,order_status,status,payment_status,payout_status,created_at").gte("created_at", since7d).order("created_at", { ascending: false }).limit(400),
    db.from("products").select("id,name,sku,brand,category,stock,reorder_level,stock_status,is_active,is_published,updated_at").eq("is_active", true).limit(1000),
    db.from("store_bank_accounts").select("store_id,bank_name,account_name,currency,current_balance,last_synced_at,balance_source,sync_source,account_scope").eq("is_active", true).order("updated_at", { ascending: false }).limit(30),
    db.from("v_finance_cash_position").select("bank_balance,total_payables,due_now,due_7_days,due_30_days,overdue_count,projected_cash_after_7_day_payables,projected_cash_after_30_day_payables").limit(1),
    db.from("voice_assistant_commands").select("mode,input_text,response_text,intent,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
  ]);

  const stores = storesRes.data ?? [];
  const storeMap = Object.fromEntries(stores.map((s: any) => [s.id, s.name]));
  const orders = ordersRes.data ?? [];
  const products = productsRes.data ?? [];
  const paid = orders.filter((o: any) => String(o.payment_status).toLowerCase() === "paid");
  const paid24 = paid.filter((o: any) => new Date(o.created_at).getTime() >= new Date(since24h).getTime());
  const paymentExceptions = orders.filter((o: any) => ["pending", "failed"].includes(String(o.payment_status).toLowerCase()));
  const byStore: Record<string, any> = {};
  for (const s of stores) byStore[s.name] = { orders24h: 0, revenue24h: 0, profit24h: 0, orders7d: 0, revenue7d: 0, profit7d: 0 };
  for (const o of paid) {
    const name = storeMap[o.store_id] ?? "Unknown";
    byStore[name] ??= { orders24h: 0, revenue24h: 0, profit24h: 0, orders7d: 0, revenue7d: 0, profit7d: 0 };
    byStore[name].orders7d += 1;
    byStore[name].revenue7d += sum([o], ["total_revenue", "total_amount", "total"]);
    byStore[name].profit7d += sum([o], ["gross_profit", "order_profit"]);
    if (new Date(o.created_at).getTime() >= new Date(since24h).getTime()) {
      byStore[name].orders24h += 1;
      byStore[name].revenue24h += sum([o], ["total_revenue", "total_amount", "total"]);
      byStore[name].profit24h += sum([o], ["gross_profit", "order_profit"]);
    }
  }

  const out = products.filter((p: any) => String(p.stock_status).toLowerCase() === "out_of_stock" || Number(p.stock ?? 0) <= 0);
  const low = products.filter((p: any) => {
    const qty = Number(p.stock ?? 0), threshold = Number(p.reorder_level ?? 0);
    return qty > 0 && (String(p.stock_status).toLowerCase() === "low_stock" || (threshold > 0 && qty <= threshold) || qty <= 3);
  }).sort((a: any, b: any) => Number(a.stock ?? 0) - Number(b.stock ?? 0));

  const snapshot: any = {
    generatedAt: new Date().toISOString(),
    requestedDomains: domains,
    pageIndependentReadAccess: true,
    permissions: { read_all_centralhub_domains: true, navigation: true, refresh_reload: true, edits: false, writes: false, refunds: false, payments: false, deletes: false, external_messages: false },
    stores: stores.map((s: any) => ({ name: s.name, slug: s.slug, domain: s.domain })),
    sales: {
      last24h: { orders: paid24.length, revenue: Number(sum(paid24, ["total_revenue", "total_amount", "total"]).toFixed(2)), profit: Number(sum(paid24, ["gross_profit", "order_profit"]).toFixed(2)) },
      last7d: { orders: paid.length, revenue: Number(sum(paid, ["total_revenue", "total_amount", "total"]).toFixed(2)), profit: Number(sum(paid, ["gross_profit", "order_profit"]).toFixed(2)) },
      byStore,
      paymentExceptions7d: { pending: paymentExceptions.filter((x: any) => String(x.payment_status).toLowerCase() === "pending").length, failed: paymentExceptions.filter((x: any) => String(x.payment_status).toLowerCase() === "failed").length },
      recentOrders: wants("orders") ? orders.slice(0, 30).map((o: any) => ({ ...o, store: storeMap[o.store_id] ?? null })) : [],
    },
    stock: { totalActiveProducts: products.length, totalUnits: products.reduce((n: number, p: any) => n + Number(p.stock ?? 0), 0), outOfStockCount: out.length, lowStockCount: low.length, productMatches: matchingProducts(products, userText), outOfStock: out.slice(0, 25), lowStock: low.slice(0, 30) },
    banking: {
      accounts: (bankRes.data ?? []).map((b: any) => ({ store: storeMap[b.store_id] ?? null, bank_name: b.bank_name, account_name: b.account_name, currency: b.currency, current_balance: b.current_balance, last_synced_at: b.last_synced_at, balance_source: b.balance_source, sync_source: b.sync_source, account_scope: b.account_scope })),
      cashPosition: (cashRes.data ?? [])[0] ?? null,
    },
    recentConversation: (historyRes.data ?? []).reverse(),
  };

  const extras: { key: string; query: any }[] = [];
  if (wants("banking") || wants("finance")) extras.push({ key: "bankActivity", query: db.from("v_financial_bank_activity").select("store_id,transaction_date,description,amount,type,balance,merchant,transaction_category,accounting_category,classification_status,ledger_name,pnl_class").order("transaction_date", { ascending: false }).limit(35) });
  if (wants("finance")) extras.push({ key: "payableAlerts", query: db.from("finance_payable_alerts").select("alert_type,severity,status,due_date,amount_due,message,created_at").neq("status", "resolved").order("due_date", { ascending: true }).limit(25) });
  if (wants("customers")) extras.push({ key: "customers", query: db.from("customers").select("store_id,name,total_spend,order_count,last_order_date,created_at").order("last_order_date", { ascending: false, nullsFirst: false }).limit(40) });
  if (wants("purchase")) extras.push({ key: "purchaseOrders", query: db.from("purchase_orders").select("po_number,status,order_date,expected_delivery_date,actual_delivery_date,total_cost,currency,notes,updated_at").order("updated_at", { ascending: false }).limit(30) });
  if (wants("marketing")) extras.push({ key: "marketingInsights", query: db.from("marketing_insights").select("store_id,title,description,priority,status,created_at,updated_at").order("updated_at", { ascending: false }).limit(30) });
  if (wants("support")) extras.push({ key: "supportTickets", query: db.from("support_tickets").select("store_id,category,priority,status,subject,ai_summary,description,created_at,updated_at,resolved_at").order("updated_at", { ascending: false }).limit(30) });
  if (wants("security")) extras.push({ key: "security", query: db.from("security_events").select("store_id,source,event_type,severity,status,title,occurrence_count,last_seen_at").order("last_seen_at", { ascending: false }).limit(35) });
  if (wants("health")) extras.push({ key: "health", query: db.from("site_health_issues").select("store_id,source,check_name,title,description,category,severity,risk_level,status,last_seen_at,page_url").in("status", ["open", "queued", "fixing", "failed"]).order("last_seen_at", { ascending: false }).limit(35) });
  if (wants("competitors")) extras.push({ key: "competitors", query: db.from("competitor_prices").select("competitor_id,product_id,price,source_currency,source_product_name,source_brand,source_size,source_stock_status,normalised_price_per_kg,scan_status,scan_error,match_status,data_quality_state,last_scanned_at,updated_at").order("updated_at", { ascending: false }).limit(50) });
  const extraResults = await Promise.all(extras.map((x) => x.query));
  extraResults.forEach((result: any, index: number) => {
    snapshot[extras[index].key] = (result?.data ?? []).map((row: any) => row?.store_id ? { ...row, store: storeMap[row.store_id] ?? null } : row);
  });
  return snapshot;
}

Deno.serve(async (req: Request) => {
  const started = Date.now();
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { success: false, error: "method_not_allowed" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "", serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) return reply(500, { success: false, error: "server_not_configured" });
  const auth = req.headers.get("authorization") ?? "", token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return reply(401, { success: false, error: "missing_auth" });
  const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return reply(401, { success: false, error: "invalid_auth" });
  if (String(user.app_metadata?.role ?? "").toLowerCase() !== "admin") return reply(403, { success: false, error: "admin_required" });
  let body: any; try { body = await req.json(); } catch { return reply(400, { success: false, error: "invalid_json" }); }
  const action = String(body?.action ?? "");

  if (action === "transcribe") {
    if (!openaiKey) return reply(503, { success: false, error: "openai_not_configured" });
    const audioBase64 = String(body?.audioBase64 ?? ""), mimeType = String(body?.mimeType ?? "audio/webm").slice(0, 80);
    if (!audioBase64 || audioBase64.length > 12000000) return reply(400, { success: false, error: "audio_missing_or_too_large" });
    try {
      const bytes = decodeBase64(audioBase64), ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("wav") ? "wav" : "webm";
      const form = new FormData();
      form.append("file", new File([bytes], `centralhub-command.${ext}`, { type: mimeType }));
      form.append("model", Deno.env.get("CENTRALHUB_TRANSCRIBE_MODEL") ?? "gpt-4o-transcribe");
      form.append("prompt", TRANSCRIBE_HINT);
      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${openaiKey}` }, body: form });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return reply(502, { success: false, error: "transcription_failed", status: response.status, upstream_code: upstreamCode(payload) });
      const text = String(payload?.text ?? "").trim();
      if (!text) return reply(422, { success: false, error: "empty_transcript" });
      return reply(200, { success: true, transcript: text, latency_ms: Date.now() - started });
    } catch (error) { return reply(500, { success: false, error: error instanceof Error ? error.message : "transcription_error" }); }
  }

  if (action !== "command") return reply(400, { success: false, error: "invalid_action" });
  if (!openaiKey) return reply(503, { success: false, error: "openai_not_configured" });
  const text = String(body?.text ?? "").trim().slice(0, 6000), requestedMode = ["operations", "board", "developer"].includes(String(body?.mode)) ? String(body.mode) : "operations", pageContext = String(body?.page_context ?? "").trim().slice(0, 300);
  if (!text) return reply(400, { success: false, error: "missing_command" });
  const snapStart = Date.now(), snapshot = await getSnapshot(db, user.id, text), snapshotMs = Date.now() - snapStart;
  const prompt = `You are Shruthi (ശ്രുതി), the private AI executive assistant and business manager inside CentralHub for the sole super-admin. NORA is only a legacy wake alias. Match the user's Malayalam/English/Tamil language mix naturally.

The CURRENT PAGE is UI context only and NEVER limits your data access. You have page-independent READ access to the LIVE SNAPSHOT. If the requested fact is in the snapshot, answer it directly; never tell the user to open Banking, Products, Orders, Finance or another page merely to read data you already have. Navigation is optional after answering.

For bank balances, name the store/account, balance, currency and freshness when available; if null or stale, say so. For stock, distinguish total, low and out-of-stock, and prefer stock.productMatches for named products/brands. Sales/revenue/profit count paid orders only. Use recentConversation for short follow-ups.

AUTHORITY: broad read-only business access plus navigation and harmless refresh/reload. ZERO write authority: no edits, creates, deletes, price/order/settings changes, refunds, payments, transfers, deployments, external messages, permission changes, or commitments. For a write request, explain that Shruthi is currently read-only and do not pretend it happened. requires_confirmation must remain false and suggested_action null.

Speak like a fast human assistant: ordinary replies usually 1-3 natural sentences. Give deeper evidence only when explicitly asked for deep/audit/investigate/full analysis. Never invent missing data.

Return ONLY JSON: {"reply":"string","intent":"string","mode":"operations|board|developer","risk_level":"read_only|low|medium|high","requires_confirmation":false,"suggested_action":null,"navigation_path":null,"speak":true}
CURRENT PAGE: ${pageContext || "unknown"}
INTERNAL MODE: ${requestedMode}
USER: ${text}
LIVE PAGE-INDEPENDENT SNAPSHOT: ${JSON.stringify(snapshot)}`;
  const configured = String(Deno.env.get("CENTRALHUB_VOICE_MODEL") || Deno.env.get("OPENAI_MODEL_FAST") || "").trim();
  const models = Array.from(new Set(["gpt-5.6-luna", configured, "gpt-5.6-terra"].filter(Boolean)));
  const deep = /\b(deep|deeply|detailed|fully|audit|investigate|analyse|analyze|compare|full scan)\b|ഡീറ്റെയിൽ|ഡീപ്|ഓഡിറ്റ്|വിശദമായി/iu.test(text);
  let raw: any = null, aiResponse: Response | null = null, usedModel = ""; const modelStart = Date.now();
  for (const model of models) {
    usedModel = model;
    aiResponse = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, store: false, reasoning: { effort: deep ? "medium" : "none" }, input: prompt, max_output_tokens: deep ? 1200 : 420, text: { format: { type: "json_schema", name: "centralhub_voice_reply", strict: true, schema: { type: "object", additionalProperties: false, properties: { reply: { type: "string" }, intent: { type: "string" }, mode: { type: "string", enum: ["operations", "board", "developer"] }, risk_level: { type: "string", enum: ["read_only", "low", "medium", "high"] }, requires_confirmation: { type: "boolean" }, suggested_action: { type: ["string", "null"] }, navigation_path: { type: ["string", "null"] }, speak: { type: "boolean" } }, required: ["reply", "intent", "mode", "risk_level", "requires_confirmation", "suggested_action", "navigation_path", "speak"] } } } }) });
    raw = await aiResponse.json().catch(() => null); if (aiResponse.ok) break;
    const code = upstreamCode(raw); if (!(aiResponse.status === 404 && (code === "model_not_found" || code === "not_found_error"))) break;
  }
  const modelMs = Date.now() - modelStart;
  if (!aiResponse?.ok) return reply(502, { success: false, error: "assistant_failed", status: aiResponse?.status ?? 502, upstream_code: upstreamCode(raw), attempted_model: usedModel || null, latency_ms: Date.now() - started });
  let result: any; try { result = JSON.parse(textOut(raw).trim()); } catch { return reply(502, { success: false, error: "invalid_assistant_output", attempted_model: usedModel || null, latency_ms: Date.now() - started }); }
  const finalResult = { reply: String(result?.reply ?? "Shruthi is ready.").slice(0, 5000), intent: String(result?.intent ?? "general").slice(0, 200), mode: ["operations", "board", "developer"].includes(String(result?.mode)) ? String(result.mode) : requestedMode, risk_level: ["read_only", "low", "medium", "high"].includes(String(result?.risk_level)) ? String(result.risk_level) : "read_only", requires_confirmation: false, suggested_action: null, navigation_path: typeof result?.navigation_path === "string" ? result.navigation_path : null, speak: result?.speak !== false };
  const totalMs = Date.now() - started;
  const { error: historyError } = await db.from("voice_assistant_commands").insert({ user_id: user.id, mode: finalResult.mode, input_text: text, response_text: finalResult.reply, intent: finalResult.intent, risk_level: finalResult.risk_level, requires_confirmation: false, action_name: null, action_payload: { navigation_path: finalResult.navigation_path, model: usedModel, page_context: pageContext, assistant_name: "Shruthi", requested_domains: snapshot.requestedDomains, access_mode: "page_independent_read_only", latency_ms: { snapshot: snapshotMs, model: modelMs, total: totalMs } }, status: "completed" });
  if (historyError) console.error("centralhub-voice history insert failed", historyError.message);
  return reply(200, { success: true, transcript: text, ...finalResult, status: "completed", access_mode: "page_independent_read_only", latency_ms: { snapshot: snapshotMs, model: modelMs, total: totalMs } });
});

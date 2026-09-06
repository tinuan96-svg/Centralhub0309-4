import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const MOLLIE_API = "https://api.mollie.com/v2";
type Json = Record<string, any>;

function money(v: any): number | null {
  const raw = v && typeof v === "object" ? v.value : v;
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
function absMoney(v: any): number | null { const n = money(v); return n === null ? null : Math.abs(n); }
function normalizeToken(raw: string): string {
  let token = raw.trim();
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) token = token.slice(1, -1).trim();
  token = token.replace(/^Bearer\s+/i, "").trim();
  return token;
}
function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
async function mollieFetch(token: string, pathOrUrl: string): Promise<Json> {
  const target = pathOrUrl.startsWith("http") ? pathOrUrl : `${MOLLIE_API}${pathOrUrl}`;
  const res = await fetch(target, { headers: { Authorization: `Bearer ${token}`, Accept: "application/hal+json" } });
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const detail = data?.detail || data?.title || data?.message || `HTTP ${res.status}`;
    throw new Error(`Mollie API ${res.status}: ${detail}`);
  }
  return data;
}

Deno.serve(async (req: Request) => {
  const startedAt = new Date().toISOString();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mollieTokenRaw = Deno.env.get("MOLLIE_ADVANCED_ACCESS_TOKEN") || "";
  const mollieToken = normalizeToken(mollieTokenRaw);
  if (!supabaseUrl || !serviceKey) return json({ error: "Supabase service environment unavailable" }, 500);
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const suppliedWorkerSecret = req.headers.get("x-mollie-accounting-worker-secret") || "";
    const { data: validWorker, error: authError } = await supabase.rpc("verify_mollie_accounting_worker_secret", { p_secret: suppliedWorkerSecret });
    if (authError || validWorker !== true) return json({ error: "Unauthorized" }, 401);
    if (!mollieToken) return json({ error: "MOLLIE_ADVANCED_ACCESS_TOKEN is not configured" }, 500);

    let body: any = {};
    try { body = req.method === "GET" ? {} : await req.json(); } catch { body = {}; }
    const requestedMaxPages = Number(body?.maxPages || 0);

    const { data: state } = await supabase.from("mollie_accounting_sync_state").select("last_balance_transaction_id").eq("id", true).maybeSingle();
    const previousNewestId = state?.last_balance_transaction_id || null;
    await supabase.from("mollie_accounting_sync_state").update({ last_sync_started_at: startedAt, last_error: null, updated_at: startedAt }).eq("id", true);

    const { data: orders, error: orderError } = await supabase.from("orders")
      .select("id,order_number,mollie_payment_id,gateway_fee_source,gateway_fee_actual,gateway_fee_meta,created_at")
      .not("mollie_payment_id", "is", null);
    if (orderError) throw orderError;
    const orderByPayment = new Map<string, any>();
    for (const order of orders || []) if (order.mollie_payment_id) orderByPayment.set(String(order.mollie_payment_id), order);

    const matches = new Map<string, { paymentRows: any[]; captureRows: any[] }>();
    let nextUrl: string | null = `${MOLLIE_API}/balances/primary/transactions?limit=250`;
    let pages = 0, imported = 0;
    let newestTransactionId: string | null = null;
    let reachedPreviousNewest = false;
    const maxPages = requestedMaxPages > 0 ? Math.max(1, Math.min(requestedMaxPages, 40)) : (previousNewestId ? 4 : 20);

    while (nextUrl && pages < maxPages && !reachedPreviousNewest) {
      const page = await mollieFetch(mollieToken, nextUrl);
      const txns: any[] = page?._embedded?.transactions || page?._embedded?.balance_transactions || page?._embedded?.balanceTransactions || [];
      if (!Array.isArray(txns) || txns.length === 0) break;
      pages += 1;
      if (!newestTransactionId && txns[0]?.id) newestTransactionId = String(txns[0].id);
      const auditRows: any[] = [];
      for (const t of txns) {
        const txId = String(t?.id || "");
        if (previousNewestId && txId === previousNewestId) { reachedPreviousNewest = true; break; }
        if (!txId) continue;
        const paymentId = t?.context?.paymentId ? String(t.context.paymentId) : null;
        const fee = absMoney(t?.deductionDetails?.fees);
        auditRows.push({
          id: txId, balance_id: t?.balanceId || null, type: String(t?.type || "unknown"), payment_id: paymentId,
          payment_description: t?.context?.paymentDescription || null,
          currency: t?.resultAmount?.currency || t?.initialAmount?.currency || t?.deductionDetails?.fees?.currency || null,
          initial_amount: money(t?.initialAmount), result_amount: money(t?.resultAmount), deductions: money(t?.deductions), fee_amount: fee,
          created_at: t?.createdAt || null, context: t?.context || {}, deduction_details: t?.deductionDetails || {}, imported_at: startedAt, updated_at: startedAt,
        });
        if (paymentId && orderByPayment.has(paymentId) && fee !== null) {
          const bucket = matches.get(paymentId) || { paymentRows: [], captureRows: [] };
          const feeRow = { id: txId, fee, currency: t?.deductionDetails?.fees?.currency || t?.resultAmount?.currency || null, createdAt: t?.createdAt || null };
          if (t?.type === "payment") bucket.paymentRows.push(feeRow); else if (t?.type === "capture") bucket.captureRows.push(feeRow);
          matches.set(paymentId, bucket);
        }
      }
      if (auditRows.length) {
        const { error: auditError } = await supabase.from("mollie_balance_transactions").upsert(auditRows, { onConflict: "id" });
        if (auditError) throw auditError;
        imported += auditRows.length;
      }
      if (!reachedPreviousNewest) {
        const next = page?._links?.next?.href;
        nextUrl = typeof next === "string" && next ? next : null;
      }
    }

    let reconciled = 0, protectedSkipped = 0;
    const reconciledOrders: any[] = [];
    for (const [paymentId, bucket] of matches.entries()) {
      const order = orderByPayment.get(paymentId);
      if (!order) continue;
      const source = order.gateway_fee_source ?? null;
      const hasProtectedActual = order.gateway_fee_actual !== null && order.gateway_fee_actual !== undefined && ![null, "store_estimate", "mollie_balance_transaction", "mollie_balance_api"].includes(source);
      if (hasProtectedActual) { protectedSkipped += 1; continue; }

      let fee = 0; let feeRows: any[] = [];
      if (bucket.paymentRows.length) {
        const best = bucket.paymentRows.reduce((a, b) => (Number(b.fee) > Number(a.fee) ? b : a)); fee = Number(best.fee); feeRows = bucket.paymentRows;
      } else if (bucket.captureRows.length) {
        fee = bucket.captureRows.reduce((sum, row) => sum + Number(row.fee || 0), 0); feeRows = bucket.captureRows;
      } else continue;
      if (!Number.isFinite(fee) || fee < 0) continue;
      fee = Math.round(fee * 100) / 100;

      const oldMeta = order.gateway_fee_meta && typeof order.gateway_fee_meta === "object" ? order.gateway_fee_meta : {};
      const nextMeta = { ...oldMeta, mollieAccounting: {
        source: "balance_transactions.deductionDetails.fees", balanceTransactionIds: feeRows.map((row) => row.id), fee,
        currency: feeRows[0]?.currency || null, vatBreakdownAvailable: false, reconciledAt: startedAt,
      }};
      const { error: updateError } = await supabase.from("orders").update({
        gateway_fee_actual: fee, gateway_fee_net: fee, gateway_fee_gross: fee,
        gateway_fee_source: "mollie_balance_transaction", gateway_fee_reconciled_at: startedAt, gateway_fee_meta: nextMeta,
      }).eq("id", order.id);
      if (updateError) throw updateError;
      const { error: profitError } = await supabase.rpc("recalculate_order_profitability", { p_order_id: order.id });
      if (profitError) throw profitError;
      reconciled += 1;
      reconciledOrders.push({ order_number: order.order_number, payment_id: paymentId, actual_fee: fee });
    }

    const missing = (orders || []).filter((order: any) => order.mollie_payment_id && !matches.has(String(order.mollie_payment_id)) && order.gateway_fee_actual == null)
      .map((order: any) => ({ order_number: order.order_number, payment_id: order.mollie_payment_id }));
    const finishedAt = new Date().toISOString();
    const result = { ok: true, incremental: Boolean(previousNewestId), pages, reached_previous_newest: reachedPreviousNewest,
      balance_transactions_imported: imported, orders_with_mollie_id: orderByPayment.size, reconciled, protected_skipped: protectedSkipped,
      missing_actual_fee_count: missing.length, reconciled_orders: reconciledOrders, missing: missing.slice(0, 25) };
    await supabase.from("mollie_accounting_sync_state").update({ last_balance_transaction_id: newestTransactionId || previousNewestId,
      last_sync_completed_at: finishedAt, last_error: null, last_result: result, updated_at: finishedAt }).eq("id", true);
    return json(result);
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error);
    if (message.includes("Invalid Authorization header")) {
      message += ` [token_length=${mollieToken.length}, token_prefix=${mollieToken.slice(0, 7)}]`;
    }
    try { await supabase.from("mollie_accounting_sync_state").update({ last_error: message, updated_at: new Date().toISOString() }).eq("id", true); } catch (_) {}
    return json({ ok: false, error: message }, 500);
  }
});

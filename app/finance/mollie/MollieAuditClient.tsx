"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils/currency";

type WebhookEvent = {
  id: string;
  store_slug: string;
  mollie_payment_id: string;
  payment_status: string | null;
  processed: boolean;
  raw_body: unknown;
  error_message: string | null;
  source: string;
  received_at: string;
};

type BalanceTransaction = {
  id: string;
  type: string;
  payment_id: string | null;
  payment_description: string | null;
  currency: string | null;
  initial_amount: number | null;
  result_amount: number | null;
  deductions: number | null;
  fee_amount: number | null;
  created_at: string | null;
};

type SyncState = {
  last_sync_started_at: string | null;
  last_sync_completed_at: string | null;
  last_error: string | null;
  last_result: Record<string, unknown> | null;
};

const dateText = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";

const jsonText = (value: unknown) => {
  try {
    return JSON.stringify(typeof value === "string" ? JSON.parse(value) : value, null, 2);
  } catch {
    return String(value || "{}");
  }
};

const amountText = (value: number | null | undefined, currency: string | null | undefined) => {
  if (value == null) return "—";
  if (!currency || currency === "GBP") return formatCurrency(Number(value));
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number(value));
  } catch {
    return String(value) + " " + currency;
  }
};

export default function MollieAuditClient() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [balances, setBalances] = useState<BalanceTransaction[]>([]);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [view, setView] = useState<"webhooks" | "balances">("webhooks");
  const [status, setStatus] = useState<"all" | "processed" | "failed">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [eventsResult, balancesResult, syncResult] = await Promise.all([
      supabase
        .from("mollie_webhook_events")
        .select("id,store_slug,mollie_payment_id,payment_status,processed,raw_body,error_message,source,received_at")
        .order("received_at", { ascending: false })
        .limit(500),
      supabase
        .from("mollie_balance_transactions")
        .select("id,type,payment_id,payment_description,currency,initial_amount,result_amount,deductions,fee_amount,created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("mollie_accounting_sync_state")
        .select("last_sync_started_at,last_sync_completed_at,last_error,last_result")
        .eq("id", true)
        .maybeSingle(),
    ]);

    const messages = [eventsResult.error, balancesResult.error, syncResult.error].filter(Boolean).map(item => item?.message);
    if (messages.length) setError(messages.join(" | "));
    setEvents((eventsResult.data || []) as WebhookEvent[]);
    setBalances((balancesResult.data || []) as BalanceTransaction[]);
    setSync((syncResult.data || null) as SyncState | null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredEvents = useMemo(() => {
    const query = search.toLowerCase().trim();
    return events.filter(event => {
      if (status === "processed" && !event.processed) return false;
      if (status === "failed" && event.processed) return false;
      if (!query) return true;
      return [event.mollie_payment_id, event.payment_status, event.error_message, event.store_slug]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [events, search, status]);

  const selected = events.find(event => event.id === selectedId) || null;
  const result = sync?.last_result || {};
  const missingFees = Number(result.missing_actual_fee_count || 0);

  return (
    <main className="min-h-screen bg-slate-950 text-white p-4 sm:p-6 space-y-6 max-w-[1800px] mx-auto">
      <header className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <p className="text-cyan-400 text-[10px] font-black uppercase tracking-[.25em]">CentralHub Finance</p>
          <h1 className="text-2xl sm:text-3xl font-black">Mollie Audit Centre</h1>
          <p className="text-sm text-slate-500 mt-1">Webhook events, balance transactions and gateway-fee reconciliation for MalluSpices.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/finance" className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-black uppercase tracking-widest">Finance</Link>
          <Link href="/finance/transactions" className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-black uppercase tracking-widest">Bank Reconciliation</Link>
          <button onClick={load} className="px-4 py-2 rounded-xl bg-cyan-400 text-slate-950 text-[10px] font-black uppercase tracking-widest">Refresh</button>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</div>}

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><p className="text-[10px] text-slate-500 uppercase font-black">Webhook events</p><p className="text-2xl font-black text-white">{events.length}</p><p className="text-[10px] text-slate-600 mt-1">Central audit mirror</p></div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><p className="text-[10px] text-slate-500 uppercase font-black">Processed</p><p className="text-2xl font-black text-emerald-300">{events.filter(event => event.processed).length}</p><p className="text-[10px] text-slate-600 mt-1">Validated outcomes</p></div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><p className="text-[10px] text-slate-500 uppercase font-black">Needs review</p><p className="text-2xl font-black text-amber-300">{events.filter(event => !event.processed).length}</p><p className="text-[10px] text-slate-600 mt-1">No-session or validation failures</p></div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><p className="text-[10px] text-slate-500 uppercase font-black">Balance records</p><p className="text-2xl font-black text-cyan-300">{balances.length}</p><p className="text-[10px] text-slate-600 mt-1">Imported Mollie records</p></div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><p className="text-[10px] text-slate-500 uppercase font-black">Missing actual fees</p><p className={"text-2xl font-black " + (missingFees ? "text-amber-300" : "text-emerald-300")}>{missingFees}</p><p className="text-[10px] text-slate-600 mt-1">From latest accounting run</p></div>
      </section>

      <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-xs text-slate-300">
        <span className="font-black text-cyan-300">Data boundary:</span> Mollie webhook events are received by MalluSpices, sanitized, and mirrored into CentralHub for admin monitoring. Payment secrets and customer payment payloads are not exposed to the browser.
        <span className="block text-slate-500 mt-1">Last accounting sync: {dateText(sync?.last_sync_completed_at)}{sync?.last_error ? " · Error: " + sync.last_error : ""}</span>
      </section>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setView("webhooks")} className={"px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest " + (view === "webhooks" ? "bg-cyan-400 text-slate-950" : "bg-slate-900 border border-slate-800 text-slate-400")}>Webhook Events</button>
        <button onClick={() => setView("balances")} className={"px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest " + (view === "balances" ? "bg-cyan-400 text-slate-950" : "bg-slate-900 border border-slate-800 text-slate-400")}>Balance Transactions</button>
        {view === "webhooks" && <>
          <button onClick={() => setStatus("all")} className={"px-3 py-2 rounded-xl text-[10px] font-black " + (status === "all" ? "bg-slate-700 text-white" : "bg-slate-900 text-slate-500")}>All</button>
          <button onClick={() => setStatus("processed")} className={"px-3 py-2 rounded-xl text-[10px] font-black " + (status === "processed" ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-900 text-slate-500")}>Processed</button>
          <button onClick={() => setStatus("failed")} className={"px-3 py-2 rounded-xl text-[10px] font-black " + (status === "failed" ? "bg-amber-500/20 text-amber-300" : "bg-slate-900 text-slate-500")}>Needs review</button>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search payment ID, status..." className="min-w-[220px] flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none" />
        </>}
      </div>

      {view === "webhooks" && (
        <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
          <div className="p-5 border-b border-slate-800"><h2 className="text-lg font-black">Mollie Webhook Event Log</h2><p className="text-xs text-slate-500 mt-1">Every received Mollie callback is retained, including unprocessed callbacks.</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50 text-[9px] uppercase tracking-widest text-slate-500"><tr><th className="p-4 text-left">Payment</th><th className="p-4 text-left">Status</th><th className="p-4 text-left">Outcome</th><th className="p-4 text-left">Received</th><th className="p-4 text-left">Details</th></tr></thead>
              <tbody className="divide-y divide-slate-800">
                {filteredEvents.map(event => (
                  <tr key={event.id} className="hover:bg-slate-800/30">
                    <td className="p-4"><p className="font-mono text-xs text-white">{event.mollie_payment_id}</p><p className="text-[10px] text-slate-600 uppercase">{event.store_slug}</p></td>
                    <td className="p-4"><span className="rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-1 text-[10px] font-black uppercase">{event.payment_status || "unknown"}</span></td>
                    <td className="p-4">{event.processed ? <span className="rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-1 text-[10px] font-black uppercase">processed</span> : <span className="rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-1 text-[10px] font-black uppercase">needs review</span>}{event.error_message && <p className="text-[10px] text-amber-300 mt-2 max-w-xs">{event.error_message}</p>}</td>
                    <td className="p-4 whitespace-nowrap text-slate-400 text-xs">{dateText(event.received_at)}</td>
                    <td className="p-4"><button onClick={() => setSelectedId(selectedId === event.id ? null : event.id)} className="text-cyan-300 text-xs font-black">{selectedId === event.id ? "Hide" : "Inspect"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !filteredEvents.length && <p className="p-10 text-center text-sm text-slate-500">No Mollie webhook events match this filter.</p>}
          {loading && <p className="p-10 text-center text-sm text-slate-500">Loading Mollie audit…</p>}
          {selected && <div className="border-t border-slate-800 p-5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-black text-white">Event payload</h3><p className="text-xs text-slate-500">{selected.id} · {selected.source}</p></div><button onClick={() => setSelectedId(null)} className="text-xs text-slate-500">Close</button></div><pre className="mt-4 max-h-80 overflow-auto rounded-2xl bg-slate-950 border border-slate-800 p-4 text-[11px] text-slate-300">{jsonText(selected.raw_body)}</pre></div>}
        </section>
      )}

      {view === "balances" && (
        <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
          <div className="p-5 border-b border-slate-800"><h2 className="text-lg font-black">Mollie Balance Transactions</h2><p className="text-xs text-slate-500 mt-1">Reconciliation source used for actual gateway-fee provenance.</p></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-800/50 text-[9px] uppercase tracking-widest text-slate-500"><tr><th className="p-4 text-left">Type</th><th className="p-4 text-left">Payment</th><th className="p-4 text-right">Result</th><th className="p-4 text-right">Fee</th><th className="p-4 text-left">Created</th></tr></thead><tbody className="divide-y divide-slate-800">{balances.map(tx => <tr key={tx.id}><td className="p-4 text-slate-300">{tx.type}</td><td className="p-4 font-mono text-xs text-slate-400">{tx.payment_id || "—"}<p className="text-[10px] text-slate-600 font-sans">{tx.payment_description || ""}</p></td><td className="p-4 text-right text-white">{amountText(tx.result_amount, tx.currency)}</td><td className="p-4 text-right text-amber-300">{amountText(tx.fee_amount, tx.currency)}</td><td className="p-4 text-xs text-slate-500 whitespace-nowrap">{dateText(tx.created_at)}</td></tr>)}</tbody></table></div>
          {!loading && !balances.length && <p className="p-10 text-center text-sm text-slate-500">No Mollie balance transactions found.</p>}
        </section>
      )}
    </main>
  );
}

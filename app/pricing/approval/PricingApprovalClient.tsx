'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils/currency';

type Row = {
  product_id: string; product_name: string; current_price: number; recommended_price: number;
  expected_daily_profit: number; expected_profit_per_unit: number; expected_margin: number;
  pricing_status: string; approval_status: string; execution_status: string; price_locked: boolean;
  decision_reason: string | null; generated_at: string;
};
const money = (v: unknown) => formatCurrency(Number(v || 0));

export default function PricingApprovalClient() {
  const [rows, setRows] = useState<Row[]>([]); const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all'|'pending'|'approved'|'blocked'|'executed'>('all');
  const load = useCallback(async () => { setLoading(true); const { data, error } = await supabase.rpc('get_pricing_approval_queue', { p_limit: 500 }); if (error) setNotice(error.message); else setRows((data || []) as Row[]); setLoading(false); }, []);
  useEffect(() => { load(); }, [load]);

  const validate = async (row: Row) => {
    const { data, error } = await supabase.rpc('validate_pricing_execution_for_product', { p_product_id: row.product_id });
    if (error) return { ok: false, message: error.message };
    const result = Array.isArray(data) ? data[0] : data;
    return { ok: Boolean(result?.can_execute), message: result?.reason || 'BLOCKED' };
  };
  const approve = async (row: Row) => {
    setBusy(row.product_id); setNotice(null); const check = await validate(row);
    if (!check.ok) { setNotice(`${row.product_name}: ${check.message}`); setBusy(null); return; }
    const { data, error } = await supabase.rpc('approve_pricing_recommendation', { p_product_id: row.product_id, p_approved_by: 'pricing-control-centre' });
    if (error || !data?.success) setNotice(error?.message || data?.error || 'Approval failed'); else setNotice(`${row.product_name} approved. It is ready for controlled execution.`);
    await load(); setBusy(null);
  };
  const reject = async (row: Row) => {
    if (!window.confirm(`Reject the recommendation for ${row.product_name}?`)) return;
    setBusy(row.product_id); setNotice(null);
    const { data, error } = await supabase.rpc('reject_pricing_recommendation', { p_product_id: row.product_id, p_reason: 'Rejected from approval queue', p_rejected_by: 'pricing-control-centre' });
    if (error || !data?.success) setNotice(error?.message || data?.error || 'Rejection failed'); else setNotice(`${row.product_name} rejected.`);
    await load(); setBusy(null);
  };
  const execute = async (row: Row) => {
    setBusy(row.product_id); setNotice(null); const check = await validate(row);
    if (!check.ok) { setNotice(`${row.product_name}: ${check.message}`); setBusy(null); return; }
    if (row.approval_status !== 'approved') { setNotice(`${row.product_name}: approve it before execution.`); setBusy(null); return; }
    if (!window.confirm(`Execute ${row.product_name} at ${money(row.recommended_price)}?\n\nCurrent: ${money(row.current_price)}\nExpected daily profit: ${money(row.expected_daily_profit)}`)) { setBusy(null); return; }
    const { data, error } = await supabase.rpc('execute_approved_pricing_recommendation', { p_product_id: row.product_id, p_executed_by: 'pricing-control-centre' });
    if (error || !data?.success) setNotice(error?.message || data?.error || 'Execution failed'); else setNotice(`${row.product_name}: price execution completed.`);
    await load(); setBusy(null);
  };
  const filtered = useMemo(() => rows.filter(r => filter === 'all' || r.approval_status === filter || (filter === 'blocked' && (r.pricing_status === 'MISSING_COST' || r.price_locked))), [rows, filter]);
  const counts = useMemo(() => ({ pending: rows.filter(r => r.approval_status === 'pending').length, approved: rows.filter(r => r.approval_status === 'approved').length, blocked: rows.filter(r => r.pricing_status === 'MISSING_COST' || r.price_locked).length, executed: rows.filter(r => r.execution_status === 'executed').length }), [rows]);
  const potential = filtered.reduce((n, r) => n + Number(r.expected_daily_profit || 0), 0);

  return <main className="p-4 sm:p-6 lg:p-8 max-w-[1700px] mx-auto space-y-6">
    <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4"><div><p className="text-[10px] text-cyan-400 font-black uppercase tracking-[.25em]">Commercial Control</p><h1 className="text-3xl font-black text-white">Pricing Approval Centre</h1><p className="text-sm text-slate-500 mt-1">Review, validate, approve and execute pricing recommendations. Nothing changes without controlled approval.</p></div><div className="flex gap-2"><Link href="/pricing" className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-black text-white">Pricing Control Centre</Link><button onClick={load} className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-black">Refresh</button></div></header>
    {notice && <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{notice}</div>}
    <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">{[['Pending',counts.pending,'text-amber-300'],['Approved',counts.approved,'text-cyan-300'],['Blocked',counts.blocked,'text-rose-300'],['Executed',counts.executed,'text-emerald-300'],['Potential daily profit',money(potential),'text-white']].map(([l,v,c])=><div key={String(l)} className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{l}</p><p className={`text-xl font-black mt-2 ${c}`}>{v}</p></div>)}</section>
    <div className="flex gap-2 flex-wrap">{(['all','pending','approved','blocked','executed'] as const).map(f=><button key={f} onClick={()=>setFilter(f)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${filter===f?'bg-cyan-500/10 border-cyan-500/30 text-cyan-300':'bg-slate-900 border-slate-800 text-slate-500'}`}>{f}</button>)}</div>
    <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden"><div className="p-5 border-b border-slate-800"><h2 className="text-xl font-black text-white">Approval Queue</h2><p className="text-xs text-slate-500 mt-1">Server-side data-quality validation runs before approval and again before execution.</p></div>
      {loading ? <div className="p-12 text-center text-slate-500">Loading approval queue…</div> : <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-950/60"><tr>{['Product','Current','Recommended','Daily profit','Margin','Strategy','Approval','Execution','Data','Actions'].map(h=><th key={h} className="p-3 text-left text-[9px] text-slate-500 font-black uppercase whitespace-nowrap">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-800">{filtered.map(r=>{const blocked=r.pricing_status==='MISSING_COST'||r.price_locked;return <tr key={r.product_id} className="hover:bg-slate-800/30"><td className="p-3"><div className="font-black text-slate-100">{r.product_name}</div><div className="text-[9px] text-slate-600">{r.decision_reason || r.pricing_status}</div></td><td className="p-3">{money(r.current_price)}</td><td className="p-3 font-black text-cyan-300">{money(r.recommended_price)}</td><td className="p-3 font-black">{money(r.expected_daily_profit)}</td><td className="p-3">{Number(r.expected_margin||0).toFixed(1)}%</td><td className="p-3"><span className="px-2 py-1 rounded-full bg-slate-800 text-slate-300 text-[8px] font-black">{r.pricing_status}</span></td><td className="p-3">{r.approval_status}</td><td className="p-3">{r.execution_status}</td><td className="p-3">{blocked?<span className="text-rose-400 font-black">BLOCKED</span>:<span className="text-emerald-400 font-black">VALIDATE ON ACTION</span>}</td><td className="p-3"><div className="flex gap-2">{r.approval_status==='pending'&&!blocked&&<button disabled={busy===r.product_id} onClick={()=>approve(r)} className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[9px] font-black uppercase disabled:opacity-40">Approve</button>}{r.approval_status==='pending'&&<button disabled={busy===r.product_id} onClick={()=>reject(r)} className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-[9px] font-black uppercase disabled:opacity-40">Reject</button>}{r.approval_status==='approved'&&<button disabled={busy===r.product_id} onClick={()=>execute(r)} className="px-2.5 py-1.5 rounded-lg bg-cyan-600 text-white text-[9px] font-black uppercase disabled:opacity-40">Execute</button>}</div></td></tr>})}</tbody></table></div>}
      {!loading&&!filtered.length&&<div className="p-12 text-center text-slate-500">No recommendations in this view.</div>}
    </section>
  </main>;
}

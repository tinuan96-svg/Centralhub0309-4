'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils/currency';

type Row = {
  product_id: string;
  product_name: string;
  current_price: number;
  recommended_price: number;
  expected_daily_profit: number;
  expected_profit_per_unit: number;
  expected_margin: number;
  pricing_status: string;
  approval_status: string;
  execution_status: string;
  price_locked: boolean;
  decision_reason: string | null;
  generated_at: string;
  recommendation_status: string;
  data_quality_status: string;
  data_quality_reasons: string[];
  execution_blocked: boolean;
  cost_price: number;
  profit_floor_price: number;
  required_profit_price: number;
  optimization_action: string | null;
};

type Filter = 'all' | 'pending' | 'actionable' | 'approved' | 'blocked' | 'executed';

const money = (v: unknown) => formatCurrency(Number(v || 0));
const isBlocked = (row: Row) => Boolean(row.execution_blocked || row.price_locked || row.recommendation_status !== 'ready' || row.data_quality_status !== 'passed');
const reasonText = (row: Row) => {
  const reasons = Array.isArray(row.data_quality_reasons) ? row.data_quality_reasons : [];
  return reasons.length ? reasons.join(', ').replaceAll('_', ' ') : row.decision_reason || row.pricing_status || 'Review required';
};

export default function PricingApprovalClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_pricing_approval_queue', { p_limit: 500 });
    if (error) {
      setLoadError(error.message);
    } else {
      setRows((data || []) as Row[]);
      setLoadError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const validate = async (row: Row) => {
    const { data, error } = await supabase.rpc('validate_pricing_execution_for_product', { p_product_id: row.product_id });
    if (error) return { ok: false, message: error.message };
    const result = Array.isArray(data) ? data[0] : data;
    return { ok: Boolean(result?.can_execute), message: result?.reason || 'BLOCKED' };
  };

  const approve = async (row: Row) => {
    if (isBlocked(row)) { setNotice(`${row.product_name}: ${reasonText(row)}`); return; }
    setBusy(row.product_id);
    setNotice(null);
    const check = await validate(row);
    if (!check.ok) { setNotice(`${row.product_name}: ${check.message}`); setBusy(null); await load(); return; }
    const { data, error } = await supabase.rpc('approve_pricing_recommendation', { p_product_id: row.product_id, p_approved_by: 'pricing-control-centre' });
    if (error || !data?.success) setNotice(error?.message || data?.error || 'Approval failed');
    else setNotice(`${row.product_name} approved. It is ready for controlled execution.`);
    await load();
    setBusy(null);
  };

  const reject = async (row: Row) => {
    if (!window.confirm(`Reject the recommendation for ${row.product_name}?`)) return;
    setBusy(row.product_id);
    setNotice(null);
    const { data, error } = await supabase.rpc('reject_pricing_recommendation', { p_product_id: row.product_id, p_reason: 'Rejected from approval queue', p_rejected_by: 'pricing-control-centre' });
    if (error || !data?.success) setNotice(error?.message || data?.error || 'Rejection failed');
    else setNotice(`${row.product_name} rejected.`);
    await load();
    setBusy(null);
  };

  const execute = async (row: Row) => {
    if (isBlocked(row)) { setNotice(`${row.product_name}: ${reasonText(row)}`); return; }
    setBusy(row.product_id);
    setNotice(null);
    const check = await validate(row);
    if (!check.ok) { setNotice(`${row.product_name}: ${check.message}`); setBusy(null); await load(); return; }
    if (row.approval_status !== 'approved') { setNotice(`${row.product_name}: approve it before execution.`); setBusy(null); return; }
    if (!window.confirm(`Execute ${row.product_name} at ${money(row.recommended_price)}?\n\nCurrent: ${money(row.current_price)}\nExpected daily profit: ${money(row.expected_daily_profit)}`)) { setBusy(null); return; }
    const { data, error } = await supabase.rpc('execute_approved_pricing_recommendation', { p_product_id: row.product_id, p_executed_by: 'pricing-control-centre' });
    if (error || !data?.success) setNotice(error?.message || data?.error || 'Execution failed');
    else setNotice(`${row.product_name}: price execution completed.`);
    await load();
    setBusy(null);
  };

  const actionableRows = useMemo(() => rows.filter(row => !isBlocked(row) && ['pending', 'approved'].includes(row.approval_status) && row.execution_status !== 'executed'), [rows]);
  const filtered = useMemo(() => rows.filter(row => {
    if (filter === 'all') return true;
    if (filter === 'blocked') return isBlocked(row);
    if (filter === 'actionable') return !isBlocked(row) && ['pending', 'approved'].includes(row.approval_status) && row.execution_status !== 'executed';
    if (filter === 'executed') return row.execution_status === 'executed';
    return row.approval_status === filter;
  }), [rows, filter]);

  const counts = useMemo(() => ({
    active: rows.length,
    pending: rows.filter(row => row.approval_status === 'pending').length,
    actionable: actionableRows.length,
    blocked: rows.filter(isBlocked).length,
    approved: rows.filter(row => row.approval_status === 'approved').length,
    executed: rows.filter(row => row.execution_status === 'executed').length,
  }), [rows, actionableRows]);

  const actionablePotential = useMemo(
    () => actionableRows.reduce((sum, row) => sum + Number(row.expected_daily_profit || 0), 0),
    [actionableRows]
  );

  return (
    <main className="p-4 sm:p-6 lg:p-8 max-w-[1700px] mx-auto space-y-6">
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-[10px] text-cyan-400 font-black uppercase tracking-[.25em]">Commercial Control</p>
          <h1 className="text-3xl font-black text-white">Pricing Approval Centre</h1>
          <p className="text-sm text-slate-500 mt-1">Only active products are shown. Recommendations remain blocked until server-side quality checks pass; nothing changes without controlled approval.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/pricing" className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-black text-white">Pricing Control Centre</Link>
          <button disabled={loading} onClick={load} className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-black disabled:opacity-50">{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </header>

      {loadError && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <span>{loadError}. Existing queue values are kept; no zero fallback is substituted.</span>
          <button onClick={load} className="rounded-lg border border-rose-400/30 px-3 py-1.5 text-xs font-black uppercase">Retry</button>
        </div>
      )}
      {notice && <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{notice}</div>}

      <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {[
          ['Active queue', counts.active, 'text-white'],
          ['Pending', counts.pending, 'text-amber-300'],
          ['Actionable', counts.actionable, 'text-emerald-300'],
          ['Blocked', counts.blocked, 'text-rose-300'],
          ['Approved', counts.approved, 'text-cyan-300'],
          ['Executed', counts.executed, 'text-emerald-300'],
          ['Actionable daily profit', money(actionablePotential), 'text-white'],
        ].map(([label, value, klass]) => (
          <div key={String(label)} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{label}</p>
            <p className={`text-xl font-black mt-2 ${klass}`}>{value}</p>
          </div>
        ))}
      </section>

      <div className="flex gap-2 flex-wrap">
        {(['all', 'pending', 'actionable', 'approved', 'blocked', 'executed'] as Filter[]).map(current => (
          <button key={current} onClick={() => setFilter(current)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${filter === current ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>{current}</button>
        ))}
      </div>

      <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
        <div className="p-5 border-b border-slate-800">
          <h2 className="text-xl font-black text-white">Approval Queue</h2>
          <p className="text-xs text-slate-500 mt-1">The queue uses the same server-side block state used at approval and execution. Block reasons are visible here and validation runs again before any action.</p>
        </div>
        {loading && !rows.length ? (
          <div className="p-12 text-center text-slate-500">Loading approval queue…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-950/60"><tr>{['Product', 'Current', 'Recommended', 'Daily profit', 'Margin', 'Strategy', 'Approval', 'Execution', 'Data', 'Actions'].map(header => <th key={header} className="p-3 text-left text-[9px] text-slate-500 font-black uppercase whitespace-nowrap">{header}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map(row => {
                  const blocked = isBlocked(row);
                  return (
                    <tr key={row.product_id} className="hover:bg-slate-800/30">
                      <td className="p-3"><div className="font-black text-slate-100">{row.product_name}</div><div className="text-[9px] text-slate-600">{row.decision_reason || row.pricing_status}</div></td>
                      <td className="p-3">{money(row.current_price)}</td>
                      <td className="p-3 font-black text-cyan-300">{money(row.recommended_price)}</td>
                      <td className="p-3 font-black">{money(row.expected_daily_profit)}</td>
                      <td className="p-3">{Number(row.expected_margin || 0).toFixed(1)}%</td>
                      <td className="p-3"><span className="px-2 py-1 rounded-full bg-slate-800 text-slate-300 text-[8px] font-black">{row.pricing_status}</span></td>
                      <td className="p-3">{row.approval_status}</td>
                      <td className="p-3">{row.execution_status}</td>
                      <td className="p-3 min-w-[180px]">
                        {blocked ? <><span className="text-rose-400 font-black">BLOCKED</span><div className="mt-1 text-[9px] text-slate-500">{reasonText(row)}</div></> : <><span className="text-emerald-400 font-black">PASSED</span><div className="mt-1 text-[9px] text-slate-500">Revalidated on action</div></>}
                      </td>
                      <td className="p-3"><div className="flex gap-2">
                        {row.approval_status === 'pending' && !blocked && <button disabled={busy === row.product_id} onClick={() => approve(row)} className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[9px] font-black uppercase disabled:opacity-40">Approve</button>}
                        {row.approval_status === 'pending' && <button disabled={busy === row.product_id} onClick={() => reject(row)} className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-[9px] font-black uppercase disabled:opacity-40">Reject</button>}
                        {row.approval_status === 'approved' && !blocked && <button disabled={busy === row.product_id} onClick={() => execute(row)} className="px-2.5 py-1.5 rounded-lg bg-cyan-600 text-white text-[9px] font-black uppercase disabled:opacity-40">Execute</button>}
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !filtered.length && <div className="p-12 text-center text-slate-500">No recommendations in this view.</div>}
      </section>
    </main>
  );
}

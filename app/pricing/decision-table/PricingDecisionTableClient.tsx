'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils/currency';

type DecisionRow = {
  product_id: string;
  product_name: string;
  sku?: string | null;
  cogs: number;
  average_variable_expense_per_unit: number;
  allocated_operating_expense_per_unit: number;
  expense_allocation_per_unit: number;
  full_cost_reference_price: number;
  current_price: number;
  current_profit_per_unit: number;
  current_profit_percent: number;
  daily_target_price: number;
  daily_target_profit_per_unit: number;
  daily_target_profit_percent: number;
  lowest_competitor_price?: number | null;
  cheapest_competitor_name?: string | null;
  competitor_scanned_at?: string | null;
  below_market_price?: number | null;
  below_market_profit_per_unit?: number | null;
  below_market_profit_percent?: number | null;
  suggested_price?: number | null;
  suggested_profit_per_unit?: number | null;
  suggested_profit_percent?: number | null;
  direct_economic_floor: number;
  pricing_status?: string | null;
  data_quality_status?: string | null;
  data_quality_reasons?: string[] | null;
  execution_blocked?: boolean;
  price_locked?: boolean;
  max_price_increase_percent?: number | null;
  max_price_decrease_percent?: number | null;
};

type PlanningSummary = {
  lookback_days: number;
  minimum_order_value: number;
  qualifying_orders: number;
  average_order_value: number;
  actual_orders_per_day: number;
  minimum_orders_per_day: number;
  planning_orders_per_day: number;
  using_estimated_order_floor: boolean;
  average_units_per_order: number;
  planning_units_per_day: number;
  average_variable_expense_per_unit: number;
  daily_operating_expenses: number;
  allocated_operating_expense_per_unit: number;
  total_expense_allocation_per_unit: number;
  daily_profit_target: number;
  target_profit_per_planning_unit: number;
};

type CandidateSource = 'COGS_PLUS_EXPENSE' | 'DAILY_TARGET' | 'LOWEST_COMPETITOR' | 'BELOW_MARKET_10P' | 'SUGGESTED';

const SOURCE_LABELS: Record<CandidateSource, string> = {
  COGS_PLUS_EXPENSE: 'COGS + Expense',
  DAILY_TARGET: 'Daily Target Price',
  LOWEST_COMPETITOR: 'Lowest Competitor',
  BELOW_MARKET_10P: 'Below Market -10p',
  SUGGESTED: 'Suggested Price',
};

const money = (value: unknown) => value == null || value === '' ? '—' : formatCurrency(Number(value));
const pct = (value: unknown) => value == null || value === '' ? '—' : `${Number(value).toFixed(1)}%`;
const tone = (value: unknown) => Number(value ?? 0) < 0 ? 'text-rose-400' : Number(value ?? 0) > 0 ? 'text-emerald-400' : 'text-slate-400';

function candidateValue(row: DecisionRow, source?: CandidateSource | ''): number | null {
  if (!source) return null;
  if (source === 'COGS_PLUS_EXPENSE') return row.full_cost_reference_price;
  if (source === 'DAILY_TARGET') return row.daily_target_price;
  if (source === 'LOWEST_COMPETITOR') return row.lowest_competitor_price ?? null;
  if (source === 'BELOW_MARKET_10P') return row.below_market_price ?? null;
  return row.suggested_price ?? null;
}

export default function PricingDecisionTableClient() {
  const [rows, setRows] = useState<DecisionRow[]>([]);
  const [summary, setSummary] = useState<PlanningSummary | null>(null);
  const [choices, setChoices] = useState<Record<string, CandidateSource | ''>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [summaryResult, rowsResult] = await Promise.all([
      supabase.rpc('get_pricing_planning_summary', { p_store_id: null, p_days: null }),
      supabase.rpc('get_pricing_decision_table', { p_limit: 500, p_offset: 0, p_store_id: null, p_product_id: null }),
    ]);
    const errors: string[] = [];
    if (summaryResult.error) errors.push(summaryResult.error.message); else setSummary(summaryResult.data as PlanningSummary);
    if (rowsResult.error) errors.push(rowsResult.error.message); else setRows((rowsResult.data || []) as DecisionRow[]);
    setError(errors.length ? errors.join(' · ') : null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => `${row.product_name} ${row.sku || ''} ${row.cheapest_competitor_name || ''}`.toLowerCase().includes(q));
  }, [rows, search]);

  const applySelected = async (row: DecisionRow) => {
    const source = choices[row.product_id];
    if (!source) return;
    const value = candidateValue(row, source);
    if (value == null) {
      setMessage(`${SOURCE_LABELS[source]} is unavailable for ${row.product_name}.`);
      return;
    }

    const detail = [
      row.product_name,
      '',
      `Selected: ${SOURCE_LABELS[source]}`,
      `Current price: ${money(row.current_price)}`,
      `New price: ${money(value)}`,
      `COGS + expense: ${money(row.full_cost_reference_price)}`,
      `Direct economic floor: ${money(row.direct_economic_floor)}`,
      row.lowest_competitor_price != null ? `Lowest competitor: ${money(row.lowest_competitor_price)} · ${row.cheapest_competitor_name || 'Unknown competitor'}` : 'Lowest competitor: no valid fresh match',
      '',
      'This is a manual price decision. Server safety checks will run again before changing the product price.',
    ].join('\n');
    if (!window.confirm(detail)) return;

    setBusyId(row.product_id);
    setMessage(null);
    const result = await supabase.rpc('apply_pricing_table_candidate', {
      p_product_id: row.product_id,
      p_price_source: source,
      p_confirmed: true,
      p_initiated_by: 'pricing-decision-table',
    });
    setBusyId(null);

    if (result.error || !result.data?.success) {
      const code = result.error?.message || result.data?.error || 'Price application failed';
      const extra = result.data?.maximum_allowed_price ? ` Maximum allowed: ${money(result.data.maximum_allowed_price)}.`
        : result.data?.minimum_allowed_price ? ` Minimum allowed: ${money(result.data.minimum_allowed_price)}.`
        : result.data?.direct_economic_floor ? ` Direct economic floor: ${money(result.data.direct_economic_floor)}.` : '';
      setMessage(`${row.product_name}: ${String(code).replaceAll('_', ' ')}.${extra}`);
      return;
    }

    setMessage(`${row.product_name}: ${SOURCE_LABELS[source]} applied manually — ${money(result.data.old_price)} → ${money(result.data.new_price)}.`);
    setChoices((old) => ({ ...old, [row.product_id]: '' }));
    await load();
  };

  const summaryCards = summary ? [
    ['Qualifying paid orders', `${summary.qualifying_orders} > ${money(summary.minimum_order_value)}`],
    ['Average order value', money(summary.average_order_value)],
    ['Actual orders/day', Number(summary.actual_orders_per_day).toFixed(2)],
    ['Planning orders/day', `${Number(summary.planning_orders_per_day).toFixed(2)}${summary.using_estimated_order_floor ? ' · EST.' : ' · ACTUAL'}`],
    ['Average units/order', Number(summary.average_units_per_order).toFixed(2)],
    ['Planning units/day', Number(summary.planning_units_per_day).toFixed(2)],
    ['Expense allocation/unit', money(summary.total_expense_allocation_per_unit)],
    ['Daily profit target', money(summary.daily_profit_target)],
  ] : [];

  return <div className="p-4 sm:p-6 lg:p-8 max-w-[1900px] mx-auto space-y-5">
    <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
      <div>
        <p className="text-[10px] text-cyan-400 font-black uppercase tracking-[.25em]">Commercial Control</p>
        <h1 className="text-3xl font-black text-white">Pricing Decision Table</h1>
        <p className="text-sm text-slate-400 mt-2 max-w-4xl">Compare full cost, current profitability, the £100/day planning target, authoritative competitor pricing, the 10p-below-market scenario and the guarded engine suggestion before manually choosing a selling price.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/pricing" className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-black uppercase">Pricing Control Centre</Link>
        <Link href="/pricing/approval" className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-black uppercase">Approval Centre</Link>
        <button onClick={load} disabled={loading} className="px-4 py-2 rounded-xl bg-cyan-600 text-xs font-black uppercase disabled:opacity-40">{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
    </div>

    {summary && <>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {summaryCards.map(([label, value]) => <div key={label} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{label}</p>
          <p className="text-lg font-black text-white mt-1">{value}</p>
        </div>)}
      </div>
      <div className={`rounded-2xl border px-4 py-3 text-sm ${summary.using_estimated_order_floor ? 'border-amber-500/20 bg-amber-500/5 text-amber-200' : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200'}`}>
        {summary.using_estimated_order_floor
          ? `Planning floor active: actual qualifying run-rate is ${Number(summary.actual_orders_per_day).toFixed(2)} orders/day, so expense allocation uses ${Number(summary.minimum_orders_per_day).toFixed(0)} orders/day until actual qualifying paid orders above ${money(summary.minimum_order_value)} exceed that run-rate.`
          : `Actual run-rate active: qualifying paid orders are averaging ${Number(summary.actual_orders_per_day).toFixed(2)} orders/day, above the ${Number(summary.minimum_orders_per_day).toFixed(0)}-order planning floor.`}
        {' '}Variable order expense contributes {money(summary.average_variable_expense_per_unit)}/unit and allocated operating expense contributes {money(summary.allocated_operating_expense_per_unit)}/unit.
      </div>
    </>}

    {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}
    {message && <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div>}

    <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-white">Selling Price Comparison</h2>
          <p className="text-xs text-slate-500 mt-1">Competitor values are fresh authoritative matches only. Negative profit scenarios remain visible for analysis but are blocked by the direct economic floor when applying.</p>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product, SKU or competitor…" className="w-full md:w-80 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-500" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1800px] text-xs">
          <thead className="bg-slate-950/80 sticky top-0 z-10">
            <tr className="text-left text-[9px] uppercase tracking-wider text-slate-500">
              <th className="p-3 sticky left-0 bg-slate-950 z-20">Product</th>
              <th className="p-3">COGS</th>
              <th className="p-3">Expense Allocation</th>
              <th className="p-3">COGS + Expense</th>
              <th className="p-3">Current Price / Profit</th>
              <th className="p-3">Daily Target Price</th>
              <th className="p-3">Lowest Competitor</th>
              <th className="p-3">Below Market -10p</th>
              <th className="p-3">Suggested Price</th>
              <th className="p-3">Engine</th>
              <th className="p-3 min-w-[190px]">Choose Price Column</th>
              <th className="p-3">Apply Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {visibleRows.map((row) => {
              const choice = choices[row.product_id] || '';
              const noCogs = Number(row.cogs || 0) <= 0;
              return <tr key={row.product_id} className="align-top hover:bg-slate-800/30">
                <td className="p-3 sticky left-0 bg-slate-900 z-[5] min-w-[190px]"><b className="text-white">{row.product_name}</b><div className="text-[9px] text-slate-500 mt-1">{row.sku || '—'}</div></td>
                <td className="p-3 font-bold">{money(row.cogs)}{noCogs && <div className="text-[9px] text-rose-400 font-black mt-1">MISSING COGS</div>}</td>
                <td className="p-3 min-w-[150px]"><b>{money(row.expense_allocation_per_unit)}</b><div className="text-[9px] text-slate-500 mt-1">Variable {money(row.average_variable_expense_per_unit)} + OpEx {money(row.allocated_operating_expense_per_unit)}</div></td>
                <td className="p-3"><b className="text-amber-300">{money(row.full_cost_reference_price)}</b></td>
                <td className="p-3 min-w-[145px]"><b>{money(row.current_price)}</b><div className={`mt-1 ${tone(row.current_profit_per_unit)}`}>Profit {money(row.current_profit_per_unit)} · {pct(row.current_profit_percent)}</div></td>
                <td className="p-3 min-w-[145px]"><b className="text-cyan-300">{money(row.daily_target_price)}</b><div className="text-[9px] text-slate-500 mt-1">Target profit {money(row.daily_target_profit_per_unit)} · {pct(row.daily_target_profit_percent)}</div></td>
                <td className="p-3 min-w-[160px]">{row.lowest_competitor_price == null ? <span className="text-slate-500">No valid match</span> : <><b>{money(row.lowest_competitor_price)}</b><div className="text-[9px] text-slate-400 mt-1">{row.cheapest_competitor_name || 'Unknown'}</div></>}</td>
                <td className="p-3 min-w-[150px]">{row.below_market_price == null ? <span className="text-slate-500">Not applicable</span> : <><b>{money(row.below_market_price)}</b><div className={`mt-1 ${tone(row.below_market_profit_per_unit)}`}>Profit {money(row.below_market_profit_per_unit)} · {pct(row.below_market_profit_percent)}</div></>}</td>
                <td className="p-3 min-w-[150px]">{row.suggested_price == null ? '—' : <><b className="text-cyan-300">{money(row.suggested_price)}</b><div className={`mt-1 ${tone(row.suggested_profit_per_unit)}`}>Profit {money(row.suggested_profit_per_unit)} · {pct(row.suggested_profit_percent)}</div></>}</td>
                <td className="p-3 min-w-[150px]"><div className={row.data_quality_status === 'passed' ? 'text-emerald-400 font-black' : 'text-amber-300 font-black'}>{row.data_quality_status?.toUpperCase() || '—'}</div><div className="text-[9px] text-slate-500 mt-1">{row.pricing_status || '—'}</div>{row.price_locked && <div className="text-[9px] text-rose-400 mt-1">PRICE LOCKED</div>}</td>
                <td className="p-3">
                  <select value={choice} onChange={(e) => setChoices((old) => ({ ...old, [row.product_id]: e.target.value as CandidateSource }))} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white">
                    <option value="">Select column…</option>
                    <option value="COGS_PLUS_EXPENSE">COGS + Expense</option>
                    <option value="DAILY_TARGET">Daily Target Price</option>
                    {row.lowest_competitor_price != null && <option value="LOWEST_COMPETITOR">Lowest Competitor</option>}
                    {row.below_market_price != null && <option value="BELOW_MARKET_10P">Below Market -10p</option>}
                    {row.suggested_price != null && <option value="SUGGESTED">Suggested Price</option>}
                  </select>
                  {choice && <div className="text-[10px] text-cyan-300 font-black mt-2">Selected: {money(candidateValue(row, choice))}</div>}
                </td>
                <td className="p-3"><button disabled={!choice || busyId === row.product_id || row.price_locked || noCogs} onClick={() => applySelected(row)} className="px-3 py-2 rounded-lg bg-cyan-600 text-white text-[10px] font-black uppercase whitespace-nowrap disabled:opacity-30">{busyId === row.product_id ? 'Applying…' : 'Review & Apply'}</button></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      {!loading && visibleRows.length === 0 && <div className="p-10 text-center text-slate-500">No products match this search.</div>}
    </div>

    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-200 leading-5">
      Manual table selection is intentionally separate from the engine recommendation workflow. The server recalculates the chosen column and still blocks missing COGS, price locks, prices below the direct economic floor, and moves outside the configured maximum increase/decrease limits. Nothing is auto-applied.
    </div>
  </div>;
}

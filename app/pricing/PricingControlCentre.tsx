'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils/currency';

const TABS = [
  ['overview', 'Overview'],
  ['fixing', 'Price Fixing'],
  ['weekly', 'Weekly Strategy'],
  ['competitors', 'Competitors'],
  ['rules', 'Pricing Rules'],
  ['history', 'Price History'],
] as const;

type Row = any;

function money(v: any) { return formatCurrency(Number(v || 0)); }
function statusClass(s: string) {
  if (s === 'MARKET_BELOW_PROFIT' || s === 'BELOW_TARGET') return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  if (s === 'NEAR_TARGET' || s === 'REVIEW_REQUIRED') return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  if (s === 'ABOVE_TARGET' || s === 'MARKET_ALIGNED') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  return 'text-slate-300 bg-slate-800 border-slate-700';
}

export default function PricingControlCentre({ initialTab = 'overview' }: { initialTab?: string }) {
  const [tab, setTab] = useState(TABS.some(t => t[0] === initialTab) ? initialTab : 'overview');
  const [dashboard, setDashboard] = useState<any>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Row | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, rowRes, compRes, histRes, settingsRes] = await Promise.all([
        supabase.rpc('get_pricing_dashboard', { p_period_days: 7 }),
        supabase.rpc('get_pricing_control_rows', { p_limit: 200, p_offset: 0 }),
        supabase.from('competitor_prices').select('id,product_id,competitor_id,price,source_product_name,source_brand,source_size,source_variant,source_stock_status,source_unit_value,source_unit_type,normalised_price_per_kg,data_quality_state,match_confidence,match_status,last_scanned_at,is_conditional,source_regular_price,source_sale_price,promotion_detail,product_url,competitors(name),products(name,sku)').order('last_scanned_at', { ascending: false }),
        supabase.from('price_change_audit').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('pricing_settings').select('*').is('store_id', null).limit(1).maybeSingle(),
      ]);
      if (dash.data) setDashboard(dash.data);
      if (rowRes.data) setRows(rowRes.data.map((x: any) => x));
      if (compRes.data) setCompetitors(compRes.data);
      if (histRes.data) setHistory(histRes.data);
      if (settingsRes.data) setSettings(settingsRes.data);
    } catch (e: any) { setNotice(e?.message || 'Unable to load pricing centre'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const changeTab = (next: string) => { setTab(next); window.history.replaceState(null, '', `/pricing?tab=${next}`); };
  const selectedRows = useMemo(() => rows.filter(r => selectedIds.has(r.product_id)), [rows, selectedIds]);
  const totals = useMemo(() => ({
    increases: selectedRows.filter(r => Number(r.recommended_price) > Number(r.current_price)).length,
    decreases: selectedRows.filter(r => Number(r.recommended_price) < Number(r.current_price)).length,
    unchanged: selectedRows.filter(r => Number(r.recommended_price) === Number(r.current_price)).length,
    dailyProfit: selectedRows.reduce((n, r) => n + Number(r.expected_daily_profit || 0), 0),
  }), [selectedRows]);

  async function applyOne(row: Row, approved = false) {
    if (!row) return;
    const next = Number(row.recommended_price);
    const current = Number(row.current_price);
    const floor = Number(row.profit_floor_price);
    if (!approved) {
      const message = `${row.product_name}\n\nCurrent: ${money(current)}\nNew: ${money(next)}\nChange: ${money(next-current)}\nExpected margin: ${Number(row.expected_margin || 0).toFixed(1)}%\nExpected profit/unit: ${money(row.expected_profit_per_unit)}\n\n${next < floor ? 'WARNING: below profit floor. ' : ''}Apply this price?`;
      if (!window.confirm(message)) return;
      approved = true;
    }
    const res = await supabase.rpc('apply_pricing_recommendation', { p_product_id: row.product_id, p_new_price: next, p_manually_approved: approved, p_initiated_by: 'pricing-control-centre', p_reason: row.decision_reason });
    if (res.error || !res.data?.success) { setNotice(res.error?.message || res.data?.error || 'Price was not applied'); return; }
    setNotice(`Applied ${money(next)} to ${row.product_name}. Existing product-price propagation will distribute the update.`);
    await load();
  }

  async function bulkApply() {
    if (!selectedRows.length) return;
    if (!window.confirm(`${selectedRows.length} products selected\n\nIncreases: ${totals.increases}\nDecreases: ${totals.decreases}\nUnchanged: ${totals.unchanged}\nExpected daily profit across selected products: ${money(totals.dailyProfit)}\n\nReview/approve this bulk change?`)) return;
    for (const row of selectedRows) await applyOne(row, true);
    setSelectedIds(new Set());
  }

  async function toggleLock(row: Row) {
    const locked = await supabase.from('price_locks').select('id').eq('product_id', row.product_id).eq('is_active', true).maybeSingle();
    if (locked.data) await supabase.from('price_locks').update({ is_active: false }).eq('id', locked.data.id);
    else await supabase.from('price_locks').insert({ product_id: row.product_id, locked_price: row.current_price, locked_by: 'pricing-control-centre', lock_reason: 'Manual pricing lock' });
    await load();
  }

  if (loading && !dashboard) return <div className="p-8 text-center text-slate-500 animate-pulse font-black uppercase tracking-widest">Loading Pricing Control Centre...</div>;

  const today = dashboard?.today || {};
  const weekly = dashboard?.weekly || {};
  const target = dashboard?.target || {};

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-[10px] text-cyan-400 font-black uppercase tracking-[0.25em]">Commercial Control</p>
          <h1 className="text-3xl font-black text-white uppercase tracking-tight">Pricing Control Centre</h1>
          <p className="text-sm text-slate-500 mt-1">Profit-first pricing with market intelligence — the competitor is a signal, not the master.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={load} className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-black uppercase">Refresh</button>
          <Link href="/competitors" className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-black uppercase">Competitor Intelligence</Link>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto bg-slate-950/60 border border-slate-800 p-1 rounded-2xl">
        {TABS.map(([id,label]) => <button key={id} onClick={() => changeTab(id)} className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${tab===id?'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20':'text-slate-500 hover:text-slate-300'}`}>{label}</button>)}
      </div>

      {notice && <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200 flex justify-between"><span>{notice}</span><button onClick={()=>setNotice(null)}>×</button></div>}

      {tab === 'overview' && <>
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          {[
            ['Today Orders', today.orders], ['Today Revenue', money(today.revenue)], ['Today COGS', money(today.cogs)], ['Today Variable', money(today.variable_costs)], ['Today Gross', money(today.gross_profit)], ['Today Net', money(today.net_profit)], ['Profit/Order', money(today.average_profit_per_order)], ['Daily Target', money(target.daily_profit_target)],
          ].map(([label,value]) => <div key={String(label)} className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{label}</p><p className="text-xl font-black text-white mt-1">{value}</p></div>)}
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          <section className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6"><div className="flex justify-between"><div><p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Rolling 7-day performance</p><h2 className="text-xl font-black text-white mt-1">Weekly economics</h2></div><span className={`px-3 py-1 rounded-full border text-[10px] font-black uppercase ${statusClass(target.status)}`}>{target.status || 'NO DATA'}</span></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">{[['Orders',weekly.orders],['Units',weekly.units],['Revenue',money(weekly.revenue)],['COGS',money(weekly.cogs)],['Variable',money(weekly.variable_costs)],['Expenses',money(weekly.operating_expenses)],['Net Profit',money(weekly.net_profit)],['Profit/Day',money(weekly.average_profit_per_day)]].map(([l,v])=><div key={String(l)}><p className="text-[9px] text-slate-500 font-black uppercase">{l}</p><p className="text-lg font-black text-slate-100 mt-1">{v}</p></div>)}</div></section>
          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6"><p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Target engine</p><h2 className="text-xl font-black text-white mt-1">This week</h2><div className="space-y-4 mt-6">{[['Weekly target',money(target.weekly_profit_target)],['Daily target',money(target.daily_profit_target)],['Required/order',money(target.required_profit_per_order)],['Required/unit',money(target.required_profit_per_unit)],['Current/day',money(target.current_average_profit_per_day)],['Gap',money(target.gap_to_target)]].map(([l,v])=><div key={String(l)} className="flex justify-between border-b border-slate-800 pb-3"><span className="text-xs text-slate-500">{l}</span><span className="text-sm font-black text-white">{v}</span></div>)}</div></section>
        </div>
      </>}

      {tab === 'fixing' && <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden"><div className="p-5 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3"><div><h2 className="text-xl font-black text-white">Price Fixing</h2><p className="text-xs text-slate-500">Review → understand → apply. Economic floor always wins unless explicitly approved.</p></div><button disabled={!selectedRows.length} onClick={bulkApply} className="px-5 py-2.5 rounded-xl bg-cyan-600 text-white text-xs font-black uppercase disabled:opacity-40">Review & Apply {selectedRows.length || ''}</button></div><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-950/60"><tr>{['','Product','COGS','Variable','Current','Lowest Comp.','Median','Profit Floor','Target','Recommended','Margin','Profit','Status',''].map(h=><th key={h} className="p-3 text-left text-[9px] text-slate-500 font-black uppercase whitespace-nowrap">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-800">{rows.map(r=>{const checked=selectedIds.has(r.product_id);return <tr key={r.product_id} className="hover:bg-slate-800/30"><td className="p-3"><input type="checkbox" checked={checked} onChange={()=>setSelectedIds(prev=>{const n=new Set(prev);checked?n.delete(r.product_id):n.add(r.product_id);return n;})}/></td><td className="p-3"><button onClick={()=>setSelected(r)} className="text-left"><p className="font-black text-slate-100">{r.product_name}</p><p className="text-[9px] text-slate-500">{r.sku || ''}</p></button></td><td className="p-3">{money(r.cost_price)}</td><td className="p-3">{money(r.variable_cost)}</td><td className="p-3 font-bold">{money(r.current_price)}</td><td className="p-3">{r.market_analytics?.lowest_competitor_price?money(r.market_analytics.lowest_competitor_price):'—'}</td><td className="p-3">{r.market_analytics?.median_competitor_price?money(r.market_analytics.median_competitor_price):'—'}</td><td className="p-3 font-bold text-amber-300">{money(r.profit_floor_price)}</td><td className="p-3">{money(r.required_profit_price)}</td><td className="p-3 font-black text-cyan-300">{money(r.recommended_price)}</td><td className="p-3">{Number(r.expected_margin||0).toFixed(1)}%</td><td className="p-3">{money(r.expected_profit_per_unit)}</td><td className="p-3"><span className={`px-2 py-1 rounded-full border text-[8px] font-black uppercase ${statusClass(r.pricing_status)}`}>{r.pricing_status}</span></td><td className="p-3"><button onClick={()=>applyOne(r)} className="px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-[9px] font-black uppercase">Apply</button></td></tr>})}</tbody></table></div></section>}

      {tab === 'weekly' && <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6"><h2 className="text-xl font-black text-white">Weekly Strategy</h2><p className="text-sm text-slate-500 mt-1">Performance-based target is calculated from the rolling business baseline. Fixed mode remains available in rules.</p><div className="grid md:grid-cols-3 gap-4 mt-6">{[['Average orders/day',weekly.average_orders_per_day],['Average units/day',weekly.average_units_per_day],['Average revenue/day',money(weekly.average_revenue_per_day)],['Average profit/day',money(weekly.average_profit_per_day)],['Average profit/order',money(weekly.average_profit_per_order)],['Target growth',`${Number(target.target_growth_percent||0).toFixed(1)}%`],['Daily target',money(target.daily_profit_target)],['Weekly target',money(target.weekly_profit_target)],['Gap',money(target.gap_to_target)]].map(([l,v])=><div key={String(l)} className="bg-slate-950 border border-slate-800 rounded-2xl p-5"><p className="text-[9px] text-slate-500 font-black uppercase">{l}</p><p className="text-2xl font-black text-white mt-2">{v}</p></div>)}</div></section>}

      {tab === 'competitors' && <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden"><div className="p-5 border-b border-slate-800"><h2 className="text-xl font-black text-white">Competitor Market Data</h2><p className="text-xs text-slate-500">Only fresh, matched, in-stock, non-promotional prices are used as the authoritative market signal.</p></div><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-950/60"><tr>{['Product','Competitor','Price','Type','Stock','Match','Unit','Normalized','Freshness','Scanned'].map(h=><th key={h} className="p-3 text-left text-[9px] text-slate-500 font-black uppercase whitespace-nowrap">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-800">{competitors.map(c=><tr key={c.id}><td className="p-3 text-slate-100 font-bold">{c.products?.name || c.source_product_name || '—'}</td><td className="p-3 text-slate-300">{c.competitors?.name || '—'}</td><td className="p-3 font-black">{money(c.price)}</td><td className="p-3">{c.source_sale_price ? <span className="text-amber-300">SALE</span> : c.is_conditional ? <span className="text-amber-300">CONDITIONAL</span> : 'REGULAR'}</td><td className="p-3">{c.source_stock_status || 'Unknown'}</td><td className="p-3">{c.match_confidence != null ? `${Number(c.match_confidence*100).toFixed(0)}%` : '—'}</td><td className="p-3">{c.source_unit_value ? `${c.source_unit_value} ${c.source_unit_type||''}` : '—'}</td><td className="p-3">{c.normalised_price_per_kg ? money(c.normalised_price_per_kg)+'/kg' : '—'}</td><td className="p-3">{c.data_quality_state || '—'}</td><td className="p-3 text-slate-500">{c.last_scanned_at ? new Date(c.last_scanned_at).toLocaleString('en-GB') : '—'}</td></tr>)}</tbody></table></div></section>}

      {tab === 'rules' && <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6"><h2 className="text-xl font-black text-white">Pricing Rules</h2><p className="text-sm text-slate-500 mt-1">Central configuration for profit targets, market positioning and price movement limits.</p><div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">{[['Target mode',settings?.target_mode||'performance'],['Weekly target',money(settings?.weekly_target_profit)],['Daily target',money(settings?.daily_target_net_profit)],['Growth',`${settings?.target_growth_percent||0}%`],['Undercut',money(settings?.competitor_undercut_amount)],['Freshness',`${settings?.competitor_freshness_window_hours||48}h`],['Min competitors',settings?.minimum_competitor_count||1],['Market position',settings?.market_position_target||'BELOW_MARKET'],['Max increase',`${settings?.max_price_increase_percent||20}%`],['Max decrease',`${settings?.max_price_decrease_percent||20}%`],['Mode',settings?.pricing_mode||'manual'],['Auto apply',settings?.auto_apply_enabled?'ON':'OFF']].map(([l,v])=><div key={String(l)} className="bg-slate-950 border border-slate-800 rounded-2xl p-4"><p className="text-[9px] text-slate-500 font-black uppercase">{l}</p><p className="text-lg font-black text-white mt-1">{v}</p></div>)}</div><div className="mt-6 p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 text-sm text-amber-200">Profit-floor protection is enforced server-side. A price below the floor requires explicit authorised approval.</div></section>}

      {tab === 'history' && <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden"><div className="p-5 border-b border-slate-800"><h2 className="text-xl font-black text-white">Price History & Audit</h2><p className="text-xs text-slate-500">Every applied change records the economic and market context used at the time.</p></div><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-950/60"><tr>{['Date','Product','Old','New','Profit Target','Profit Floor','Market','Strategy','Reason','Approval'].map(h=><th key={h} className="p-3 text-left text-[9px] text-slate-500 font-black uppercase whitespace-nowrap">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-800">{history.map(h=><tr key={h.id}><td className="p-3 text-slate-500">{new Date(h.created_at).toLocaleString('en-GB')}</td><td className="p-3 text-slate-100 font-bold">{h.product_id}</td><td className="p-3">{money(h.old_price)}</td><td className="p-3 font-black text-cyan-300">{money(h.new_price)}</td><td className="p-3">{money(h.target_profit)}</td><td className="p-3">{money(h.required_profit_price)}</td><td className="p-3">{money(h.lowest_competitor)}</td><td className="p-3">{h.strategy || 'standard'}</td><td className="p-3 max-w-[360px]">{h.decision_reason || '—'}</td><td className="p-3">{h.manually_approved?'MANUAL':'AUTO'}</td></tr>)}</tbody></table></div></section>}

      {selected && <div className="fixed inset-0 z-[100] bg-black/70 flex justify-end" onClick={()=>setSelected(null)}><aside className="w-full max-w-xl h-full bg-slate-950 border-l border-slate-800 p-6 overflow-y-auto" onClick={e=>e.stopPropagation()}><div className="flex justify-between"><div><p className="text-[10px] text-cyan-400 font-black uppercase tracking-widest">Pricing Decision</p><h2 className="text-2xl font-black text-white mt-1">{selected.product_name}</h2><p className="text-xs text-slate-500">{selected.sku}</p></div><button onClick={()=>setSelected(null)} className="text-slate-500 text-2xl">×</button></div><div className="grid grid-cols-2 gap-3 mt-6">{[['Current',selected.current_price],['COGS',selected.cost_price],['Variable',selected.variable_cost],['Profit Floor',selected.profit_floor_price],['Required Price',selected.required_profit_price],['Market Target',selected.competitive_target_price],['Recommended',selected.recommended_price],['Expected Profit',selected.expected_profit_per_unit]].map(([l,v])=><div key={String(l)} className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><p className="text-[9px] text-slate-500 font-black uppercase">{l}</p><p className="text-xl font-black text-white mt-1">{money(v)}</p></div>)}</div><div className={`mt-5 p-4 rounded-2xl border ${statusClass(selected.pricing_status)}`}><p className="text-[9px] font-black uppercase">Decision</p><p className="text-sm font-bold mt-2">{selected.decision_reason}</p></div><div className="mt-5 grid grid-cols-2 gap-3 text-xs"><div><p className="text-slate-500">Lowest competitor</p><p className="font-black">{money(selected.market_analytics?.lowest_competitor_price)}</p></div><div><p className="text-slate-500">Median competitor</p><p className="font-black">{money(selected.market_analytics?.median_competitor_price)}</p></div><div><p className="text-slate-500">Competitors</p><p className="font-black">{selected.market_analytics?.valid_competitor_count || 0}</p></div><div><p className="text-slate-500">Fresh</p><p className="font-black">{selected.market_analytics?.fresh_competitor_count || 0}</p></div></div><div className="flex gap-3 mt-8"><button onClick={()=>applyOne(selected)} className="flex-1 px-4 py-3 rounded-xl bg-cyan-600 text-white text-xs font-black uppercase">Apply Recommended</button><button onClick={()=>toggleLock(selected)} className="px-4 py-3 rounded-xl bg-slate-800 text-slate-200 text-xs font-black uppercase">Lock/Unlock</button></div></aside></div>}
    </div>
  );
}

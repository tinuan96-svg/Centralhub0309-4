'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils/currency';

const TABS = [['overview','Overview'],['fixing','Price Fixing'],['weekly','Weekly Strategy'],['competitors','Competitors'],['rules','Pricing Rules'],['history','Price History']] as const;
type Row = any;
const money=(v:any)=>formatCurrency(Number(v||0));
const metric=(v:any,asMoney=false)=>v==null||v===''?'—':asMoney?money(v):v;
const blocked=(r:Row)=>Boolean(r?.execution_blocked||r?.price_locked||r?.recommendation_status!=='ready'||r?.data_quality_status!=='passed');
const reason=(r:Row)=>{const a=Array.isArray(r?.data_quality_reasons)?r.data_quality_reasons:[];return a.length?a.join(', ').replaceAll('_',' '):r?.decision_reason||r?.pricing_status||'Review required';};
const badge=(s:string)=>s==='ABOVE_TARGET'||s==='MARKET_ALIGNED'?'text-emerald-400 bg-emerald-500/10 border-emerald-500/20':s==='MARKET_BELOW_PROFIT'||s==='BELOW_TARGET'?'text-rose-400 bg-rose-500/10 border-rose-500/20':s==='NEAR_TARGET'||s==='REVIEW_REQUIRED'?'text-amber-400 bg-amber-500/10 border-amber-500/20':'text-slate-300 bg-slate-800 border-slate-700';

export default function PricingControlCentre({initialTab='overview'}:{initialTab?:string}){
  const [tab,setTab]=useState(TABS.some(t=>t[0]===initialTab)?initialTab:'overview');
  const [dashboard,setDashboard]=useState<any>(null); const [rows,setRows]=useState<Row[]>([]); const [settings,setSettings]=useState<any>(null);
  const [competitors,setCompetitors]=useState<any[]>([]); const [history,setHistory]=useState<any[]>([]);
  const [loading,setLoading]=useState(true); const [secondaryLoading,setSecondaryLoading]=useState(false); const [error,setError]=useState<string|null>(null); const [notice,setNotice]=useState<string|null>(null);
  const [selected,setSelected]=useState<Set<string>>(new Set());

  const load=useCallback(async()=>{
    setLoading(true);
    const [d,r,s]=await Promise.all([
      supabase.rpc('get_pricing_dashboard',{p_period_days:7}),
      supabase.rpc('get_pricing_control_rows',{p_limit:500,p_offset:0}),
      supabase.from('pricing_settings').select('*').is('store_id',null).limit(1).maybeSingle(),
    ]);
    const failures:string[]=[];
    if(d.error) failures.push(`dashboard: ${d.error.message}`); else if(d.data) setDashboard(d.data);
    if(r.error) failures.push(`pricing rows: ${r.error.message}`); else if(r.data) setRows(r.data as Row[]);
    if(s.error) failures.push(`settings: ${s.error.message}`); else if(s.data) setSettings(s.data);
    setError(failures.length?`Some pricing data could not refresh (${failures.join('; ')}). Existing verified values are being kept.`:null); setLoading(false);
  },[]);

  const loadSecondary=useCallback(async(kind:string)=>{
    if(kind!=='competitors'&&kind!=='history') return; setSecondaryLoading(true);
    if(kind==='competitors'){
      const r=await supabase.from('competitor_prices').select('id,price,source_product_name,source_stock_status,source_unit_value,source_unit_type,normalised_price_per_kg,data_quality_state,match_confidence,last_scanned_at,is_conditional,source_sale_price,competitors(name),products(name,sku)').order('last_scanned_at',{ascending:false});
      if(r.error) setError(`Competitor data could not refresh: ${r.error.message}. Existing values are being kept.`); else {setCompetitors(r.data||[]);setError(null);}
    }else{
      const r=await supabase.from('price_change_audit').select('*').order('created_at',{ascending:false}).limit(100);
      if(r.error) setError(`Price history could not refresh: ${r.error.message}. Existing values are being kept.`); else {setHistory(r.data||[]);setError(null);}
    }
    setSecondaryLoading(false);
  },[]);

  useEffect(()=>{load();},[load]); useEffect(()=>{loadSecondary(tab);},[tab,loadSecondary]);
  const changeTab=(t:string)=>{setTab(t);window.history.replaceState(null,'',`/pricing?tab=${t}`);};
  const safeSelected=useMemo(()=>rows.filter(r=>selected.has(r.product_id)&&!blocked(r)),[rows,selected]);

  const executeControlled=async(row:Row,confirmed=false)=>{
    if(blocked(row)){setNotice(`${row.product_name}: ${reason(row)}`);return;}
    const v=await supabase.rpc('validate_pricing_execution_for_product',{p_product_id:row.product_id}); const vr=Array.isArray(v.data)?v.data[0]:v.data;
    if(v.error||!vr?.can_execute){setNotice(`${row.product_name}: ${v.error?.message||vr?.reason||'Server-side validation blocked this change.'}`);await load();return;}
    if(!confirmed&&!window.confirm(`${row.product_name}\n\nCurrent: ${money(row.current_price)}\nRecommended: ${money(row.recommended_price)}\nExpected margin: ${Number(row.expected_margin||0).toFixed(1)}%\n\nApprove and execute this recommendation?`)) return;
    const a=await supabase.rpc('approve_pricing_recommendation',{p_product_id:row.product_id,p_approved_by:'pricing-control-centre'});
    if(a.error||!a.data?.success){setNotice(a.error?.message||a.data?.error||'Approval failed');await load();return;}
    const x=await supabase.rpc('execute_approved_pricing_recommendation',{p_product_id:row.product_id,p_executed_by:'pricing-control-centre'});
    setNotice(x.error||!x.data?.success?x.error?.message||x.data?.error||'Execution failed':`${row.product_name}: approved price applied.`); await load();
  };

  const bulk=async()=>{
    if(!safeSelected.length)return; const up=safeSelected.filter(r=>+r.recommended_price>+r.current_price).length,down=safeSelected.filter(r=>+r.recommended_price<+r.current_price).length;
    if(!window.confirm(`${safeSelected.length} validated products selected\n\nIncreases: ${up}\nDecreases: ${down}\n\nApprove and execute these recommendations?`))return;
    for(const r of safeSelected) await executeControlled(r,true); setSelected(new Set());
  };

  const today=dashboard?.today||{}, weekly=dashboard?.weekly||{}, target=dashboard?.target||{};
  const cards=(items:any[])=> <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">{items.map(([l,v])=><div key={l} className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{l}</p><p className="text-xl font-black text-white mt-1">{v}</p></div>)}</div>;

  return <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4"><div><p className="text-[10px] text-cyan-400 font-black uppercase tracking-[.25em]">Commercial Control</p><h1 className="text-3xl font-black text-white uppercase">Pricing Control Centre</h1><p className="text-sm text-slate-500 mt-1">Cached recommendation snapshots for fast review; every price change still requires server-side validation and manual approval.</p></div><div className="flex gap-2"><button disabled={loading} onClick={load} className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-black uppercase disabled:opacity-50">{loading?'Refreshing…':'Refresh'}</button><Link href="/competitors" className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-black uppercase">Competitor Intelligence</Link></div></div>
    <div className="flex gap-1 overflow-x-auto bg-slate-950/60 border border-slate-800 p-1 rounded-2xl">{TABS.map(([id,label])=><button key={id} onClick={()=>changeTab(id)} className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${tab===id?'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20':'text-slate-500'}`}>{label}</button>)}</div>
    {error&&<div className="flex flex-col sm:flex-row justify-between gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-300"><span>{error}</span><button onClick={load} className="font-black uppercase">Retry</button></div>}
    {notice&&<div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{notice}</div>}

    {tab==='overview'&&<>{cards([['Today Orders',metric(today.orders)],['Today Revenue',metric(today.revenue,true)],['Today COGS',metric(today.cogs,true)],['Today Variable',metric(today.variable_costs,true)],['Today Gross',metric(today.gross_profit,true)],['Today Net',metric(today.net_profit,true)],['Profit/Order',metric(today.average_profit_per_order,true)],['Daily Target',metric(target.daily_profit_target,true)]])}<div className="grid lg:grid-cols-3 gap-4"><section className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6"><div className="flex justify-between"><h2 className="text-xl font-black text-white">Weekly economics</h2><span className={`px-3 py-1 rounded-full border text-[10px] font-black ${badge(target.status)}`}>{target.status||'NO DATA'}</span></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">{[['Orders',metric(weekly.orders)],['Units',metric(weekly.units)],['Revenue',metric(weekly.revenue,true)],['COGS',metric(weekly.cogs,true)],['Variable',metric(weekly.variable_costs,true)],['Expenses',metric(weekly.operating_expenses,true)],['Net Profit',metric(weekly.net_profit,true)],['Profit/Day',metric(weekly.average_profit_per_day,true)]].map(([l,v])=><div key={l}><p className="text-[9px] text-slate-500 font-black uppercase">{l}</p><p className="text-lg font-black text-white mt-1">{v}</p></div>)}</div></section><section className="bg-slate-900 border border-slate-800 rounded-3xl p-6"><h2 className="text-xl font-black text-white">Target engine</h2><div className="space-y-3 mt-5">{[['Weekly target',metric(target.weekly_profit_target,true)],['Daily target',metric(target.daily_profit_target,true)],['Required/order',metric(target.required_profit_per_order,true)],['Required/unit',metric(target.required_profit_per_unit,true)],['Current/day',metric(target.current_average_profit_per_day,true)],['Gap',metric(target.gap_to_target,true)]].map(([l,v])=><div key={l} className="flex justify-between border-b border-slate-800 pb-2"><span className="text-xs text-slate-500">{l}</span><b>{v}</b></div>)}</div></section></div></>}

    {tab==='fixing'&&<section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden"><div className="p-5 border-b border-slate-800 flex justify-between gap-3"><div><h2 className="text-xl font-black text-white">Price Fixing</h2><p className="text-xs text-slate-500">Blocked products cannot be selected or executed. Approval and validation are enforced server-side.</p></div><button disabled={!safeSelected.length} onClick={bulk} className="px-4 py-2 rounded-xl bg-cyan-600 text-xs font-black disabled:opacity-30">Review & Apply {safeSelected.length||''}</button></div><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-950/60"><tr>{['','Product','COGS','Current','Lowest Comp.','Profit Floor','Recommended','Margin','Status','Data',''].map(h=><th key={h} className="p-3 text-left text-[9px] text-slate-500 uppercase">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-800">{rows.map(r=>{const b=blocked(r),checked=selected.has(r.product_id);return <tr key={r.product_id}><td className="p-3"><input type="checkbox" disabled={b} checked={checked&&!b} onChange={()=>setSelected(s=>{const n=new Set(s);checked?n.delete(r.product_id):n.add(r.product_id);return n;})}/></td><td className="p-3"><b>{r.product_name}</b><div className="text-[9px] text-slate-500">{r.sku||''}</div></td><td className="p-3">{money(r.cost_price)}</td><td className="p-3">{money(r.current_price)}</td><td className="p-3">{r.market_analytics?.lowest_competitor_price?money(r.market_analytics.lowest_competitor_price):'—'}</td><td className="p-3 text-amber-300">{money(r.profit_floor_price)}</td><td className="p-3 text-cyan-300 font-black">{money(r.recommended_price)}</td><td className="p-3">{Number(r.expected_margin||0).toFixed(1)}%</td><td className="p-3">{r.pricing_status}</td><td className="p-3 min-w-[170px]">{b?<><span className="text-rose-400 font-black">BLOCKED</span><div className="text-[9px] text-slate-500">{reason(r)}</div></>:<span className="text-emerald-400 font-black">PASSED</span>}</td><td className="p-3"><button disabled={b} onClick={()=>executeControlled(r)} className="px-3 py-1.5 rounded-lg bg-cyan-600 text-[9px] font-black disabled:opacity-30">{b?'Blocked':'Review & Apply'}</button></td></tr>})}</tbody></table></div></section>}

    {tab==='weekly'&&<section className="bg-slate-900 border border-slate-800 rounded-3xl p-6"><h2 className="text-xl font-black text-white">Weekly Strategy</h2><div className="grid md:grid-cols-3 gap-4 mt-6">{[['Average orders/day',metric(weekly.average_orders_per_day)],['Average units/day',metric(weekly.average_units_per_day)],['Average revenue/day',metric(weekly.average_revenue_per_day,true)],['Average profit/day',metric(weekly.average_profit_per_day,true)],['Average profit/order',metric(weekly.average_profit_per_order,true)],['Target growth',target.target_growth_percent==null?'—':`${Number(target.target_growth_percent).toFixed(1)}%`],['Daily target',metric(target.daily_profit_target,true)],['Weekly target',metric(target.weekly_profit_target,true)],['Gap',metric(target.gap_to_target,true)]].map(([l,v])=><div key={l} className="bg-slate-950 border border-slate-800 rounded-2xl p-5"><p className="text-[9px] text-slate-500 font-black uppercase">{l}</p><p className="text-2xl font-black text-white mt-2">{v}</p></div>)}</div></section>}

    {tab==='competitors'&&<section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden"><div className="p-5 border-b border-slate-800"><h2 className="text-xl font-black text-white">Competitor Market Data</h2><p className="text-xs text-slate-500">{secondaryLoading?'Refreshing…':'Loaded on demand so pricing overview remains fast.'}</p></div><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr>{['Product','Competitor','Price','Stock','Match','Normalized','Freshness','Scanned'].map(h=><th key={h} className="p-3 text-left text-[9px] text-slate-500 uppercase">{h}</th>)}</tr></thead><tbody>{competitors.map(c=><tr key={c.id} className="border-t border-slate-800"><td className="p-3 font-bold">{c.products?.name||c.source_product_name||'—'}</td><td className="p-3">{c.competitors?.name||'—'}</td><td className="p-3 font-black">{money(c.price)}</td><td className="p-3">{c.source_stock_status||'Unknown'}</td><td className="p-3">{c.match_confidence==null?'—':`${Number(c.match_confidence*100).toFixed(0)}%`}</td><td className="p-3">{c.normalised_price_per_kg?`${money(c.normalised_price_per_kg)}/kg`:'—'}</td><td className="p-3">{c.data_quality_state||'—'}</td><td className="p-3">{c.last_scanned_at?new Date(c.last_scanned_at).toLocaleString('en-GB'):'—'}</td></tr>)}</tbody></table></div></section>}

    {tab==='rules'&&<section className="bg-slate-900 border border-slate-800 rounded-3xl p-6"><h2 className="text-xl font-black text-white">Pricing Rules</h2><div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">{[['Target mode',settings?.target_mode??'—'],['Daily target',settings?money(settings.daily_target_net_profit):'—'],['Growth',settings?.target_growth_percent==null?'—':`${settings.target_growth_percent}%`],['Undercut',settings?money(settings.competitor_undercut_amount):'—'],['Freshness',settings?.competitor_freshness_window_hours==null?'—':`${settings.competitor_freshness_window_hours}h`],['Min competitors',settings?.minimum_competitor_count??'—'],['Max increase',settings?.max_price_increase_percent==null?'—':`${settings.max_price_increase_percent}%`],['Auto apply',settings?(settings.auto_apply_enabled?'ON':'OFF'):'—']].map(([l,v])=><div key={l} className="bg-slate-950 border border-slate-800 rounded-2xl p-4"><p className="text-[9px] text-slate-500 font-black uppercase">{l}</p><p className="text-lg font-black text-white mt-1">{v}</p></div>)}</div><div className="mt-6 p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 text-sm text-amber-200">Manual approval, data-quality validation, active-product checks and economic-floor protection are enforced server-side.</div></section>}

    {tab==='history'&&<section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden"><div className="p-5 border-b border-slate-800"><h2 className="text-xl font-black text-white">Price History & Audit</h2><p className="text-xs text-slate-500">{secondaryLoading?'Refreshing…':'Loaded on demand.'}</p></div><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr>{['Date','Product','Old','New','Strategy','Reason','Approval'].map(h=><th key={h} className="p-3 text-left text-[9px] text-slate-500 uppercase">{h}</th>)}</tr></thead><tbody>{history.map(h=><tr key={h.id} className="border-t border-slate-800"><td className="p-3 text-slate-500">{new Date(h.created_at).toLocaleString('en-GB')}</td><td className="p-3">{h.product_id}</td><td className="p-3">{money(h.old_price)}</td><td className="p-3 text-cyan-300 font-black">{money(h.new_price)}</td><td className="p-3">{h.strategy||'standard'}</td><td className="p-3">{h.decision_reason||'—'}</td><td className="p-3">{h.manually_approved?'MANUAL':'AUTO'}</td></tr>)}</tbody></table></div></section>}
  </div>;
}

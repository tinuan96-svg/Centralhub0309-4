'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils/currency';

type Position={bank_balance:number;payables:number;due_now:number;due_7_days:number;due_30_days:number;projected_bank_after_7_day_payables:number;projected_bank_after_30_day_payables:number};
type Exception={id:string;order_number:string|null;customer_name:string|null;created_at:string;total_amount:number;payment_method:string;payment_status:string};

export default function CashlessIntegrityClient(){
 const [position,setPosition]=useState<Position|null>(null); const [exceptions,setExceptions]=useState<Exception[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null);
 const load=useCallback(async()=>{setLoading(true);setError(null);const [p,e]=await Promise.all([supabase.from('v_finance_cashless_position').select('*').single(),supabase.from('v_finance_cashless_exceptions').select('*').order('created_at',{ascending:false}).limit(20)]);if(p.error)setError(p.error.message);else setPosition(p.data as Position);if(e.error)setError(e.error.message);else setExceptions((e.data||[]) as Exception[]);setLoading(false)},[]);
 useEffect(()=>{load()},[load]);
 return <section className="space-y-4">
  <div className="flex items-center justify-between"><div><h2 className="section-title">Cashless Financial Integrity</h2><p className="section-help">Bank position and committed supplier payments. Physical cash is not part of CentralHub finance.</p></div><button onClick={load} className="px-3 py-2 rounded-xl text-[10px] font-black bg-slate-800 text-white border border-slate-700">Refresh</button></div>
  {error&&<div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">Finance integrity warning: {error}</div>}
  <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
   {[
    ['Bank balance',position?.bank_balance],['Open payables',position?.payables],['Due now',position?.due_now],['Due 7 days',position?.due_7_days],['Bank after 7d',position?.projected_bank_after_7_day_payables],['Bank after 30d',position?.projected_bank_after_30_day_payables]
   ].map(([label,value])=><div key={String(label)} className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><p className="label">{label}</p><p className={`metric ${String(label).includes('after')&&Number(value||0)<0?'text-rose-300':'text-white'}`}>{loading?'—':formatCurrency(Number(value||0))}</p></div>)}
  </div>
  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5"><div className="flex items-center justify-between mb-4"><div><h3 className="section-title">Cashless exceptions</h3><p className="section-help">Legacy COD/cash orders are flagged for review; they are not treated as physical cash receipts.</p></div><span className="text-[10px] font-black uppercase tracking-widest text-amber-300">{exceptions.length} flagged</span></div>
   {exceptions.length===0?<p className="text-sm text-emerald-300">No cash/COD exceptions found.</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-[9px] uppercase tracking-widest text-slate-500"><tr><th className="p-3 text-left">Order</th><th className="p-3 text-left">Customer</th><th className="p-3 text-left">Method</th><th className="p-3 text-right">Amount</th><th className="p-3 text-left">Status</th></tr></thead><tbody className="divide-y divide-slate-800">{exceptions.map(x=><tr key={x.id}><td className="p-3 text-white font-bold">{x.order_number||x.id.slice(0,8)}</td><td className="p-3 text-slate-400">{x.customer_name||'—'}</td><td className="p-3 text-amber-300 uppercase">{x.payment_method}</td><td className="p-3 text-right text-white">{formatCurrency(Number(x.total_amount||0))}</td><td className="p-3 text-slate-400">{x.payment_status}</td></tr>)}</tbody></table></div>}
  </div>
 </section>
}

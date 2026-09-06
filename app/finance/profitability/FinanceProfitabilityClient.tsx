'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils/currency';

type Row = Record<string, any>;
type Tab = 'orders' | 'products' | 'customers' | 'suppliers' | 'monthly';

function range(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default function FinanceProfitabilityClient() {
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [customers, setCustomers] = useState<Row[]>([]);
  const [suppliers, setSuppliers] = useState<Row[]>([]);
  const [monthly, setMonthly] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const r = range(days);
    const [o, p, c, s, m] = await Promise.all([
      supabase.from('v_financial_order_profitability_detail').select('*').gte('created_at', r.start).lte('created_at', r.end + 'T23:59:59').order('created_at', { ascending: false }).limit(500),
      supabase.rpc('get_finance_product_profitability', { p_start_date: r.start, p_end_date: r.end, p_store_id: null }),
      supabase.rpc('get_finance_customer_profitability', { p_start_date: r.start, p_end_date: r.end, p_store_id: null }),
      supabase.rpc('get_finance_supplier_performance', { p_start_date: r.start, p_end_date: r.end }),
      supabase.from('v_financial_monthly_pnl').select('*').order('period_month', { ascending: false }).limit(12),
    ]);
    const firstError = [o,p,c,s,m].find((x: any) => x.error)?.error;
    if (firstError) setError(firstError.message);
    setOrders(o.data || []); setProducts(p.data || []); setCustomers(c.data || []); setSuppliers(s.data || []); setMonthly(m.data || []);
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const totals = orders.reduce((a, x) => ({ revenue: a.revenue + Number(x.revenue || 0), cogs: a.cogs + Number(x.cogs || 0), profit: a.profit + Number(x.contribution_profit || 0) }), { revenue: 0, cogs: 0, profit: 0 });

  return <main className="p-4 sm:p-6 space-y-6 max-w-[1700px] mx-auto">
    <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
      <div><p className="text-cyan-400 text-[10px] font-black uppercase tracking-[.25em]">CentralHub Finance</p><h1 className="text-2xl sm:text-3xl font-black text-white">Profitability Drill-down</h1><p className="text-sm text-slate-500 mt-1">See what the business earns per order, product, customer and supplier.</p></div>
      <div className="flex gap-2">{[7,30,90].map(d => <button key={d} onClick={() => setDays(d)} className={`px-3 py-2 rounded-xl text-[10px] font-black ${days===d?'bg-cyan-500 text-slate-950':'bg-slate-900 text-slate-400 border border-slate-800'}`}>{d} DAYS</button>)}<button onClick={load} className="px-3 py-2 rounded-xl text-[10px] font-black bg-slate-800 text-white">Refresh</button></div>
    </header>
    {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">Financial drill-down warning: {error}</div>}
    <section className="grid grid-cols-3 gap-3"><div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><p className="text-[10px] text-slate-500 uppercase font-black">Revenue</p><p className="text-2xl font-black text-white">{formatCurrency(totals.revenue)}</p></div><div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><p className="text-[10px] text-slate-500 uppercase font-black">COGS</p><p className="text-2xl font-black text-amber-300">{formatCurrency(totals.cogs)}</p></div><div className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><p className="text-[10px] text-slate-500 uppercase font-black">Contribution profit</p><p className={`text-2xl font-black ${totals.profit>=0?'text-emerald-300':'text-rose-300'}`}>{formatCurrency(totals.profit)}</p></div></section>
    <nav className="flex gap-1 overflow-x-auto bg-slate-950 p-1 rounded-2xl border border-slate-800 w-fit">{([['orders','Orders'],['products','Products'],['customers','Customers'],['suppliers','Suppliers'],['monthly','Monthly P&L']] as [Tab,string][]).map(([k,l])=><button key={k} onClick={()=>setTab(k)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${tab===k?'bg-slate-800 text-white':'text-slate-500'}`}>{l}</button>)}</nav>
    <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
      {loading ? <div className="p-16 text-center text-slate-500 font-black uppercase tracking-widest">Loading financial detail…</div> : <div className="overflow-x-auto">
        {tab==='orders' && <table className="w-full text-sm"><thead><tr className="bg-slate-800/50 text-[9px] uppercase tracking-widest text-slate-500"><th className="p-4 text-left">Order</th><th className="p-4 text-left">Customer</th><th className="p-4 text-right">Revenue</th><th className="p-4 text-right">COGS</th><th className="p-4 text-right">Variable</th><th className="p-4 text-right">Contribution</th><th className="p-4 text-right">Net allocated</th></tr></thead><tbody className="divide-y divide-slate-800">{orders.map(x=><tr key={x.order_id}><td className="p-4 font-bold text-white">{x.order_number}</td><td className="p-4 text-slate-400">{x.customer_name||'Guest'}</td><td className="p-4 text-right">{formatCurrency(Number(x.revenue||0))}</td><td className="p-4 text-right text-amber-300">{formatCurrency(Number(x.cogs||0))}</td><td className="p-4 text-right">{formatCurrency(Number(x.payment_cost||0)+Number(x.shipping_cost||0)+Number(x.packing_cost||0))}</td><td className="p-4 text-right text-cyan-300">{formatCurrency(Number(x.contribution_profit||0))}</td><td className="p-4 text-right text-emerald-300">{formatCurrency(Number(x.contribution_profit||0))}</td></tr>)}</tbody></table>}
        {tab==='products' && <Table rows={products} name="Product" nameKey="product_name" money={['revenue','cogs','contribution_profit','allocated_net_profit']} />}
        {tab==='customers' && <Table rows={customers} name="Customer" nameKey="customer_name" money={['revenue','cogs','contribution_profit','allocated_net_profit']} />}
        {tab==='suppliers' && <Table rows={suppliers} name="Supplier" nameKey="supplier_name" money={['purchase_value','invoiced_value','outstanding_value']} />}
        {tab==='monthly' && <Table rows={monthly} name="Month" nameKey="period_month" money={['revenue','cogs','variable_costs','operating_expenses','net_profit']} />}
      </div>}
    </section>
  </main>;
}

function Table({ rows, name, nameKey, money }: { rows: Row[]; name: string; nameKey: string; money: string[] }) {
  const columns = rows.length ? money : [];
  return <table className="w-full text-sm"><thead><tr className="bg-slate-800/50 text-[9px] uppercase tracking-widest text-slate-500"><th className="p-4 text-left">{name}</th>{columns.map(c=><th key={c} className="p-4 text-right">{c.replaceAll('_',' ')}</th>)}</tr></thead><tbody className="divide-y divide-slate-800">{rows.map((x,i)=><tr key={String(x[nameKey])+i}><td className="p-4 font-bold text-white">{x[nameKey]||'Guest'}</td>{columns.map(c=><td key={c} className="p-4 text-right text-slate-300">{formatCurrency(Number(x[c]||0))}</td>)}</tr>)}</tbody></table>;
}

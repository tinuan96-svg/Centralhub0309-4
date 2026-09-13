'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

function prettyMonth(value: unknown) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function columnLabel(column: string) {
  const labels: Record<string, string> = {
    revenue: 'Revenue',
    cogs: 'COGS',
    variable_costs: 'Variable costs',
    contribution_profit: 'Contribution',
    allocated_net_profit: 'Net allocated',
    purchase_value: 'Purchase value',
    invoiced_value: 'Invoiced value',
    outstanding_value: 'Outstanding value',
    operating_expenses: 'Operating expenses',
    net_profit: 'Net profit',
  };
  return labels[column] || column.replaceAll('_', ' ');
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

  const selectedRange = useMemo(() => range(days), [days]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = range(days);
    const periodArgs = { p_start_date: r.start, p_end_date: r.end, p_store_id: null };
    const [o, p, c, s, m] = await Promise.all([
      supabase.rpc('get_finance_order_profitability', periodArgs),
      supabase.rpc('get_finance_product_profitability', periodArgs),
      supabase.rpc('get_finance_customer_profitability', periodArgs),
      supabase.rpc('get_finance_supplier_performance', { p_start_date: r.start, p_end_date: r.end }),
      supabase.rpc('get_finance_monthly_pnl_range', periodArgs),
    ]);
    const firstError = [o, p, c, s, m].find((x: any) => x.error)?.error;
    if (firstError) setError(firstError.message);

    setOrders(o.data || []);
    setProducts(p.data || []);
    setCustomers(c.data || []);
    setSuppliers((s.data || []).filter((row: Row) =>
      Number(row.purchase_orders || 0) > 0 ||
      Number(row.invoices || 0) > 0 ||
      Number(row.purchase_value || 0) !== 0 ||
      Number(row.invoiced_value || 0) !== 0 ||
      Number(row.outstanding_value || 0) !== 0
    ));
    setMonthly(m.data || []);
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const totals = orders.reduce((a, x) => ({
    revenue: a.revenue + Number(x.revenue || 0),
    cogs: a.cogs + Number(x.cogs || 0),
    variable: a.variable + Number(x.variable_costs || 0),
    contribution: a.contribution + Number(x.contribution_profit || 0),
    net: a.net + Number(x.allocated_net_profit || 0),
  }), { revenue: 0, cogs: 0, variable: 0, contribution: 0, net: 0 });

  return <main className="p-4 sm:p-6 space-y-6 max-w-[1700px] mx-auto min-w-0">
    <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
      <div className="min-w-0">
        <p className="text-cyan-400 text-[10px] font-black uppercase tracking-[.25em]">CentralHub Finance</p>
        <h1 className="text-2xl sm:text-3xl font-black text-white">Profitability Drill-down</h1>
        <p className="text-sm text-slate-500 mt-1">One accounting basis across orders, products, customers and the selected P&amp;L period.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {[7, 30, 90].map(d => <button key={d} onClick={() => setDays(d)} className={`px-3 py-2 rounded-xl text-[10px] font-black ${days === d ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>{d} DAYS</button>)}
        <button onClick={load} className="px-3 py-2 rounded-xl text-[10px] font-black bg-slate-800 text-white">Refresh</button>
      </div>
    </header>

    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
      {new Date(`${selectedRange.start}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} – {new Date(`${selectedRange.end}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
    </div>

    {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">Financial drill-down warning: {error}</div>}

    <section className="grid grid-cols-2 fold-inner:grid-cols-4 gap-3">
      <MetricCard label="Revenue" value={totals.revenue} className="text-white" />
      <MetricCard label="COGS" value={totals.cogs} className="text-amber-300" />
      <MetricCard label="Contribution profit" value={totals.contribution} className={totals.contribution >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
      <MetricCard label="Net profit" value={totals.net} className={totals.net >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
    </section>

    <p className="text-[10px] leading-5 text-slate-500">
      Contribution = revenue − COGS − variable costs ({formatCurrency(totals.variable)}). Net profit additionally allocates operating, finance and tax costs for the selected period.
    </p>

    <nav className="flex max-w-full gap-1 overflow-x-auto bg-slate-950 p-1 rounded-2xl border border-slate-800 w-fit">
      {([['orders', 'Orders'], ['products', 'Products'], ['customers', 'Customers'], ['suppliers', 'Suppliers'], ['monthly', 'Monthly P&L']] as [Tab, string][]).map(([k, l]) =>
        <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${tab === k ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>{l}</button>
      )}
    </nav>

    {tab === 'products' && <ContextNote>Product revenue is attributed from each order so product totals reconcile exactly to the headline period totals, including proportional non-product order charges.</ContextNote>}
    {tab === 'suppliers' && <ContextNote>Supplier activity shows purchase orders and invoices in the selected period. It is procurement/AP activity, so it is not expected to equal sales COGS timing one-for-one.</ContextNote>}
    {tab === 'monthly' && <ContextNote>Monthly P&amp;L is clipped to the selected 7/30/90-day range. Partial months show only days inside that range.</ContextNote>}

    <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden min-w-0">
      {loading ? <div className="p-16 text-center text-slate-500 font-black uppercase tracking-widest">Loading financial detail…</div> : <div className="overflow-x-auto overscroll-x-contain">
        {tab === 'orders' && <table className="w-full min-w-[980px] text-sm">
          <thead><tr className="bg-slate-800/50 text-[9px] uppercase tracking-widest text-slate-500">
            <th className="sticky left-0 z-10 bg-slate-800 p-4 text-left">Order</th>
            <th className="p-4 text-left">Customer</th>
            <th className="p-4 text-right">Revenue</th>
            <th className="p-4 text-right">COGS</th>
            <th className="p-4 text-right">Variable</th>
            <th className="p-4 text-right">Contribution</th>
            <th className="p-4 text-right">Net allocated</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-800">
            {orders.map(x => <tr key={x.order_id}>
              <td className="sticky left-0 z-[1] bg-slate-900 p-4 font-bold text-white whitespace-nowrap">{x.order_number}</td>
              <td className="p-4 text-slate-400 min-w-[170px]">{x.customer_name || 'Guest'}</td>
              <td className="p-4 text-right tabular-nums whitespace-nowrap">{formatCurrency(Number(x.revenue || 0))}</td>
              <td className="p-4 text-right text-amber-300 tabular-nums whitespace-nowrap">{formatCurrency(Number(x.cogs || 0))}</td>
              <td className="p-4 text-right tabular-nums whitespace-nowrap">{formatCurrency(Number(x.variable_costs || 0))}</td>
              <td className={`p-4 text-right tabular-nums whitespace-nowrap ${Number(x.contribution_profit || 0) >= 0 ? 'text-cyan-300' : 'text-rose-300'}`}>{formatCurrency(Number(x.contribution_profit || 0))}</td>
              <td className={`p-4 text-right font-bold tabular-nums whitespace-nowrap ${Number(x.allocated_net_profit || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatCurrency(Number(x.allocated_net_profit || 0))}</td>
            </tr>)}
          </tbody>
        </table>}
        {tab === 'products' && <Table rows={products} name="Product" nameKey="product_name" money={['revenue', 'cogs', 'variable_costs', 'contribution_profit', 'allocated_net_profit']} />}
        {tab === 'customers' && <Table rows={customers} name="Customer" nameKey="customer_name" money={['revenue', 'cogs', 'variable_costs', 'contribution_profit', 'allocated_net_profit']} />}
        {tab === 'suppliers' && <Table rows={suppliers} name="Supplier" nameKey="supplier_name" money={['purchase_value', 'invoiced_value', 'outstanding_value']} />}
        {tab === 'monthly' && <Table rows={monthly} name="Month" nameKey="period_month" money={['revenue', 'cogs', 'variable_costs', 'operating_expenses', 'contribution_profit', 'net_profit']} formatName={prettyMonth} />}
      </div>}
    </section>
  </main>;
}

function MetricCard({ label, value, className }: { label: string; value: number; className: string }) {
  return <div className="min-w-0 bg-slate-900 border border-slate-800 rounded-2xl p-4">
    <p className="text-[10px] text-slate-500 uppercase font-black">{label}</p>
    <p className={`text-xl sm:text-2xl font-black tabular-nums whitespace-nowrap ${className}`}>{formatCurrency(value)}</p>
  </div>;
}

function ContextNote({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-[10px] leading-5 text-slate-500">{children}</div>;
}

function Table({ rows, name, nameKey, money, formatName }: { rows: Row[]; name: string; nameKey: string; money: string[]; formatName?: (value: unknown) => string }) {
  const columns = rows.length ? money : [];
  if (!rows.length) return <div className="p-12 text-center text-sm text-slate-500">No activity in the selected period.</div>;
  return <table className="w-full min-w-[760px] text-sm">
    <thead><tr className="bg-slate-800/50 text-[9px] uppercase tracking-widest text-slate-500">
      <th className="sticky left-0 z-10 bg-slate-800 p-4 text-left">{name}</th>
      {columns.map(c => <th key={c} className="p-4 text-right whitespace-nowrap">{columnLabel(c)}</th>)}
    </tr></thead>
    <tbody className="divide-y divide-slate-800">{rows.map((x, i) => <tr key={String(x[nameKey]) + i}>
      <td className="sticky left-0 z-[1] bg-slate-900 p-4 font-bold text-white min-w-[190px]">{formatName ? formatName(x[nameKey]) : (x[nameKey] || 'Guest')}</td>
      {columns.map(c => {
        const value = Number(x[c] || 0);
        const profitColumn = c === 'contribution_profit' || c === 'allocated_net_profit' || c === 'net_profit';
        return <td key={c} className={`p-4 text-right tabular-nums whitespace-nowrap ${profitColumn ? (value >= 0 ? 'text-emerald-300' : 'text-rose-300') : c === 'cogs' ? 'text-amber-300' : 'text-slate-300'}`}>{formatCurrency(value)}</td>;
      })}
    </tr>)}</tbody>
  </table>;
}

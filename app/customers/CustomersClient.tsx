'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { CustomerService, CustomerSummary } from '@/lib/services/customerService';
import { formatCurrency } from '@/lib/utils/currency';
import StoreScopeSelector from '@/components/StoreScopeSelector';

type SortField = 'name' | 'orders' | 'value' | 'profit' | 'last_order';
type SortDirection = 'asc' | 'desc';

const STATUS_STYLES: Record<string, string> = {
  pending_payment: 'bg-slate-800 text-slate-400 border-slate-700',
  confirmed: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  picking: 'bg-blue-500/10 text-blue-300 border-blue-500/25',
  packing: 'bg-orange-500/10 text-orange-300 border-orange-500/25',
  packed: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
  ready_to_ship: 'bg-teal-500/10 text-teal-300 border-teal-500/25',
  shipment_booked: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/25',
  shipped: 'bg-violet-500/10 text-violet-300 border-violet-500/25',
  out_for_delivery: 'bg-sky-500/10 text-sky-300 border-sky-500/25',
  delivered: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  completed: 'bg-green-500/10 text-green-300 border-green-500/25',
  cancelled: 'bg-red-500/10 text-red-300 border-red-500/25',
  refunded: 'bg-slate-800 text-slate-400 border-slate-700',
};

function fmtDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function CustomersPage({ params, searchParams }: { params: any; searchParams: any }) {
  void params;
  void searchParams;
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('last_order');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await CustomerService.getAllCustomers(selectedStoreId);
      setCustomers(data);
    } catch (e) {
      console.error('Failed to load customers:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = q
      ? customers.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.phone.toLowerCase().includes(q) ||
            c.city.toLowerCase().includes(q) ||
            c.email.toLowerCase().includes(q)
        )
      : [...customers];

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'orders': cmp = a.total_orders - b.total_orders; break;
        case 'value': cmp = a.total_value - b.total_value; break;
        case 'profit': cmp = a.total_profit - b.total_profit; break;
        case 'last_order': cmp = new Date(a.last_order_date).getTime() - new Date(b.last_order_date).getTime(); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [customers, search, sortField, sortDir]);

  const totals = useMemo(() => ({
    count: customers.length,
    revenue: customers.reduce((s, c) => s + c.total_value, 0),
    profit: customers.reduce((s, c) => s + c.total_profit, 0),
    orders: customers.reduce((s, c) => s + c.total_orders, 0),
  }), [customers]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
  };

  const sortArrow = (field: SortField) => sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  if (loading) {
    return <div className="p-4 sm:p-8 text-center text-slate-400 uppercase font-bold tracking-widest animate-pulse text-sm">Loading customers...</div>;
  }

  return (
    <div className="p-4 fold-inner:p-5 lg:p-6 pb-24 fold-inner:pb-8 space-y-5 min-w-0">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-100 uppercase tracking-tighter">Customers</h1>
          <p className="mt-1 text-xs text-slate-500">Customer KPIs use valid paid business orders only.</p>
        </div>
        <button onClick={loadCustomers} className="text-xs font-bold px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors">Refresh</button>
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-sm min-w-0">
        <StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <SummaryCard label="Paid customers" value={totals.count.toLocaleString()} />
        <SummaryCard label="Valid paid orders" value={totals.orders.toLocaleString()} />
        <SummaryCard label="Paid revenue" value={formatCurrency(totals.revenue)} valueClass="text-emerald-500" />
        <SummaryCard label="Gross profit" value={formatCurrency(totals.profit)} valueClass="text-cyan-500" />
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-3 sm:p-4">
        <div className="relative">
          <input type="text" placeholder="Search by name, phone, city, or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400" />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">🔍</span>
        </div>
      </div>

      <div className="hidden fold-inner:block bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-sm min-w-0">
        <table className="w-full table-fixed text-sm">
          <colgroup><col className="w-[30%]" /><col className="w-[8%]" /><col className="w-[14%]" /><col className="w-[13%]" /><col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[11%]" /></colgroup>
          <thead className="bg-slate-950 border-b border-slate-700 text-slate-500 text-[9px] font-black uppercase tracking-wider">
            <tr>
              <th className="px-3 py-4 text-left cursor-pointer hover:text-slate-300" onClick={() => toggleSort('name')}>Customer{sortArrow('name')}</th>
              <th className="px-2 py-4 text-right cursor-pointer hover:text-slate-300" onClick={() => toggleSort('orders')}>Orders{sortArrow('orders')}</th>
              <th className="px-2 py-4 text-left">Last status</th>
              <th className="px-2 py-4 text-left">Last store</th>
              <th className="px-2 py-4 text-right cursor-pointer hover:text-slate-300" onClick={() => toggleSort('value')}>Value{sortArrow('value')}</th>
              <th className="px-2 py-4 text-right cursor-pointer hover:text-slate-300" onClick={() => toggleSort('profit')}>Profit{sortArrow('profit')}</th>
              <th className="px-3 py-4 text-right cursor-pointer hover:text-slate-300" onClick={() => toggleSort('last_order')}>Last order{sortArrow('last_order')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map((c) => (
              <tr key={c.key} className="hover:bg-slate-950/60 transition-colors">
                <td className="px-3 py-3 min-w-0">
                  <p className="font-bold text-slate-100 truncate">{c.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{c.email || 'No email'}</p>
                  <p className="text-[10px] text-slate-500 truncate">{[c.phone, c.address, c.city].filter(Boolean).join(' · ') || 'No contact address'}</p>
                </td>
                <td className="px-2 py-3 text-right font-black text-slate-100">{c.total_orders}</td>
                <td className="px-2 py-3"><span className={`inline-flex max-w-full px-2 py-1 rounded-lg text-[9px] font-black uppercase border truncate ${STATUS_STYLES[c.last_order_status] || 'bg-slate-800 text-slate-500 border-slate-700'}`}>{c.last_order_status?.replace(/_/g, ' ') || '—'}</span></td>
                <td className="px-2 py-3 text-slate-400 truncate" title={c.last_store_name || '—'}>{c.last_store_name || '—'}</td>
                <td className="px-2 py-3 text-right font-bold text-slate-100 whitespace-nowrap">{formatCurrency(c.total_value)}</td>
                <td className={`px-2 py-3 text-right font-bold whitespace-nowrap ${c.total_profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{formatCurrency(c.total_profit)}</td>
                <td className="px-3 py-3 text-right text-slate-500 whitespace-nowrap text-xs">{fmtDate(c.last_order_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="fold-inner:hidden space-y-3">
        {filtered.length === 0 && <div className="text-center py-12 text-slate-400 text-sm">No customers found</div>}
        {filtered.map((c) => (
          <div key={c.key} className="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="font-bold text-slate-100 truncate">{c.name}</p>{c.email && <p className="text-[10px] text-slate-400 truncate">{c.email}</p>}</div>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase border flex-shrink-0 ${STATUS_STYLES[c.last_order_status] || 'bg-slate-800 text-slate-500 border-slate-700'}`}>{c.last_order_status?.replace(/_/g, ' ') || '—'}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Info label="Phone" value={c.phone || '—'} />
              <Info label="City" value={c.city || '—'} />
              <div className="col-span-2"><Info label="Address" value={c.address || '—'} /></div>
              <Info label="Paid orders" value={c.total_orders.toLocaleString()} strong />
              <Info label="Last store" value={c.last_store_name || '—'} />
              <Info label="Paid value" value={formatCurrency(c.total_value)} strong />
              <Info label="Gross profit" value={formatCurrency(c.total_profit)} strong valueClass={c.total_profit >= 0 ? 'text-emerald-500' : 'text-rose-500'} />
            </div>
            <p className="text-[10px] text-slate-500 text-right">Last paid order: {fmtDate(c.last_order_date)}</p>
          </div>
        ))}
      </div>

      {filtered.length === 0 && customers.length > 0 && <div className="hidden fold-inner:block text-center py-12 text-slate-400 text-sm">No customers match your search</div>}
      {customers.length === 0 && <div className="text-center py-16"><p className="text-4xl mb-4">👥</p><p className="text-slate-400 font-bold">No paid customers yet</p><p className="text-slate-500 text-sm mt-1">Customers appear here after a valid paid order.</p></div>}
    </div>
  );
}

function SummaryCard({ label, value, valueClass = 'text-slate-100' }: { label: string; value: string; valueClass?: string }) {
  return <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 sm:p-5 shadow-sm min-w-0"><p className="text-[9px] sm:text-xs text-slate-400 font-black uppercase tracking-wider mb-1 truncate">{label}</p><p className={`text-2xl sm:text-3xl font-black truncate ${valueClass}`}>{value}</p></div>;
}

function Info({ label, value, strong = false, valueClass = 'text-slate-400' }: { label: string; value: string; strong?: boolean; valueClass?: string }) {
  return <div className="min-w-0"><p className="text-slate-500 font-bold uppercase text-[9px]">{label}</p><p className={`${strong ? 'font-bold text-base' : ''} ${valueClass} truncate`}>{value}</p></div>;
}

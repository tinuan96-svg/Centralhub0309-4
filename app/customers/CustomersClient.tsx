'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { CustomerService, CustomerSummary } from '@/lib/services/customerService';
import { formatCurrency } from '@/lib/utils/currency';
import StoreScopeSelector from '@/components/StoreScopeSelector';

type SortField = 'name' | 'orders' | 'value' | 'profit' | 'last_order';
type SortDirection = 'asc' | 'desc';

const STATUS_STYLES: Record<string, string> = {
  pending_payment: 'bg-slate-800 text-slate-400 border-slate-700',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  picking: 'bg-blue-50 text-blue-700 border-blue-200',
  packing: 'bg-orange-50 text-orange-700 border-orange-200',
  packed: 'bg-amber-50 text-amber-700 border-amber-200',
  ready_to_ship: 'bg-teal-50 text-teal-700 border-teal-200',
  shipment_booked: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  shipped: 'bg-violet-50 text-violet-700 border-violet-200',
  out_for_delivery: 'bg-sky-50 text-sky-700 border-sky-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
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
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'orders':
          cmp = a.total_orders - b.total_orders;
          break;
        case 'value':
          cmp = a.total_value - b.total_value;
          break;
        case 'profit':
          cmp = a.total_profit - b.total_profit;
          break;
        case 'last_order':
          cmp =
            new Date(a.last_order_date).getTime() -
            new Date(b.last_order_date).getTime();
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [customers, search, sortField, sortDir]);

  const totals = useMemo(() => {
    return {
      count: customers.length,
      revenue: customers.reduce((s, c) => s + c.total_value, 0),
      profit: customers.reduce((s, c) => s + c.total_profit, 0),
      orders: customers.reduce((s, c) => s + c.total_orders, 0),
    };
  }, [customers]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortArrow = (field: SortField) =>
    sortField === field ? (sortDir === 'asc' ? ' \u2191' : ' \u2193') : '';

  if (loading) {
    return (
      <div className="p-4 sm:p-8 text-center text-slate-400 uppercase font-bold tracking-widest animate-pulse text-sm">
        Loading customers...
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <h1 className="text-xl sm:text-2xl font-black text-slate-100 uppercase tracking-tighter">
          Customers
        </h1>
        <button
          onClick={loadCustomers}
          className="text-xs font-bold px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-sm">
        <StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 sm:p-5 shadow-sm">
          <p className="text-[10px] sm:text-xs text-slate-400 font-black uppercase tracking-widest mb-1">
            Total Customers
          </p>
          <p className="text-2xl sm:text-3xl font-black text-slate-100">
            {totals.count}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 sm:p-5 shadow-sm">
          <p className="text-[10px] sm:text-xs text-slate-400 font-black uppercase tracking-widest mb-1">
            Total Orders
          </p>
          <p className="text-2xl sm:text-3xl font-black text-slate-100">
            {totals.orders}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 sm:p-5 shadow-sm">
          <p className="text-[10px] sm:text-xs text-slate-400 font-black uppercase tracking-widest mb-1">
            Total Revenue
          </p>
          <p className="text-2xl sm:text-3xl font-black text-emerald-600">
            {formatCurrency(totals.revenue)}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 sm:p-5 shadow-sm">
          <p className="text-[10px] sm:text-xs text-slate-400 font-black uppercase tracking-widest mb-1">
            Total Profit
          </p>
          <p className="text-2xl sm:text-3xl font-black text-cyan-600">
            {formatCurrency(totals.profit)}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-3 sm:p-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search by name, phone, city, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
            🔍
          </span>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden fold-inner:block bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-950 border-b border-slate-700 text-slate-500 text-[10px] font-black uppercase tracking-widest">
              <tr>
                <th
                  className="px-4 py-4 text-left cursor-pointer hover:text-slate-300"
                  onClick={() => toggleSort('name')}
                >
                  Customer{sortArrow('name')}
                </th>
                <th className="px-4 py-4 text-left">Phone</th>
                <th className="px-4 py-4 text-left">Address</th>
                <th className="px-4 py-4 text-left">City</th>
                <th
                  className="px-4 py-4 text-right cursor-pointer hover:text-slate-300"
                  onClick={() => toggleSort('orders')}
                >
                  Orders{sortArrow('orders')}
                </th>
                <th className="px-4 py-4 text-left">Last Status</th>
                <th className="px-4 py-4 text-left">Last Store</th>
                <th
                  className="px-4 py-4 text-right cursor-pointer hover:text-slate-300"
                  onClick={() => toggleSort('value')}
                >
                  Total Value{sortArrow('value')}
                </th>
                <th
                  className="px-4 py-4 text-right cursor-pointer hover:text-slate-300"
                  onClick={() => toggleSort('profit')}
                >
                  Total Profit{sortArrow('profit')}
                </th>
                <th
                  className="px-4 py-4 text-right cursor-pointer hover:text-slate-300"
                  onClick={() => toggleSort('last_order')}
                >
                  Last Order{sortArrow('last_order')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => (
                <tr
                  key={c.key}
                  className="hover:bg-slate-950 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-100">{c.name}</p>
                    {c.email && (
                      <p className="text-[10px] text-slate-400">{c.email}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                    {c.phone || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400 max-w-[200px] truncate">
                    {c.address || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                    {c.city || '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-black text-slate-100">
                    {c.total_orders}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                        STATUS_STYLES[c.last_order_status] ||
                        'bg-slate-800 text-slate-500 border-slate-700'
                      }`}
                    >
                      {c.last_order_status?.replace(/_/g, ' ') || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                    {c.last_store_name || '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-100">
                    {formatCurrency(c.total_value)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`font-bold ${
                        c.total_profit >= 0
                          ? 'text-emerald-600'
                          : 'text-rose-600'
                      }`}
                    >
                      {formatCurrency(c.total_profit)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500 whitespace-nowrap">
                    {fmtDate(c.last_order_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="fold-inner:hidden space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">
            No customers found
          </div>
        )}
        {filtered.map((c) => (
          <div
            key={c.key}
            className="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-slate-100 truncate">{c.name}</p>
                {c.email && (
                  <p className="text-[10px] text-slate-400 truncate">
                    {c.email}
                  </p>
                )}
              </div>
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase border flex-shrink-0 ${
                  STATUS_STYLES[c.last_order_status] ||
                  'bg-slate-800 text-slate-500 border-slate-700'
                }`}
              >
                {c.last_order_status?.replace(/_/g, ' ') || '—'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-slate-400 font-bold uppercase text-[9px]">
                  Phone
                </p>
                <p className="text-slate-400">{c.phone || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase text-[9px]">
                  City
                </p>
                <p className="text-slate-400">{c.city || '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-slate-400 font-bold uppercase text-[9px]">
                  Address
                </p>
                <p className="text-slate-400 truncate">
                  {c.address || '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase text-[9px]">
                  Orders
                </p>
                <p className="text-slate-100 font-black text-base">
                  {c.total_orders}
                </p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase text-[9px]">
                  Last Store
                </p>
                <p className="text-slate-400 truncate">
                  {c.last_store_name || '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase text-[9px]">
                  Total Value
                </p>
                <p className="text-slate-100 font-bold">
                  {formatCurrency(c.total_value)}
                </p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase text-[9px]">
                  Total Profit
                </p>
                <p
                  className={`font-bold ${
                    c.total_profit >= 0
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                  }`}
                >
                  {formatCurrency(c.total_profit)}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 text-right">
              Last order: {fmtDate(c.last_order_date)}
            </p>
          </div>
        ))}
      </div>

      {filtered.length === 0 && customers.length > 0 && (
        <div className="hidden lg:block text-center py-12 text-slate-400 text-sm">
          No customers match your search
        </div>
      )}
      {customers.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-4">👥</p>
          <p className="text-slate-400 font-bold">No customers yet</p>
          <p className="text-slate-400 text-sm mt-1">
            Customers will appear here once orders are placed
          </p>
        </div>
      )}
    </div>
  );
}

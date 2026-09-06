'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  ProfitAnalysisService,
  ProfitOrderRow,
  CategorySales,
  StoreTimeSeries,
} from '@/lib/services/profitAnalysisService';
import { DashboardAnalyticsService } from '@/lib/services/dashboardAnalyticsService';
import { StoreService } from '@/lib/services/storeService';
import { Store } from '@/lib/types';
import { ChartSeries } from '@/components/TimeSeriesChart';
import CategoryBarChart, { BarChartData } from '@/components/CategoryBarChart';
import { formatCurrency } from '@/lib/utils/currency';
import StoreScopeSelector from '@/components/StoreScopeSelector';

const TimeSeriesChart = dynamic(() => import('@/components/TimeSeriesChart'), {
  ssr: false,
  loading: () => <div className="h-80 bg-slate-800/30 rounded-2xl animate-pulse" />,
});

type SortField = 'date' | 'value' | 'shipping' | 'product_cost' | 'packing' | 'profit' | 'margin';
type SortDirection = 'asc' | 'desc';
type TimeRange = '7days' | '30days' | '90days' | 'all';

const STORE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];

const STATUS_STYLES: Record<string, string> = {
  pending_payment: 'bg-slate-800 text-slate-400 border-slate-700',
  confirmed: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/40',
  picking: 'bg-blue-900/40 text-blue-300 border-blue-700/40',
  packing: 'bg-orange-900/40 text-orange-300 border-orange-700/40',
  packed: 'bg-amber-900/40 text-amber-300 border-amber-700/40',
  ready_to_ship: 'bg-teal-900/40 text-teal-300 border-teal-700/40',
  shipped: 'bg-violet-900/40 text-violet-300 border-violet-700/40',
  delivered: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/40',
  completed: 'bg-green-900/40 text-green-300 border-green-700/40',
  cancelled: 'bg-red-900/40 text-red-300 border-red-700/40',
  refunded: 'bg-slate-700/60 text-slate-300 border-slate-600/40',
};

function fmtDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getDateRangeStart(range: TimeRange): Date | null {
  const now = new Date();
  switch (range) {
    case '7days':
      return new Date(now.getTime() - 7 * 86400000);
    case '30days':
      return new Date(now.getTime() - 30 * 86400000);
    case '90days':
      return new Date(now.getTime() - 90 * 86400000);
    case 'all':
      return null;
  }
}

export default function ProfitAnalysisClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [orders, setOrders] = useState<ProfitOrderRow[]>([]);
  const [categorySales, setCategorySales] = useState<CategorySales[]>([]);
  const [storeSeries, setStoreSeries] = useState<StoreTimeSeries[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [totalOverhead, setTotalOverhead] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [timeRange, setTimeRange] = useState<TimeRange>('30days');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [storeFilter, setStoreFilter] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const start = getDateRangeStart(timeRange) || new Date(0);
      const end = new Date();
      // Pass storeFilter to services that support it
      const [o, c, s, st, oh] = await Promise.all([
        ProfitAnalysisService.getAllProfitOrders({ storeId: storeFilter || undefined, startDate: start, endDate: end }),
        ProfitAnalysisService.getCategorySales({ storeId: storeFilter || undefined, startDate: start, endDate: end }),
        ProfitAnalysisService.getStoreTimeSeries(), // This is global comparison
        StoreService.getAllStores(),
        DashboardAnalyticsService.getOverhead(start, end)
      ]);
      setOrders(o);
      setCategorySales(c);
      setStoreSeries(s);
      setStores(st);
      setTotalOverhead(oh);
    } catch (e) {
      console.error('Failed to load profit analysis data:', e);
    } finally {
      setLoading(false);
    }
  }, [timeRange, storeFilter]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const rangeStart = getDateRangeStart(timeRange);

  const filteredOrders = useMemo(() => {
    const q = search.toLowerCase().trim();
    return orders.filter((o) => {
      // NOTE: Service already filters by store and date if supported,
      // but we keep JS filter here for robustness/search/status.
      if (statusFilter !== 'all' && o.order_status !== statusFilter) return false;
      if (q && !o.order_number.toLowerCase().includes(q) && !o.customer_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [orders, search, statusFilter]);

  const sortedOrders = useMemo(() => {
    const list = [...filteredOrders];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'date':
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'value':
          cmp = a.total - b.total;
          break;
        case 'shipping':
          cmp = a.shipping_cost - b.shipping_cost;
          break;
        case 'product_cost':
          cmp = a.product_cost - b.product_cost;
          break;
        case 'packing':
          cmp = a.packing_cost - b.packing_cost;
          break;
        case 'profit':
          cmp = a.gross_profit - b.gross_profit;
          break;
        case 'margin':
          cmp = a.profit_margin - b.profit_margin;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filteredOrders, sortField, sortDir]);

  const summary = useMemo(() => {
    return {
      revenue: filteredOrders.reduce((s, o) => s + o.total, 0),
      profit: filteredOrders.reduce((s, o) => s + o.gross_profit, 0),
      productCost: filteredOrders.reduce((s, o) => s + o.product_cost, 0),
      shippingCost: filteredOrders.reduce((s, o) => s + o.shipping_cost, 0),
      packingCost: filteredOrders.reduce((s, o) => s + o.packing_cost, 0),
      count: filteredOrders.length,
      avgMargin: filteredOrders.length > 0
        ? filteredOrders.reduce((s, o) => s + o.profit_margin, 0) / filteredOrders.length
        : 0,
    };
  }, [filteredOrders]);

  const revenueSeries = useMemo((): ChartSeries[] => {
    const grouped = new Map<string, number>();
    filteredOrders.forEach((o) => {
      const date = new Date(o.created_at).toISOString().split('T')[0];
      grouped.set(date, (grouped.get(date) || 0) + o.total);
    });
    const sortedDates = Array.from(grouped.keys()).sort();
    return [{
      id: 'revenue',
      name: 'Revenue',
      color: '#3b82f6',
      data: sortedDates.map(d => ({ date: d, value: grouped.get(d) || 0 })),
    }];
  }, [filteredOrders]);

  const profitSeries = useMemo((): ChartSeries[] => {
    const grouped = new Map<string, number>();
    filteredOrders.forEach((o) => {
      const date = new Date(o.created_at).toISOString().split('T')[0];
      grouped.set(date, (grouped.get(date) || 0) + o.gross_profit);
    });
    const sortedDates = Array.from(grouped.keys()).sort();
    return [{
      id: 'profit',
      name: 'Profit',
      color: '#10b981',
      data: sortedDates.map(d => ({ date: d, value: grouped.get(d) || 0 })),
    }];
  }, [filteredOrders]);

  const storeChartSeries = useMemo((): ChartSeries[] => {
    return storeSeries.map((s, i) => ({
      id: s.store_id,
      name: s.store_name,
      color: STORE_COLORS[i % STORE_COLORS.length],
      data: s.data.map(d => ({ date: d.date, value: d.revenue })),
    }));
  }, [storeSeries]);

  const categoryChartData = useMemo((): BarChartData[] => {
    return categorySales.map(c => ({
      label: c.category,
      value: c.revenue,
      secondaryValue: c.profit,
    }));
  }, [categorySales]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortArrow = (field: SortField) =>
    sortField === field ? (sortDir === 'asc' ? ' \u2191' : ' \u2193') : '';

  if (loading) {
    return (
      <div className="p-4 sm:p-8 text-center text-slate-500 uppercase font-black tracking-widest animate-pulse text-sm sm:text-base">
        Loading Profit Analysis...
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <h1 className="text-xl sm:text-2xl font-black text-slate-100 uppercase tracking-tighter">
          Profit Analysis
        </h1>
        <button
          onClick={loadAll}
          className="text-xs font-bold px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
        >
          Refresh Data
        </button>
      </div>

      {/* Time range selector */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar bg-slate-900/50 p-1 rounded-2xl border border-slate-800/50 w-fit">
        {(['7days', '30days', '90days', 'all'] as TimeRange[]).map(r => (
          <button
            key={r}
            onClick={() => setTimeRange(r)}
            className={`px-4 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${
              timeRange === r
                ? 'bg-slate-800 text-white shadow-lg border border-slate-700'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {r === '7days' ? '7 Days' : r === '30days' ? '30 Days' : r === '90days' ? '90 Days' : 'All Time'}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 sm:p-5">
          <p className="text-[10px] sm:text-xs text-slate-400 font-black uppercase tracking-widest mb-1">Total Revenue</p>
          <p className="text-2xl sm:text-3xl font-black text-slate-100">{formatCurrency(summary.revenue)}</p>
          <p className="text-[10px] text-slate-500 mt-1">{summary.count} orders</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 sm:p-5">
          <p className="text-[10px] sm:text-xs text-slate-400 font-black uppercase tracking-widest mb-1">Gross Profit</p>
          <p className={`text-2xl sm:text-3xl font-black ${summary.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatCurrency(summary.profit)}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">Order margin: {summary.avgMargin.toFixed(1)}%</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 sm:p-5">
          <p className="text-[10px] sm:text-xs text-slate-400 font-black uppercase tracking-widest mb-1">Net Profit</p>
          <p className={`text-2xl sm:text-3xl font-black ${summary.profit - totalOverhead >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>
            {formatCurrency(summary.profit - totalOverhead)}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">After all expenses</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 sm:p-5">
          <p className="text-[10px] sm:text-xs text-slate-400 font-black uppercase tracking-widest mb-1">Product Cost</p>
          <p className="text-2xl sm:text-3xl font-black text-orange-400">{formatCurrency(summary.productCost)}</p>
          <p className="text-[10px] text-slate-500 mt-1">Purchase cost</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 sm:p-5">
          <p className="text-[10px] sm:text-xs text-slate-400 font-black uppercase tracking-widest mb-1">Logistics Cost</p>
          <p className="text-2xl sm:text-3xl font-black text-cyan-400">{formatCurrency(summary.shippingCost + summary.packingCost + totalOverhead)}</p>
          <p className="text-[10px] text-slate-500 mt-1">Ship/Pack/Overhead</p>
        </div>
      </div>

      {/* Growth charts */}
      <div className="space-y-4 sm:space-y-6">
        <TimeSeriesChart series={revenueSeries} timeRange={timeRange} />
        <TimeSeriesChart series={profitSeries} timeRange={timeRange} />
        {storeChartSeries.length > 0 && (
          <TimeSeriesChart series={storeChartSeries} timeRange={timeRange} />
        )}
        <CategoryBarChart data={categoryChartData} title="Revenue by Category" />
      </div>

      {/* Filters */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3 sm:space-y-4">
        <div className="flex flex-col md:flex-row gap-3 sm:gap-4 items-stretch sm:items-center">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search order number or customer..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-2xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">🔍</span>
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
          >
            <option value="all">All Statuses</option>
            <option value="pending_payment">Pending Payment</option>
            <option value="confirmed">Confirmed</option>
            <option value="picking">Picking</option>
            <option value="packing">Packing</option>
            <option value="packed">Packed</option>
            <option value="ready_to_ship">Ready to Ship</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="refunded">Refunded</option>
          </select>
          <StoreScopeSelector value={storeFilter} onStoreChange={setStoreFilter} />
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/50 border-b border-slate-700/50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
              <tr>
                <th className="px-3 py-4 text-left cursor-pointer hover:text-slate-200" onClick={() => toggleSort('date')}>
                  Date{sortArrow('date')}
                </th>
                <th className="px-3 py-4 text-left">Order No</th>
                <th className="px-3 py-4 text-left">Store</th>
                <th className="px-3 py-4 text-left">Customer</th>
                <th className="px-3 py-4 text-right cursor-pointer hover:text-slate-200" onClick={() => toggleSort('value')}>
                  Value{sortArrow('value')}
                </th>
                <th className="px-3 py-4 text-right cursor-pointer hover:text-slate-200" onClick={() => toggleSort('shipping')}>
                  Shipping{sortArrow('shipping')}
                </th>
                <th className="px-3 py-4 text-right cursor-pointer hover:text-slate-200" onClick={() => toggleSort('product_cost')}>
                  Product Cost{sortArrow('product_cost')}
                </th>
                <th className="px-3 py-4 text-right cursor-pointer hover:text-slate-200" onClick={() => toggleSort('packing')}>
                  Packing{sortArrow('packing')}
                </th>
                <th className="px-3 py-4 text-right cursor-pointer hover:text-slate-200" onClick={() => toggleSort('profit')}>
                  Profit{sortArrow('profit')}
                </th>
                <th className="px-3 py-4 text-right cursor-pointer hover:text-slate-200" onClick={() => toggleSort('margin')}>
                  Margin{sortArrow('margin')}
                </th>
                <th className="px-3 py-4 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {sortedOrders.map(o => (
                <tr key={o.id} className="border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors">
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-200">{fmtDate(o.created_at)}</td>
                  <td className="px-3 py-3 font-mono text-sm font-bold text-slate-100">{o.order_number}</td>
                  <td className="px-3 py-3 text-xs text-slate-300">{o.store_name}</td>
                  <td className="px-3 py-3 text-xs text-slate-300 truncate max-w-[150px]">{o.customer_name || '—'}</td>
                  <td className="px-3 py-3 text-right font-bold text-slate-100">{formatCurrency(o.total)}</td>
                  <td className="px-3 py-3 text-right text-slate-400">{formatCurrency(o.shipping_cost)}</td>
                  <td className="px-3 py-3 text-right text-orange-400">{formatCurrency(o.product_cost)}</td>
                  <td className="px-3 py-3 text-right text-cyan-400">{formatCurrency(o.packing_cost)}</td>
                  <td className="px-3 py-3 text-right">
                    <span className={`font-black ${o.gross_profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatCurrency(o.gross_profit)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-slate-400">{o.profit_margin.toFixed(1)}%</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${STATUS_STYLES[o.order_status] || 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                      {o.order_status.replace(/_/g, ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {sortedOrders.length === 0 && (
          <div className="text-center py-12 text-slate-500 text-sm">No orders found</div>
        )}
        {sortedOrders.map(o => (
          <div key={o.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-mono font-bold text-slate-100 truncate">{o.order_number}</span>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase border flex-shrink-0 ${STATUS_STYLES[o.order_status] || 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                {o.order_status.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-300 truncate">{o.customer_name || '—'}</span>
              <span className="text-xs text-slate-500 whitespace-nowrap">{o.store_name}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-slate-500 font-bold uppercase text-[9px]">Value</p>
                <p className="text-slate-100 font-bold">{formatCurrency(o.total)}</p>
              </div>
              <div>
                <p className="text-slate-500 font-bold uppercase text-[9px]">Profit</p>
                <p className={`font-bold ${o.gross_profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(o.gross_profit)}</p>
              </div>
              <div>
                <p className="text-slate-500 font-bold uppercase text-[9px]">Shipping</p>
                <p className="text-slate-400">{formatCurrency(o.shipping_cost)}</p>
              </div>
              <div>
                <p className="text-slate-500 font-bold uppercase text-[9px]">Product Cost</p>
                <p className="text-orange-400">{formatCurrency(o.product_cost)}</p>
              </div>
              <div>
                <p className="text-slate-500 font-bold uppercase text-[9px]">Packing</p>
                <p className="text-cyan-400">{formatCurrency(o.packing_cost)}</p>
              </div>
              <div>
                <p className="text-slate-500 font-bold uppercase text-[9px]">Margin</p>
                <p className="text-slate-400">{o.profit_margin.toFixed(1)}%</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 text-right">{fmtDate(o.created_at)}</p>
          </div>
        ))}
      </div>

      {sortedOrders.length === 0 && orders.length > 0 && (
        <div className="hidden lg:block text-center py-12 text-slate-500 text-sm">
          No orders match your filters
        </div>
      )}
      {orders.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-4">📊</p>
          <p className="text-slate-400 font-bold">No order data available</p>
          <p className="text-slate-400 text-sm mt-1">Profit analysis will appear here once orders exist</p>
        </div>
      )}
    </div>
  );
}

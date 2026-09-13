'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { InventoryManagementService, InventoryPerformancePoint } from '@/lib/services/inventory/inventoryManagementService';
import LiveIndicator from '@/components/LiveIndicator';
import TimeSeriesChart from '@/components/TimeSeriesChart';
import { formatCurrency } from '@/lib/utils/currency';
import { supabase } from '@/lib/supabase';

export default function InventoryManagementClient({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recentMovements, setRecentMovements] = useState<any[]>([]);
  const [performance, setPerformance] = useState<InventoryPerformancePoint[]>([]);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isLive, setIsLive] = useState(false);

  const loadData = async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const [s, movements, trend] = await Promise.all([
        InventoryManagementService.getDashboardStats(),
        InventoryManagementService.getMovements({ limit: 10 }),
        InventoryManagementService.getPerformanceTrend(30)
      ]);
      setStats(s);
      setRecentMovements(movements);
      setPerformance(trend);
      setLastUpdated(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    loadData(true);

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const queueRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => loadData(false), 350);
    };

    const channel = supabase
      .channel('inventory-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_movements' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'central_inventory' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, queueRefresh)
      .subscribe(status => setIsLive(status === 'SUBSCRIBED'));

    const pollingFallback = setInterval(() => loadData(false), 30000);

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      clearInterval(pollingFallback);
      supabase.removeChannel(channel);
    };
  }, []);

  const stockSeries = useMemo(() => [{
    id: 'stock',
    name: 'Ending stock units',
    color: '#60a5fa',
    data: performance.map(point => ({ date: point.date, value: point.stockUnits }))
  }], [performance]);

  const movementSummary = useMemo(() => {
    const moved = performance.reduce((sum, point) => sum + point.movedUnits, 0);
    const inbound = performance.reduce((sum, point) => sum + point.inboundUnits, 0);
    const outbound = performance.reduce((sum, point) => sum + point.outboundUnits, 0);
    const averageStock = performance.length
      ? performance.reduce((sum, point) => sum + point.stockUnits, 0) / performance.length
      : 0;
    return {
      moved,
      inbound,
      outbound,
      rate: averageStock > 0 ? (moved / averageStock) * 100 : 0
    };
  }, [performance]);

  const movementDate = (value: string) => new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });

  if (loading) return <div className="p-8 text-center text-slate-400">Loading Dashboard...</div>;
  if (!stats) return (
    <div className="p-8 text-center">
      <p className="text-slate-400 mb-4">Unable to load dashboard data. There may be a connection issue.</p>
      <button onClick={() => loadData(true)} className="px-6 py-2 bg-cyan-600 text-white rounded-lg text-sm font-bold hover:bg-cyan-500 transition-all">Retry</button>
    </div>
  );

  const metricCards = [
    { label: 'Active Products', value: stats.totalProducts, icon: '🏷️', tone: 'text-cyan-400', sub: 'Live catalogue registry' },
    { label: 'Stock Units', value: stats.totalStockUnits, icon: '🛒', tone: 'text-blue-400', sub: 'Active tracked inventory' },
    { label: 'Inventory Value', value: formatCurrency(stats.totalInventoryValue), icon: '💰', tone: 'text-emerald-400', sub: 'Cost value · active stock' },
    { label: 'Movements Today', value: stats.movementsToday, icon: '🔄', tone: 'text-amber-400', sub: 'Inventory ledger entries' },
  ];

  return (
    <main className="mx-auto max-w-[1800px] space-y-5 p-4 pb-24 fold-inner:p-5 fold-inner:pb-8 lg:p-6 min-w-0">
      <header className="flex flex-col gap-4 fold-inner:flex-row fold-inner:items-center fold-inner:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <span className="text-3xl">📦</span> Inventory Dashboard
          </h1>
          <p className="text-slate-400 text-sm mt-1">Live stock monitoring, valuation and warehouse control</p>
        </div>
        <div className="flex items-center gap-3 self-end fold-inner:self-auto">
          <button onClick={() => loadData(false)} className="p-2.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors" title="Refresh Data">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
          <LiveIndicator isLive={isLive} lastUpdated={lastUpdated} />
        </div>
      </header>

      <section className="grid grid-cols-2 fold-inner:grid-cols-4 gap-3">
        {metricCards.map(metric => (
          <div key={metric.label} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 fold-inner:p-5 hover:border-slate-700 transition-all">
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{metric.label}</span>
              <span className="text-lg shrink-0">{metric.icon}</span>
            </div>
            <p className={`break-words text-2xl fold-inner:text-3xl font-bold ${metric.tone}`}>{metric.value}</p>
            <p className="text-[9px] text-slate-500 font-medium mt-1 uppercase tracking-tight">{metric.sub}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 fold-inner:grid-cols-3 gap-4">
        <div className="fold-inner:col-span-2 space-y-4 min-w-0">
          <div className="space-y-3">
            <TimeSeriesChart
              compact
              dense
              timeRange="30D"
              title="Inventory stock position"
              subtitle="Daily ending stock for the active catalogue · derived from the audited movement ledger"
              unit="count"
              series={stockSeries}
            />
            <div className="grid grid-cols-2 fold-inner:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-500">30D moved</p><p className="mt-1 text-lg font-black text-white">{movementSummary.moved.toLocaleString()}</p></div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Inbound</p><p className="mt-1 text-lg font-black text-emerald-300">+{movementSummary.inbound.toLocaleString()}</p></div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Outbound</p><p className="mt-1 text-lg font-black text-rose-300">-{movementSummary.outbound.toLocaleString()}</p></div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Movement rate</p><p className="mt-1 text-lg font-black text-cyan-300">{movementSummary.rate.toFixed(1)}%</p></div>
            </div>
          </div>

          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-4 fold-inner:p-5">
            <h3 className="text-base font-bold text-slate-200 mb-4 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2"><span>🔄</span> Recent Stock Ledger Entries</span>
              <Link href="/inventory-management/movements" className="text-[10px] text-cyan-400 hover:underline uppercase font-black shrink-0">View All</Link>
            </h3>
            <div className="space-y-2">
              {recentMovements.length === 0 && <p className="text-sm text-slate-500 text-center py-6">No stock movements recorded yet.</p>}
              {recentMovements.map(m => (
                <div key={m.id} className="grid grid-cols-[auto_minmax(0,1fr)] fold-inner:grid-cols-[auto_minmax(0,1fr)_minmax(150px,0.7fr)] gap-3 items-center py-3 border-b border-slate-800/50 last:border-0 hover:bg-slate-800/20 px-2 rounded-lg transition-colors">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold ${m.change_amount > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>{m.change_amount > 0 ? '+' : ''}{m.change_amount}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{m.product_name || 'Unknown Product'}</p>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">{m.action_type} · {movementDate(m.created_at)}</p>
                  </div>
                  <div className="col-start-2 fold-inner:col-start-auto min-w-0 fold-inner:text-right">
                    <p className="text-xs font-mono text-slate-400">{m.old_stock} → {m.new_stock}</p>
                    <p className="text-[10px] text-slate-600 break-words">{m.notes || 'Inventory movement'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-4 min-w-0">
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-slate-200 font-bold text-sm uppercase tracking-widest mb-4">Quick Operations</h3>
            <div className="grid grid-cols-1 gap-2">
              <Link href="/inventory-management/stock/bulk" className="flex items-center gap-3 p-3 bg-cyan-600/10 rounded-xl hover:bg-cyan-600/20 text-cyan-400 transition-all border border-cyan-500/30 group">
                <span className="text-lg">📝</span><div className="flex-1 min-w-0"><p className="text-sm font-bold">Bulk Stock Entry</p><p className="text-[10px] text-cyan-400/70">Enter counts for multiple items</p></div>
              </Link>
              <Link href="/inventory-management/stock" className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl hover:bg-slate-700/50 transition-all border border-transparent group">
                <span className="text-lg">📥</span><div className="flex-1 min-w-0"><p className="text-sm font-bold">Receive Stock</p><p className="text-[10px] text-slate-500 group-hover:text-cyan-400/70">Check-in supplier deliveries</p></div>
              </Link>
              <Link href="/inventory-management/adjustments" className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl hover:bg-amber-600/10 hover:text-amber-400 transition-all border border-transparent hover:border-amber-500/30 group">
                <span className="text-lg">⚖️</span><div className="flex-1 min-w-0"><p className="text-sm font-bold">Stock Adjustment</p><p className="text-[10px] text-slate-500 group-hover:text-amber-400/70">Correct counts or write-offs</p></div>
              </Link>
            </div>
          </div>

          <div className={`bg-rose-900/10 border border-rose-500/30 rounded-2xl p-5 ${stats.outOfStockCount > 0 ? 'opacity-100' : 'opacity-50'}`}>
            <h3 className="text-rose-400 font-bold text-sm uppercase tracking-widest mb-3 flex items-center justify-between gap-3">Out of Stock <span className="text-xs bg-rose-500 text-white px-2 py-0.5 rounded-full font-mono">{stats.outOfStockCount}</span></h3>
            <p className="text-xs text-slate-400 leading-relaxed">Active tracked products with zero available stock.</p>
            <Link href="/inventory-management/stock?filter=out" className="mt-4 block py-2 text-center text-xs font-bold bg-rose-500/20 text-rose-400 rounded-lg hover:bg-rose-500/30 transition-all">Restock Now</Link>
          </div>

          <div className={`bg-amber-900/10 border border-amber-500/30 rounded-2xl p-5 ${stats.lowStockCount > 0 ? 'opacity-100' : 'opacity-50'}`}>
            <h3 className="text-amber-400 font-bold text-sm uppercase tracking-widest mb-3 flex items-center justify-between gap-3">Low Stock Alerts <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-mono">{stats.lowStockCount}</span></h3>
            <p className="text-xs text-slate-400 leading-relaxed">Active products above zero but at or below their reorder threshold.</p>
            <Link href="/inventory-management/stock?filter=low" className="mt-4 block py-2 text-center text-xs font-bold bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-all">Review Reorders</Link>
          </div>
        </aside>
      </section>
    </main>
  );
}

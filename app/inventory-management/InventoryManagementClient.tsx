'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { InventoryManagementService } from '@/lib/services/inventory/inventoryManagementService';
import LiveIndicator from '@/components/LiveIndicator';
import { formatCurrency } from '@/lib/utils/currency';

export default function InventoryManagementClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recentMovements, setRecentMovements] = useState<any[]>([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, movements] = await Promise.all([
        InventoryManagementService.getDashboardStats(),
        InventoryManagementService.getMovements({ limit: 10 })
      ]);
      setStats(s);
      setRecentMovements(movements);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Loading Dashboard...</div>;
  if (!stats) return (
    <div className="p-8 text-center">
      <p className="text-slate-400 mb-4">Unable to load dashboard data. There may be a connection issue.</p>
      <button onClick={loadData} className="px-6 py-2 bg-cyan-600 text-white rounded-lg text-sm font-bold hover:bg-cyan-500 transition-all">Retry</button>
    </div>
  );

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <span className="text-3xl">📦</span> Inventory Dashboard
          </h1>
          <p className="text-slate-400 text-sm mt-1">Enterprise-grade stock monitoring and warehouse control</p>
        </div>
        <div className="flex items-center gap-3">
           <button onClick={loadData} className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors" title="Refresh Data">
             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
           </button>
           <LiveIndicator isLive={true} lastUpdated={new Date()} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Products', value: stats.totalProducts, icon: '🏷️', color: 'cyan', sub: 'Active Registry' },
          { label: 'Stock Units', value: stats.totalStockUnits, icon: '🛒', color: 'blue', sub: 'Total Physical' },
          { label: 'Inventory Value', value: formatCurrency(stats.totalInventoryValue), icon: '💰', color: 'emerald', sub: 'Asset Value (Cost)' },
          { label: 'Movements Today', value: stats.movementsToday, icon: '🔄', color: 'amber', sub: 'Total Transactions' },
        ].map(m => (
          <div key={m.label} className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{m.label}</span>
              <span className="text-xl">{m.icon}</span>
            </div>
            <p className={`text-3xl font-bold text-${m.color}-400`}>{m.value}</p>
            <p className="text-[10px] text-slate-500 font-medium mt-1 uppercase tracking-tighter">{m.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 h-[400px] flex flex-col items-center justify-center">
             <span className="text-4xl mb-4">📊</span>
             <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Inventory Performance Analytics</p>
             <p className="text-[10px] text-slate-600 mt-2">Cumulative Stock Trend & Turnover Analysis</p>
          </div>

          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6">
            <h3 className="text-base font-bold text-slate-200 mb-6 flex items-center justify-between">
              <span className="flex items-center gap-2"><span>🔄</span> Recent Stock Ledger Entries</span>
              <Link href="/inventory-management/movements" className="text-[10px] text-cyan-400 hover:underline uppercase font-black">View All</Link>
            </h3>
            <div className="space-y-4">
              {recentMovements.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-6">No recent stock movements</p>
              )}
              {recentMovements.map(m => (
                <div key={m.id} className="flex items-center justify-between py-3 border-b border-slate-800/50 last:border-0 hover:bg-slate-800/20 px-2 rounded-lg transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${m.change_amount > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>{m.change_amount > 0 ? '+' : ''}{m.change_amount}</div>
                    <div>
                      <p className="text-sm font-medium text-slate-200">{m.product_name || 'Unknown Product'}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">{m.action_type} • {new Date(m.created_at).toLocaleTimeString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono text-slate-400">{m.old_stock} → {m.new_stock}</p>
                    <p className="text-[10px] text-slate-600">{m.notes}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
             <h3 className="text-slate-200 font-bold text-sm uppercase tracking-widest mb-4">Quick Operations</h3>
             <div className="grid grid-cols-1 gap-2">
                <Link href="/inventory-management/stock/bulk" className="flex items-center gap-3 p-3 bg-cyan-600/10 rounded-xl hover:bg-cyan-600/20 text-cyan-400 transition-all border border-cyan-500/30 group">
                   <span className="text-lg">📝</span>
                   <div className="flex-1">
                      <p className="text-sm font-bold">Bulk Stock Entry</p>
                      <p className="text-[10px] text-cyan-400/70">Manually enter counts for multiple items</p>
                   </div>
                </Link>
                <Link href="/inventory-management/stock" className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl hover:bg-slate-700/50 transition-all border border-transparent group">
                   <span className="text-lg">📥</span>
                   <div className="flex-1">
                      <p className="text-sm font-bold">Receive Stock</p>
                      <p className="text-[10px] text-slate-500 group-hover:text-cyan-400/70">Check-in supplier deliveries</p>
                   </div>
                </Link>
                <Link href="/inventory-management/adjustments" className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl hover:bg-amber-600/10 hover:text-amber-400 transition-all border border-transparent hover:border-amber-500/30 group">
                   <span className="text-lg">⚖️</span>
                   <div className="flex-1">
                      <p className="text-sm font-bold">Stock Adjustment</p>
                      <p className="text-[10px] text-slate-500 group-hover:text-amber-400/70">Correct counts or write-offs</p>
                   </div>
                </Link>
             </div>
          </div>

          <div className={`bg-rose-900/10 border border-rose-500/30 rounded-2xl p-6 ${stats.outOfStockCount > 0 ? 'opacity-100' : 'opacity-50'}`}>
            <h3 className="text-rose-400 font-bold text-sm uppercase tracking-widest mb-4 flex items-center justify-between">Out of Stock <span className="text-xs bg-rose-500 text-white px-2 py-0.5 rounded-full font-mono">{stats.outOfStockCount}</span></h3>
            <p className="text-xs text-slate-400 leading-relaxed">Products with zero available quantity require immediate replenishment.</p>
            <Link href="/inventory-management/stock?filter=out" className="mt-4 block py-2 text-center text-xs font-bold bg-rose-500/20 text-rose-400 rounded-lg hover:bg-rose-500/30 transition-all">Restock Now</Link>
          </div>

          <div className={`bg-amber-900/10 border border-amber-500/30 rounded-2xl p-6 ${stats.lowStockCount > 0 ? 'opacity-100' : 'opacity-50'}`}>
            <h3 className="text-amber-400 font-bold text-sm uppercase tracking-widest mb-4 flex items-center justify-between">Low Stock Alerts <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-mono">{stats.lowStockCount}</span></h3>
            <p className="text-xs text-slate-400 leading-relaxed">Products currently below their defined threshold in the master registry.</p>
            <Link href="/inventory-management/stock?filter=low" className="mt-4 block py-2 text-center text-xs font-bold bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-all">Review Reorders</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

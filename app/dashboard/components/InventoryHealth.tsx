'use client';

import { useEffect, useState } from 'react';
import { InventoryService } from '@/lib/services/inventoryService';
import { useDashboardFilterStore } from '@/lib/store/dashboardFilterStore';
import { formatCurrency } from '@/lib/utils/currency';
import Link from 'next/link';

export default function InventoryHealth() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { selectedStoreId } = useDashboardFilterStore();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await InventoryService.getInventoryStats();
      setStats(data);
      setLoading(false);
    })();
  }, [selectedStoreId]);

  if (loading) {
    return <div className="h-40 bg-slate-800/20 border border-slate-800 rounded-3xl animate-pulse" />;
  }

  return (
    <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-[2.5rem] p-8 shadow-2xl">
      <div className="flex items-center justify-between mb-8">
        <div>
           <h2 className="text-xl font-black text-white uppercase tracking-tighter">Inventory Health</h2>
           <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Network Supply Control</p>
        </div>
        <Link href="/inventory" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-700 transition-all">
          Manage Inventory →
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="space-y-2">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">In Stock</p>
           <p className="text-3xl font-black text-white">{(stats?.totalItems || 0) - (stats?.outOfStockCount || 0)}</p>
           <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: '85%' }} />
           </div>
        </div>

        <div className="space-y-2">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-amber-500">Low Stock</p>
           <p className="text-3xl font-black text-amber-400">{stats?.lowStockCount || 0}</p>
           <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500" style={{ width: '15%' }} />
           </div>
        </div>

        <div className="space-y-2">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-rose-500">Out of Stock</p>
           <p className="text-3xl font-black text-rose-400">{stats?.outOfStockCount || 0}</p>
           <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-rose-500" style={{ width: '5%' }} />
           </div>
        </div>

        <div className="bg-slate-950/50 rounded-2xl p-4 border border-slate-800/50">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Restock Required</p>
           <p className="text-xl font-bold text-cyan-400">12 Products</p>
           <Link href="/backorder-planning" className="text-[8px] font-black text-slate-500 hover:text-cyan-400 uppercase tracking-widest mt-2 block">
             Open Procurement →
           </Link>
        </div>
      </div>
    </section>
  );
}

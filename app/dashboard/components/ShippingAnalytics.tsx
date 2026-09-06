'use client';

import { useState, useEffect } from 'react';
import { FulfillmentService } from '@/lib/services/fulfillmentService';
import { useDashboardFilterStore } from '@/lib/store/dashboardFilterStore';
import Link from 'next/link';

export default function ShippingAnalytics() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { selectedStoreId } = useDashboardFilterStore();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await FulfillmentService.getFulfillmentStats(selectedStoreId);
      setStats(data);
      setLoading(false);
    })();
  }, [selectedStoreId]);

  if (loading) return <div className="h-40 bg-slate-800/20 border border-slate-800 rounded-3xl animate-pulse" />;

  const total = (stats?.ready_to_ship || 0) + (stats?.shipped || 0) + (stats?.delivered || 0);
  const successRate = total > 0 ? ((stats?.delivered || 0) / total) * 100 : 0;

  return (
    <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-[2.5rem] p-8 shadow-2xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
           <h2 className="text-xl font-black text-white uppercase tracking-tighter">Shipping Logistics</h2>
           <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Carrier Performance & Dispatch</p>
        </div>
        <div className="text-right">
           <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-1">Success Rate</p>
           <p className="text-3xl font-black text-white">{successRate.toFixed(1)}%</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="space-y-1">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-cyan-400">Ready to Ship</p>
           <p className="text-3xl font-black text-white">{stats?.ready_to_ship || 0}</p>
        </div>
        <div className="space-y-1">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-violet-400">In Transit</p>
           <p className="text-3xl font-black text-white">{stats?.shipped || 0}</p>
        </div>
        <div className="space-y-1">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-emerald-400">Delivered</p>
           <p className="text-3xl font-black text-white">{stats?.delivered || 0}</p>
        </div>
        <div className="space-y-1">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-rose-500">Failed / Delayed</p>
           <p className="text-3xl font-black text-rose-400">{stats?.failed_shipments || 0}</p>
        </div>
      </div>

      <div className="pt-6 border-t border-slate-800/50 flex items-center justify-between">
         <div className="flex items-center gap-6">
            <div>
               <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-1">Avg Picking</p>
               <p className="text-xs font-bold text-slate-400">{stats?.avg_picking_time || '0m'}</p>
            </div>
            <div>
               <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-1">Carrier</p>
               <p className="text-xs font-bold text-slate-400">DHL eCommerce UK</p>
            </div>
         </div>
         <Link href="/shipping" className="text-[10px] font-black text-cyan-500 hover:text-cyan-400 uppercase tracking-widest">
           Shipping Dashboard →
         </Link>
      </div>
    </section>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useDashboardFilterStore } from '@/lib/store/dashboardFilterStore';
import { formatCurrency } from '@/lib/utils/currency';

interface Target {
  id: string;
  metric_key: string;
  target_value: number;
  period_type: string;
  current_value?: number;
}

export default function BusinessTargets({ currentStats }: { currentStats: any }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedStoreId } = useDashboardFilterStore();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('business_targets')
        .select('*')
        .eq('is_active', true);

      // Filter by store if needed
      const filtered = data ? data.filter(t => !t.store_id || t.store_id === selectedStoreId) : [];
      setTargets(filtered);
      setLoading(false);
    })();
  }, [selectedStoreId]);

  if (loading) return <div className="h-40 bg-slate-800/20 border border-slate-800 rounded-3xl animate-pulse" />;

  const getMetricValue = (key: string) => {
    switch (key) {
      case 'revenue': return currentStats.totalRevenue;
      case 'orders': return currentStats.totalOrders;
      case 'profit': return currentStats.actualGrossProfit;
      default: return 0;
    }
  };

  return (
    <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-[2.5rem] p-8 shadow-2xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
           <h2 className="text-xl font-black text-white uppercase tracking-tighter">Business Targets</h2>
           <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Growth & Performance Goals</p>
        </div>
        <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-700 transition-all">
          Configure Targets
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {targets.map(target => {
          const current = getMetricValue(target.metric_key);
          const percent = Math.min(100, (current / target.target_value) * 100);

          return (
            <div key={target.id} className="space-y-3">
               <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{target.metric_key} · {target.period_type}</p>
                    <p className="text-lg font-bold text-white uppercase tracking-tight">
                       {target.metric_key === 'orders' ? current : formatCurrency(current)}
                       <span className="text-slate-600 mx-2">/</span>
                       {target.metric_key === 'orders' ? target.target_value : formatCurrency(target.target_value)}
                    </p>
                  </div>
                  <p className={`text-xl font-black ${percent >= 100 ? 'text-emerald-400' : 'text-cyan-400'}`}>{percent.toFixed(0)}%</p>
               </div>
               <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700/30 p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${percent >= 100 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.5)]'}`}
                    style={{ width: `${percent}%` }}
                  />
               </div>
            </div>
          );
        })}
        {targets.length === 0 && (
           <div className="col-span-full py-10 text-center bg-slate-950/30 rounded-2xl border border-dashed border-slate-800">
              <p className="text-slate-600 font-bold uppercase tracking-widest text-[10px]">No active targets defined for this period</p>
           </div>
        )}
      </div>
    </section>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useDashboardFilterStore } from '@/lib/store/dashboardFilterStore';
import { formatCurrency } from '@/lib/utils/currency';
import { getDateRange } from '@/lib/utils/date';

export default function PaymentAnalytics() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { selectedStoreId, timeRange, customStartDate, customEndDate } = useDashboardFilterStore();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { start, end } = getDateRange(timeRange, customStartDate || undefined, customEndDate || undefined);

      let query = supabase
        .from('orders')
        .select('payment_method, payment_status, total')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());

      if (selectedStoreId !== 'all') {
        query = query.eq('store_id', selectedStoreId);
      }

      const { data } = await query;

      if (data) {
        const methods: Record<string, number> = {};
        let success = 0;
        let failed = 0;
        let pending = 0;
        let successVal = 0;

        data.forEach(o => {
          methods[o.payment_method] = (methods[o.payment_method] || 0) + 1;
          if (o.payment_status === 'paid') {
            success++;
            successVal += Number(o.total || 0);
          } else if (o.payment_status === 'failed') {
            failed++;
          } else {
            pending++;
          }
        });

        setStats({ methods, success, failed, pending, successVal });
      }
      setLoading(false);
    })();
  }, [selectedStoreId, timeRange, customStartDate, customEndDate]);

  if (loading) return <div className="h-40 bg-slate-800/20 border border-slate-800 rounded-3xl animate-pulse" />;

  const total = (stats?.success || 0) + (stats?.failed || 0) + (stats?.pending || 0);
  const successRate = total > 0 ? (stats.success / total) * 100 : 0;

  return (
    <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-[2.5rem] p-8 shadow-2xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
           <h2 className="text-xl font-black text-white uppercase tracking-tighter">Payment Integrity</h2>
           <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Transaction Processing & Risk</p>
        </div>
        <div className="text-right">
           <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-1">Approval Rate</p>
           <p className="text-3xl font-black text-white">{successRate.toFixed(1)}%</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="space-y-1">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-emerald-400">Captured</p>
           <p className="text-3xl font-black text-white">{stats?.success || 0}</p>
        </div>
        <div className="space-y-1">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-rose-500">Declined</p>
           <p className="text-3xl font-black text-white">{stats?.failed || 0}</p>
        </div>
        <div className="space-y-1">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-amber-400">Awaiting</p>
           <p className="text-3xl font-black text-white">{stats?.pending || 0}</p>
        </div>
        <div className="space-y-1">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Gross Captured</p>
           <p className="text-2xl font-black text-white truncate">{formatCurrency(stats?.successVal || 0)}</p>
        </div>
      </div>

      <div className="pt-6 border-t border-slate-800/50">
         <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Channel Breakdown</p>
         <div className="flex flex-wrap gap-4">
            {Object.entries(stats?.methods || {}).map(([method, count]: any) => (
              <div key={method} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50">
                 <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{method}</span>
                 <span className="text-[10px] font-black text-cyan-400">{count}</span>
              </div>
            ))}
         </div>
      </div>
    </section>
  );
}

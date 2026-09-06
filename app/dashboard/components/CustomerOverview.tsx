'use client';

import { useState, useEffect } from 'react';
import { CustomerService, CustomerSummary } from '@/lib/services/customerService';
import { useDashboardFilterStore } from '@/lib/store/dashboardFilterStore';
import { formatCurrency } from '@/lib/utils/currency';
import Link from 'next/link';

export default function CustomerOverview() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedStoreId } = useDashboardFilterStore();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await CustomerService.getAllCustomers(selectedStoreId === 'all' ? undefined : selectedStoreId);
      setCustomers(data);
      setLoading(false);
    })();
  }, [selectedStoreId]);

  if (loading) return <div className="h-64 bg-slate-800/20 border border-slate-800 rounded-3xl animate-pulse" />;

  const total = customers.length;
  const newCustomers = customers.filter(c => {
    const d = new Date(c.last_order_date);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return d >= thirtyDaysAgo && c.total_orders === 1;
  }).length;

  const vips = customers.filter(c => c.total_value > 500).length;
  const repeatRate = total > 0 ? (customers.filter(c => c.total_orders > 1).length / total) * 100 : 0;

  return (
    <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-[2.5rem] p-8 shadow-2xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
           <h2 className="text-xl font-black text-white uppercase tracking-tighter">Customer Intelligence</h2>
           <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Acquisition & Retention</p>
        </div>
        <Link href="/customers" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-700 transition-all">
          Full Directory →
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="space-y-1">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Audience</p>
           <p className="text-4xl font-black text-white">{total.toLocaleString()}</p>
        </div>
        <div className="space-y-1">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-emerald-400">New (30d)</p>
           <p className="text-4xl font-black text-white">{newCustomers}</p>
        </div>
        <div className="space-y-1">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-cyan-400">Repeat Rate</p>
           <p className="text-4xl font-black text-white">{repeatRate.toFixed(1)}%</p>
        </div>
        <div className="space-y-1">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-amber-500">VIP Cluster</p>
           <p className="text-4xl font-black text-white">{vips}</p>
        </div>
      </div>

      <div className="pt-6 border-t border-slate-800/50">
         <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Top Growth Contributors</p>
         <div className="space-y-3">
            {customers.slice(0, 3).map(c => (
              <div key={c.key} className="flex items-center justify-between group">
                 <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 group-hover:text-cyan-400 transition-colors">
                      {c.name[0]}
                    </div>
                    <span className="text-sm font-bold text-slate-200 uppercase tracking-tight">{c.name}</span>
                 </div>
                 <div className="text-right">
                    <p className="text-xs font-black text-white">{formatCurrency(c.total_value)}</p>
                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{c.total_orders} Orders</p>
                 </div>
              </div>
            ))}
         </div>
      </div>
    </section>
  );
}

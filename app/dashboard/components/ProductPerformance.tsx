'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useDashboardFilterStore } from '@/lib/store/dashboardFilterStore';
import { formatCurrency } from '@/lib/utils/currency';
import { getDateRange } from '@/lib/utils/date';
import ProductImage from '@/components/ProductImage';

export default function ProductPerformance() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedStoreId, timeRange, customStartDate, customEndDate } = useDashboardFilterStore();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { start, end } = getDateRange(timeRange, customStartDate || undefined, customEndDate || undefined);

      let query = supabase
        .from('order_items')
        .select(`
          product_id,
          product_name,
          total_price,
          quantity,
          orders!inner(created_at, store_id)
        `)
        .gte('orders.created_at', start.toISOString())
        .lte('orders.created_at', end.toISOString());

      if (selectedStoreId !== 'all') {
        query = query.eq('orders.store_id', selectedStoreId);
      }

      const { data } = await query;

      if (data) {
        const stats: Record<string, any> = {};
        data.forEach((item: any) => {
          if (!stats[item.product_id]) {
            stats[item.product_id] = {
              id: item.product_id,
              name: item.product_name,
              revenue: 0,
              units: 0
            };
          }
          stats[item.product_id].revenue += Number(item.total_price || 0);
          stats[item.product_id].units += Number(item.quantity || 0);
        });

        const sorted = Object.values(stats).sort((a, b) => b.revenue - a.revenue);
        setProducts(sorted.slice(0, 10));
      }
      setLoading(false);
    })();
  }, [selectedStoreId, timeRange, customStartDate, customEndDate]);

  if (loading) return <div className="h-64 bg-slate-800/20 border border-slate-800 rounded-3xl animate-pulse" />;

  return (
    <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-[2.5rem] p-8 shadow-2xl space-y-8">
      <div>
         <h2 className="text-xl font-black text-white uppercase tracking-tighter">Product Performance</h2>
         <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Velocity & Volume Leaders</p>
      </div>

      <div className="space-y-4">
        {products.map((p, idx) => (
          <div key={p.id} className="flex items-center justify-between group">
            <div className="flex items-center gap-4">
               <span className="text-xs font-black text-slate-700 w-4 group-hover:text-cyan-500 transition-colors">0{idx + 1}</span>
               <div>
                  <p className="text-sm font-bold text-slate-200 uppercase tracking-tight line-clamp-1">{p.name}</p>
                  <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">{p.units} Units Sold</p>
               </div>
            </div>
            <div className="text-right">
               <p className="text-sm font-black text-white">{formatCurrency(p.revenue)}</p>
               <div className="w-24 h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                  <div className="h-full bg-cyan-500/50" style={{ width: `${(p.revenue / products[0].revenue) * 100}%` }} />
               </div>
            </div>
          </div>
        ))}
        {products.length === 0 && <p className="text-center py-12 text-slate-600 font-bold uppercase text-[10px] tracking-widest">No sales data available</p>}
      </div>
    </section>
  );
}

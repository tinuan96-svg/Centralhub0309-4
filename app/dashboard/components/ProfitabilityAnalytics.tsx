'use client';

import { useState, useEffect } from 'react';
import { ProfitAnalysisService, ProfitOrderRow } from '@/lib/services/profitAnalysisService';
import { useDashboardFilterStore } from '@/lib/store/dashboardFilterStore';
import { formatCurrency } from '@/lib/utils/currency';
import { getDateRange } from '@/lib/utils/date';

export default function ProfitabilityAnalytics() {
  const [data, setData] = useState<ProfitOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedStoreId, timeRange, customStartDate, customEndDate } = useDashboardFilterStore();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { start, end } = getDateRange(timeRange, customStartDate || undefined, customEndDate || undefined);
      const orders = await ProfitAnalysisService.getAllProfitOrders({
        storeId: selectedStoreId === 'all' ? undefined : selectedStoreId,
        startDate: start,
        endDate: end
      });
      setData(orders);
      setLoading(false);
    })();
  }, [selectedStoreId, timeRange, customStartDate, customEndDate]);

  if (loading) return <div className="h-64 bg-slate-800/20 border border-slate-800 rounded-3xl animate-pulse" />;

  const totals = data.reduce((acc, curr) => ({
    revenue: acc.revenue + (curr.total - curr.delivery_fee),
    cost: acc.cost + curr.product_cost,
    profit: acc.profit + curr.gross_profit,
    shipping: acc.shipping + curr.shipping_cost,
    packing: acc.packing + curr.packing_cost,
  }), { revenue: 0, cost: 0, profit: 0, shipping: 0, packing: 0 });

  const margin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  return (
    <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-[2.5rem] p-8 shadow-2xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
           <h2 className="text-xl font-black text-white uppercase tracking-tighter">Profitability Bridge</h2>
           <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Financial Reconciliation</p>
        </div>
        <div className="text-right">
           <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-1">Net Margin</p>
           <p className="text-3xl font-black text-white">{margin.toFixed(1)}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {[
          { label: 'Gross Revenue', value: totals.revenue, color: 'text-white' },
          { label: 'Product Cost', value: -totals.cost, color: 'text-rose-400' },
          { label: 'Shipping (Net)', value: -totals.shipping, color: 'text-rose-400' },
          { label: 'Packing (Net)', value: -totals.packing, color: 'text-rose-400' },
          { label: 'Gross Profit', value: totals.profit, color: 'text-emerald-400', bold: true },
        ].map(item => (
          <div key={item.label} className="bg-slate-950/40 p-5 rounded-2xl border border-slate-800/50">
             <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">{item.label}</p>
             <p className={`text-lg font-bold ${item.color} ${item.bold ? 'text-xl font-black' : ''}`}>{formatCurrency(item.value)}</p>
          </div>
        ))}
      </div>

      <div className="pt-4 flex items-center justify-between border-t border-slate-800/50">
         <div className="flex items-center gap-6">
            <div>
               <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-1">Tax Engine</p>
               <p className="text-xs font-bold text-slate-400">VAT Reconciliation Active</p>
            </div>
            <div>
               <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-1">Fees</p>
               <p className="text-xs font-bold text-slate-400">Gateway Estimation: 2.9%</p>
            </div>
         </div>
         <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-700 transition-all">
           Download Full Report
         </button>
      </div>
    </section>
  );
}

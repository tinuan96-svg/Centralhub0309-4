'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { IntelligenceService } from '@/lib/services/intelligenceService';
import TimeSeriesChart, { ChartSeries } from '@/components/TimeSeriesChart';
import CategoryBarChart from '@/components/CategoryBarChart';
import StoreBadge from '@/components/StoreBadge';
import { designTokens } from '@/lib/design-system';

export default function BrandDetailClient({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [data, setData] = useState<any>(null);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMetric, setActiveMetric] = useState<'revenue' | 'units' | 'profit'>('revenue');

  const storeId = searchParams.get('storeId') || 'all';
  const timeRange = searchParams.get('timeRange') || '30days';

  useEffect(() => {
    loadBrandAnalytics();
  }, [id, storeId, timeRange]);

  const loadBrandAnalytics = async () => {
    setLoading(true);
    const { start, end } = IntelligenceService.getDateRange(timeRange);
    const options = { storeId, startDate: start, endDate: end };

    const [detail, trend] = await Promise.all([
      IntelligenceService.getBrandDetail(id as string, options),
      IntelligenceService.getTrendData(options, id as string, 'brand')
    ]);

    setData(detail);
    setTrendData(trend);
    setLoading(false);
  };

  const chartSeries = useMemo((): ChartSeries[] => {
    if (!trendData.length) return [];
    return [{
      id: 'brand-trend',
      name: data?.brand?.name || 'Brand',
      color: '#3b82f6',
      data: trendData.map(d => ({
        date: d.date,
        value: activeMetric === 'revenue' ? d.revenue : activeMetric === 'units' ? d.units : d.profit
      }))
    }];
  }, [trendData, activeMetric, data]);

  const storeChartData = useMemo(() => {
    if (!data?.storePerformance) return [];
    return data.storePerformance.map((sp: any) => ({
      label: sp.storeName,
      value: sp.revenue,
      secondaryValue: sp.grossProfit
    })).sort((a: any, b: any) => b.value - a.value);
  }, [data]);

  const categoryChartData = useMemo(() => {
    if (!data?.categoryDistribution) return [];
    return data.categoryDistribution.map((cd: any) => ({
      label: cd.categoryName,
      value: cd.revenue,
      secondaryValue: cd.units
    })).sort((a: any, b: any) => b.value - a.value);
  }, [data]);

  const insights = useMemo(() => {
    if (!data) return [];
    const res = [];
    const m = data.metrics;

    if (m.revenue > 0) {
      res.push({
        type: 'success',
        title: 'Strong Performer',
        text: `${data.brand.name} generated ${fmt(m.revenue)} in the selected period across ${m.storeCount} stores.`
      });
    }

    if (m.margin < 15 && m.revenue > 0) {
      res.push({
        type: 'warning',
        title: 'Margin Warning',
        text: `Gross margin is low (${m.margin.toFixed(1)}%). Review purchase costs or discount strategy.`
      });
    }

    if (m.lowStockProducts > 0) {
      res.push({
        type: 'info',
        title: 'Inventory Opportunity',
        text: `${m.lowStockProducts} products are approaching low-stock thresholds. Consider restock.`
      });
    }

    if (m.outOfStockProducts > 0) {
      res.push({
        type: 'error',
        title: 'Loss of Sale Risk',
        text: `${m.outOfStockProducts} products are currently out of stock, preventing potential revenue.`
      });
    }

    return res;
  }, [data]);

  const fmt = (v: number) => `£${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <div className="p-8 text-center text-slate-500 uppercase font-black tracking-widest animate-pulse">Analyzing Brand Performance...</div>;
  if (!data) return <div className="p-8 text-center text-rose-400 font-bold">Brand not found or error loading data.</div>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <button onClick={() => router.back()} className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-slate-700 transition-colors border border-slate-700/50">
             <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="w-20 h-20 rounded-3xl bg-slate-800 flex items-center justify-center text-4xl shadow-2xl border border-slate-700/50 p-3">
            {data.brand.logo_url ? <img src={data.brand.logo_url} alt={data.brand.name} className="w-full h-full object-contain" /> : '🏷️'}
          </div>
          <div>
            <h1 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tighter">{data.brand.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${data.brand.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                {data.brand.is_active ? 'Active' : 'Inactive'}
              </span>
              <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">Brand Analytics</span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Revenue', value: fmt(data.metrics.revenue), color: 'text-emerald-400' },
          { label: 'Units Sold', value: data.metrics.unitsSold, color: 'text-blue-400' },
          { label: 'Gross Profit', value: fmt(data.metrics.grossProfit), color: 'text-amber-400' },
          { label: 'Avg Margin', value: `${data.metrics.margin.toFixed(1)}%`, color: 'text-cyan-400' },
          { label: 'Active Products', value: `${data.metrics.activeProducts}/${data.metrics.totalProducts}`, color: 'text-indigo-400' },
        ].map((kpi, i) => (
          <div key={i} className="bg-slate-900/50 rounded-3xl border border-slate-800 p-5 shadow-lg">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{kpi.label}</p>
            <p className={`text-2xl font-black ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Trend Chart */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-2">
             <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Sales Trend</h3>
             <div className="flex bg-slate-900 rounded-xl border border-slate-800 p-1">
               {(['revenue', 'units', 'profit'] as const).map(m => (
                 <button
                   key={m}
                   onClick={() => setActiveMetric(m)}
                   className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${activeMetric === m ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                 >
                   {m}
                 </button>
               ))}
             </div>
          </div>
          <TimeSeriesChart series={chartSeries} timeRange={timeRange} />
        </div>

        {/* Insights & Recommendations */}
        <div className="space-y-6">
           <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest px-2">Brand Insights</h3>
           <div className="space-y-4">
             {insights.map((insight, i) => (
               <div key={i} className={`p-5 rounded-3xl border ${
                 insight.type === 'success' ? 'bg-emerald-500/5 border-emerald-500/20' :
                 insight.type === 'warning' ? 'bg-amber-500/5 border-amber-500/20' :
                 insight.type === 'error' ? 'bg-rose-500/5 border-rose-500/20' :
                 'bg-blue-500/5 border-blue-500/20'
               }`}>
                 <div className="flex items-center gap-3 mb-2">
                   <span className="text-xl">
                     {insight.type === 'success' ? '🚀' : insight.type === 'warning' ? '⚠️' : insight.type === 'error' ? '🚨' : '💡'}
                   </span>
                   <h4 className={`font-black uppercase tracking-tighter ${
                     insight.type === 'success' ? 'text-emerald-400' :
                     insight.type === 'warning' ? 'text-amber-400' :
                     insight.type === 'error' ? 'text-rose-400' :
                     'text-blue-400'
                   }`}>{insight.title}</h4>
                 </div>
                 <p className="text-sm text-slate-300 leading-relaxed font-medium">{insight.text}</p>
               </div>
             ))}
             {insights.length === 0 && <p className="text-slate-600 text-sm italic p-4">No significant insights for this period.</p>}
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <CategoryBarChart data={storeChartData} title="Performance by Store" />
        <CategoryBarChart data={categoryChartData} title="Category Contribution" />
      </div>

      {/* Product Performance Table */}
      <div className="bg-slate-900/50 rounded-[2rem] border border-slate-800 overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Product Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-950/50 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">Product</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Units</th>
                <th className="px-6 py-4 text-right">Revenue</th>
                <th className="px-6 py-4 text-right">Gross Profit</th>
                <th className="px-6 py-4 text-right">Margin</th>
                <th className="px-6 py-4 text-right">Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {data.products.map((p: any) => (
                <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-100">{p.name}</p>
                    <p className="text-[10px] font-mono text-slate-500">{p.sku || 'NO SKU'}</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border ${p.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-slate-300">{p.unitsSold}</td>
                  <td className="px-6 py-4 text-right font-black text-emerald-400">{fmt(p.revenue)}</td>
                  <td className="px-6 py-4 text-right font-black text-amber-400">{fmt(p.grossProfit)}</td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-black ${p.margin > 20 ? 'text-cyan-400' : 'text-orange-400'}`}>
                      {p.margin.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-slate-400">{p.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

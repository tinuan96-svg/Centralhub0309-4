'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/currency';
import { supabase } from '@/lib/supabase';

interface ReportData {
  totalValue: number;
  totalUnits: number;
  productCount: number;
  byCategory: Record<string, number>;
  byBrand: Record<string, number>;
}

export default function ReportsClient({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const generateSummary = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const { data: products, error } = await supabase
        .from('products')
        .select('id, name, stock, cost_price, category, brand')
        .eq('is_active', true)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .gt('stock', 0);
      if (error) throw error;

      const summary: ReportData = { totalValue: 0, totalUnits: 0, productCount: products?.length || 0, byCategory: {}, byBrand: {} };
      (products || []).forEach(product => {
        const stock = Number(product.stock || 0);
        const value = stock * Number(product.cost_price || 0);
        summary.totalValue += value;
        summary.totalUnits += stock;
        const category = product.category || 'Uncategorized';
        const brand = product.brand || 'No Brand';
        summary.byCategory[category] = (summary.byCategory[category] || 0) + value;
        summary.byBrand[brand] = (summary.byBrand[brand] || 0) + value;
      });
      setReportData(summary);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('[InventoryReports] generation failed:', error);
      setReportData(null);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    generateSummary(true);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase.channel('inventory-reports-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => generateSummary(false), 300);
      })
      .subscribe();
    const fallback = setInterval(() => generateSummary(false), 30000);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [generateSummary]);

  const categories = useMemo(() => Object.entries(reportData?.byCategory || {}).sort((a, b) => b[1] - a[1]), [reportData]);
  const brands = useMemo(() => Object.entries(reportData?.byBrand || {}).sort((a, b) => b[1] - a[1]).slice(0, 10), [reportData]);

  if (loading) return <div className="p-8 text-center text-slate-400">Generating active inventory analytics...</div>;
  if (!reportData) return <div className="p-8 text-center"><p className="text-slate-400 mb-4">Unable to generate inventory report data.</p><button onClick={() => generateSummary(true)} className="px-6 py-2 bg-cyan-600 text-white rounded-lg text-sm font-bold">Retry</button></div>;

  const denominator = reportData.totalValue || 1;

  return <main className="mx-auto max-w-[1400px] min-w-0 space-y-6 p-4 pb-24 fold-inner:p-5 fold-inner:pb-8 lg:p-6">
    <header className="flex flex-col gap-3 fold-inner:flex-row fold-inner:items-center fold-inner:justify-between">
      <div><h1 className="text-xl font-bold text-slate-100 uppercase tracking-tight">Stock Analysis & Reports</h1><p className="text-sm text-slate-500 mt-1">Active catalogue valuation from the CentralHub stock master{lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/inventory-management/reports/audit" className="px-4 py-2 bg-blue-600 text-white text-xs font-bold uppercase rounded-lg border border-blue-500">Audit Trail</Link><Link href="/inventory-management/reports/expiry" className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold uppercase rounded-lg border border-slate-700">Expiry</Link><Link href="/inventory-management/reports/reorder" className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold uppercase rounded-lg border border-slate-700">Reorder</Link><button onClick={() => generateSummary(false)} className="px-3 py-2 bg-cyan-600/20 text-cyan-400 rounded-lg border border-cyan-500/30">↻</button></div>
    </header>

    <section className="rounded-[2rem] border border-cyan-500/30 bg-gradient-to-r from-cyan-900/40 to-blue-900/40 p-6 fold-inner:p-8 shadow-2xl">
      <div className="grid grid-cols-2 fold-inner:grid-cols-4 gap-5">
        <div className="col-span-2"><p className="text-xs font-black text-cyan-400 uppercase tracking-[0.2em] mb-2">Active Inventory Asset Value</p><p className="text-4xl fold-inner:text-6xl font-black text-white font-mono tracking-tighter">{formatCurrency(reportData.totalValue)}</p><p className="text-sm text-slate-400 mt-2">Cost valuation · active, non-deleted stock only</p></div>
        <div><p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Physical Stock</p><p className="text-3xl fold-inner:text-4xl font-bold text-slate-100">{reportData.totalUnits.toLocaleString()}</p><p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Units on shelf</p></div>
        <div><p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Stocked SKUs</p><p className="text-3xl fold-inner:text-4xl font-bold text-cyan-300">{reportData.productCount.toLocaleString()}</p><p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Active products with stock</p></div>
      </div>
    </section>

    <section className="grid grid-cols-1 fold-inner:grid-cols-2 gap-5">
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 fold-inner:p-7 shadow-xl"><div className="flex items-center justify-between mb-6"><h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">Value by Category</h2><span className="text-[10px] font-bold text-cyan-500 bg-cyan-500/10 px-2 py-1 rounded">Active stock</span></div><div className="space-y-5">{categories.map(([name, value]) => <div key={name}><div className="flex items-center justify-between gap-4 mb-2"><span className="text-sm font-bold text-slate-300 truncate">{name}</span><span className="text-sm font-black text-slate-100 font-mono shrink-0">{formatCurrency(value)}</span></div><div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-cyan-600 to-blue-500" style={{ width: `${Math.min(100, value / denominator * 100)}%` }} /></div></div>)}{categories.length === 0 && <p className="text-sm text-slate-500">No active stock value by category.</p>}</div></div>
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 fold-inner:p-7 shadow-xl"><div className="flex items-center justify-between mb-6"><h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">Top Brands by Value</h2><span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded">Top 10</span></div><div className="space-y-2">{brands.map(([name, value]) => <div key={name} className="flex items-center justify-between gap-4 py-3 border-b border-slate-800/50 last:border-0"><span className="text-sm text-slate-300 truncate">{name}</span><div className="flex items-center gap-3 shrink-0"><span className="text-[10px] text-slate-500 font-bold">{(value / denominator * 100).toFixed(1)}%</span><span className="text-sm font-bold text-slate-100 font-mono">{formatCurrency(value)}</span></div></div>)}{brands.length === 0 && <p className="text-sm text-slate-500">No active stock value by brand.</p>}</div></div>
    </section>
  </main>;
}

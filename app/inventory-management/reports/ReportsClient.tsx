'use client';

import { formatCurrency } from '@/lib/utils/currency';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function ReportsClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { generateSummary(); }, []);

  const generateSummary = async () => {
    setLoading(true);
    try {
      const { data: products, error } = await supabase.from('products').select('name, stock, cost_price, category, brand').gt('stock', 0);
      if (error) throw error;
      const summary = { totalValue: 0, totalUnits: 0, byCategory: {} as any, byBrand: {} as any };
      products?.forEach(p => {
        const val = (Number(p.stock) || 0) * (Number(p.cost_price) || 0);
        summary.totalValue += val;
        summary.totalUnits += (Number(p.stock) || 0);
        const cat = p.category || 'Uncategorized';
        summary.byCategory[cat] = (summary.byCategory[cat] || 0) + val;
        const brand = p.brand || 'No Brand';
        summary.byBrand[brand] = (summary.byBrand[brand] || 0) + val;
      });
      setReportData(summary);
    } catch (e) {
      console.error('Report generation error:', e);
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Generating Stock Analytics...</div>;
  if (!reportData) return (
    <div className="p-8 text-center">
      <p className="text-slate-400 mb-4">Unable to generate report data. There may be a connection issue.</p>
      <button onClick={generateSummary} className="px-6 py-2 bg-cyan-600 text-white rounded-lg text-sm font-bold hover:bg-cyan-500 transition-all">Retry</button>
    </div>
  );

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-slate-100 uppercase tracking-tight">Stock Analysis & Reports</h1><p className="text-sm text-slate-500 mt-1">Strategic insights based on current master registry data</p></div>
        <div className="flex gap-2">
          <Link href="/inventory-management/reports/audit" className="px-4 py-2 bg-blue-600 text-white text-xs font-bold uppercase rounded-lg border border-blue-500 hover:bg-blue-500 transition-all">Audit Trail Report</Link>
          <Link href="/inventory-management/reports/expiry" className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold uppercase rounded-lg border border-slate-700 hover:bg-slate-700 transition-all">Expiry Report</Link>
          <Link href="/inventory-management/reports/reorder" className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold uppercase rounded-lg border border-slate-700 hover:bg-slate-700 transition-all">Reorder Report</Link>
          <button onClick={generateSummary} className="p-2 bg-cyan-600/20 text-cyan-400 rounded-lg border border-cyan-500/30"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
        </div>
      </div>
      <div className="bg-gradient-to-r from-cyan-900/40 to-blue-900/40 border border-cyan-500/30 rounded-[2rem] p-10 flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl">
         <div><p className="text-xs font-black text-cyan-400 uppercase tracking-[0.2em] mb-2">Total Inventory Asset Value</p><p className="text-6xl font-black text-white font-mono tracking-tighter">{formatCurrency(reportData.totalValue)}</p><p className="text-sm text-slate-400 mt-2">Valuation based on Master Registry cost prices</p></div>
         <div className="h-20 w-px bg-slate-700 hidden md:block opacity-30"></div>
         <div className="text-center md:text-right"><p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Physical Stock</p><p className="text-4xl font-bold text-slate-100">{reportData.totalUnits.toLocaleString()}</p><p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Total Units on Shelf</p></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
         <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 shadow-xl"><div className="flex items-center justify-between mb-8"><h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">Value by Category</h2><span className="text-[10px] font-bold text-cyan-500 bg-cyan-500/10 px-2 py-0.5 rounded">Sorted by Value</span></div><div className="space-y-6">{Object.entries(reportData.byCategory).sort((a: any, b: any) => b[1] - a[1]).map(([name, val]: any) => (<div key={name} className="group"><div className="flex items-center justify-between mb-2"><span className="text-sm font-bold text-slate-300 group-hover:text-white transition-colors">{name}</span><span className="text-sm font-black text-slate-100 font-mono">{formatCurrency(val)}</span></div><div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50"><div className="h-full bg-gradient-to-r from-cyan-600 to-blue-500 shadow-[0_0_10px_rgba(6,182,212,0.3)]" style={{ width: `${(val / reportData.totalValue) * 100}%` }}></div></div></div>))}</div></div>
         <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 shadow-xl"><div className="flex items-center justify-between mb-8"><h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">Top Brands by Value</h2><span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">Top 10</span></div><div className="space-y-4">{Object.entries(reportData.byBrand).sort((a: any, b: any) => b[1] - a[1]).slice(0, 10).map(([name, val]: any) => (<div key={name} className="flex items-center justify-between py-3 border-b border-slate-800/50 last:border-0"><div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-slate-700"></div><span className="text-sm text-slate-300">{name}</span></div><div className="flex items-center gap-4"><span className="text-[10px] text-slate-500 font-bold">{((val / reportData.totalValue) * 100).toFixed(1)}%</span><span className="text-sm font-bold text-slate-100 font-mono w-24 text-right">{formatCurrency(val)}</span></div></div>))}</div></div>
      </div>
    </div>
  );
}

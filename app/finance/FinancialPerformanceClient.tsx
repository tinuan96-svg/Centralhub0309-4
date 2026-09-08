'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils/currency';
import { MetricBars, Panel } from '@/components/dashboard/Charts';

type Metric = { period: string; orders: number; revenue: number; cogs: number; expenses: number; net_profit: number; avg_profit_per_order: number };

export default function FinancialPerformanceClient() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error: e } = await supabase.rpc('get_financial_performance_summary', { p_days: 30 });
    if (e) setError(e.message);
    setMetrics((data || []) as Metric[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="ch-card overflow-hidden">
      <div className="p-5 border-b border-slate-800 flex justify-between items-center">
        <div><h2 className="section-title">Financial Performance</h2><p className="section-help">Actual trading performance from the existing financial summary.</p></div>
        <button onClick={load} className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-[10px] font-black uppercase tracking-widest">Refresh</button>
      </div>
      {error && <div className="m-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">{error}</div>}
      {!loading && !error && metrics.length > 0 && <div className="p-5"><Panel title="Profit by reporting period" subtitle="Periods may overlap; these values should not be added together."><MetricBars data={metrics.map(m => ({ label: m.period, value: Number(m.net_profit) }))} format={formatCurrency} /></Panel></div>}
      {!loading && !error && metrics.length === 0 && <p className="ch-muted p-5">No financial summary is available.</p>}
      {loading ? <div className="p-10 text-center text-slate-500">Calculating financial performance…</div> : !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 p-5">
          {metrics.map(m => <div key={m.period} className="rounded-2xl bg-slate-950 border border-slate-800 p-4">
            <div className="text-[9px] uppercase tracking-widest text-slate-500 font-black">{m.period}</div>
            <div className="mt-3 text-2xl font-black text-white">{formatCurrency(Number(m.net_profit || 0))}</div>
            <div className="mt-2 text-xs text-slate-400">{m.orders} orders · {formatCurrency(Number(m.revenue || 0))} revenue</div>
            <div className="mt-1 text-xs text-slate-500">COGS {formatCurrency(Number(m.cogs || 0))} · Expenses {formatCurrency(Number(m.expenses || 0))}</div>
            <div className="mt-3 text-[10px] font-bold text-cyan-300">Avg profit/order {formatCurrency(Number(m.avg_profit_per_order || 0))}</div>
          </div>)}
        </div>
      )}
    </section>
  );
}

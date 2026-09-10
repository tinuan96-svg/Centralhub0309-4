'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils/currency';

type Health = {
  dashboard: any;
  active_products: number;
  ready: number;
  stale: number;
  blocked: number;
  passed: number;
  actionable: number;
  actionable_potential_daily_profit: number;
  latest_generated_at: string | null;
};

const money = (value: unknown) => formatCurrency(Number(value || 0));

export default function PricingGuardrailStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc('get_pricing_engine_health', { p_period_days: 7 });
    if (rpcError) {
      setError(rpcError.message || 'Unable to read pricing engine health');
    } else if (data) {
      setHealth(data as Health);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const target = health?.dashboard?.target || {};
  const limited = target.pricing_can_close_gap === false;
  const engineHealthy = Boolean(health) && !error;

  return (
    <section className="px-4 sm:px-6 pt-4 max-w-[1600px] mx-auto">
      <div className="rounded-2xl border border-cyan-500/20 bg-slate-950/70 p-4 sm:p-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${engineHealthy ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : error ? 'border-rose-500/20 bg-rose-500/10 text-rose-300' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>
                <span className={`h-2 w-2 rounded-full ${engineHealthy ? 'bg-emerald-400 animate-pulse' : error ? 'bg-rose-400' : 'bg-slate-500 animate-pulse'}`} />
                {engineHealthy ? 'Pricing engine live' : error ? 'Pricing status unavailable' : 'Checking pricing engine'}
              </span>
              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-300">Manual approval required</span>
              <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-300">Cached auto refresh after market scans</span>
            </div>
            <p className="mt-3 text-xs text-slate-400 max-w-3xl">
              Product pricing uses direct product economics, paid-order demand and fresh competitor signals. Business overhead remains business-level context and is not forced into each product price.
            </p>
          </div>
          <button disabled={loading} onClick={load} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 hover:text-white disabled:opacity-50">
            {loading ? 'Refreshing…' : 'Refresh engine status'}
          </button>
        </div>

        {error && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
            <span>{error}. Existing verified values are kept on screen; no zero fallback is substituted.</span>
            <button onClick={load} className="rounded-lg border border-rose-400/30 px-3 py-1.5 font-black uppercase tracking-widest">Retry</button>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
          {[
            ['Baseline', target.calculation_window_days ? `${target.calculation_window_days}d` : '—'],
            ['Confidence', target.target_data_confidence || '—'],
            ['Active', health?.active_products ?? '—'],
            ['Actionable', health?.actionable ?? '—'],
            ['Blocked', health?.blocked ?? '—'],
            ['Stale', health?.stale ?? '—'],
            ['Guarded / unit', health ? money(target.required_profit_per_unit) : '—'],
            ['Raw / unit', health ? money(target.raw_required_profit_per_unit) : '—'],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">{label}</p>
              <p className="mt-1 text-sm font-black text-white">{value}</p>
            </div>
          ))}
        </div>

        {limited && (
          <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-200">
            Pricing alone cannot safely close the current profit gap. Safe pricing capacity is about {money(target.pricing_recovery_capacity_per_day)}/day; approximately {money(target.unrecoverable_gap_per_day)}/day should be solved through sales growth, basket size, purchasing, operating-cost control or other commercial actions instead of forcing it into item prices.
          </div>
        )}

        {health?.latest_generated_at && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[9px] uppercase tracking-widest text-slate-600">
            <span>Latest recommendation refresh: {new Date(health.latest_generated_at).toLocaleString('en-GB')}</span>
            <span>Actionable daily profit: {money(health.actionable_potential_daily_profit)}</span>
          </div>
        )}
      </div>
    </section>
  );
}

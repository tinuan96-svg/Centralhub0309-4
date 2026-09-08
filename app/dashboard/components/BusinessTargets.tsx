'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useDashboardFilterStore } from '@/lib/store/dashboardFilterStore';
import { PeriodSummary, readReportRows } from '@/lib/dashboard/reporting';
import { formatCurrency } from '@/lib/utils/currency';
import { EmptyState, Panel, RatioRing } from '@/components/dashboard/Charts';

type Target = { id: string; store_id: string | null; name: string; target_type: string; target_value: number; period_start: string; period_end: string };
export default function BusinessTargets({ currentStats, periodStart, periodEnd }: { currentStats: PeriodSummary; periodStart: Date; periodEnd: Date }) {
  const { selectedStoreId } = useDashboardFilterStore();
  const [targets, setTargets] = useState<Target[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => { let cancelled = false; setLoading(true); setError(false); readReportRows<Target>(() => supabase.from('business_targets').select('id,store_id,name,target_type,target_value,period_start,period_end').eq('is_active', true).order('id'), 'Targets').then(rows => { if (!cancelled) setTargets(rows.filter(t => selectedStoreId === 'all' ? !t.store_id : t.store_id === selectedStoreId)); }).catch(() => { if (!cancelled) setError(true); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [selectedStoreId]);
  const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const metric = (type: string) => type === 'revenue' ? currentStats.totalRevenue : type === 'orders' ? currentStats.totalOrders : type === 'profit' ? currentStats.actualGrossProfit : null;
  return <Panel title="Business targets" subtitle="Progress against saved targets for the same store and dates.">
    {loading ? <p className="ch-muted">Loading targets…</p> : error ? <p role="alert" className="ch-note ch-error">Saved targets could not be loaded.</p> : !targets.length ? <EmptyState>No active targets saved for this store scope.</EmptyState> : <div className="space-y-5">{targets.map(t => {
      const matched = day(periodStart) === t.period_start.slice(0, 10) && day(periodEnd) === t.period_end.slice(0, 10);
      const current = matched ? metric(t.target_type) : null;
      const target = Number(t.target_value);
      const value = current !== null && target > 0 ? current / target * 100 : null;
      return <div key={t.id}><RatioRing value={value} label={t.name || t.target_type} detail={t.period_start.slice(0, 10) + ' to ' + t.period_end.slice(0, 10)} /><p className="ch-muted mt-2">Target: {t.target_type === 'orders' ? target.toLocaleString('en-GB') : formatCurrency(target)}{current !== null ? ' · Current: ' + (t.target_type === 'orders' ? current.toLocaleString('en-GB') : formatCurrency(current)) : ' · Select matching dates to compare.'}</p></div>;
    })}</div>}
  </Panel>;
}

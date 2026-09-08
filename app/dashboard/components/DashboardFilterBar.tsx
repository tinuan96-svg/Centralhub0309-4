'use client';
import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { useDashboardFilterStore, TimeRange, ComparisonType } from '@/lib/store/dashboardFilterStore';
import { useStore } from '@/lib/store/useStore';

export default function DashboardFilterBar({ lastUpdated, onRefresh, loading = false, compact = false, actions }: { lastUpdated: Date | null; onRefresh?: () => void; loading?: boolean; compact?: boolean; actions?: ReactNode }) {
  const { timeRange, setTimeRange, comparisonType, setComparisonType, selectedStoreId, setSelectedStoreId, customStartDate, customEndDate, setCustomDates } = useDashboardFilterStore();
  const { stores } = useStore();
  const ranges: { value: TimeRange; label: string }[] = [{ value: 'today', label: 'Today' }, { value: '7days', label: 'Week' }, { value: '30days', label: 'Month' }, { value: 'year', label: 'Year' }, { value: 'custom', label: 'Custom' }];
  if (compact) return <div className="ch-console-toolbar" aria-label="Dashboard filters">
    <label className="sr-only" htmlFor="dashboard-store">Store</label><select id="dashboard-store" value={selectedStoreId} onChange={e => setSelectedStoreId(e.target.value)}><option value="all">All stores</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
    <label className="sr-only" htmlFor="dashboard-period">Reporting period</label><select id="dashboard-period" value={timeRange} onChange={e => setTimeRange(e.target.value as TimeRange)}>{ranges.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
    <label className="sr-only" htmlFor="dashboard-comparison">Compare with</label><select id="dashboard-comparison" value={comparisonType} onChange={e => setComparisonType(e.target.value as ComparisonType)}><option value="none">No comparison</option><option value="previous">Previous period</option><option value="lastYear">Last year</option></select>
    <div className="ch-console-tools">{onRefresh && <button type="button" onClick={onRefresh} disabled={loading} className="ch-button ch-console-icon" title={lastUpdated ? 'Report loaded ' + lastUpdated.toLocaleString('en-GB') : 'Refresh report'} aria-label="Refresh dashboard report"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>}{actions}</div>
    {timeRange === 'custom' && <div className="ch-console-dates"><label htmlFor="dashboard-start">From</label><input id="dashboard-start" type="date" value={customStartDate || ''} max={customEndDate || undefined} onChange={e => setCustomDates(e.target.value, customEndDate)} /><label htmlFor="dashboard-end">To</label><input id="dashboard-end" type="date" value={customEndDate || ''} min={customStartDate || undefined} onChange={e => setCustomDates(customStartDate, e.target.value)} /></div>}
  </div>;
  return <div className="ch-filter-bar">
    <div><label id="dashboard-period-label">Reporting period</label><div className="ch-tabs" aria-labelledby="dashboard-period-label">{ranges.map(r => <button type="button" key={r.value} onClick={() => setTimeRange(r.value)} aria-pressed={timeRange === r.value} className="ch-tab px-3">{r.label}</button>)}</div></div>
    <div className="min-w-0"><label htmlFor="dashboard-store">Store</label><select id="dashboard-store" value={selectedStoreId} onChange={e => setSelectedStoreId(e.target.value)}><option value="all">All stores</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
    <div><label htmlFor="dashboard-comparison">Compare with</label><select id="dashboard-comparison" value={comparisonType} onChange={e => setComparisonType(e.target.value as ComparisonType)}><option value="none">No comparison</option><option value="previous">Previous period</option><option value="lastYear">Same period last year</option></select></div>
    {timeRange === 'custom' && <><div><label htmlFor="dashboard-start">From</label><input id="dashboard-start" type="date" value={customStartDate || ''} max={customEndDate || undefined} onChange={e => setCustomDates(e.target.value, customEndDate)} /></div><div><label htmlFor="dashboard-end">To</label><input id="dashboard-end" type="date" value={customEndDate || ''} min={customStartDate || undefined} onChange={e => setCustomDates(customStartDate, e.target.value)} /></div></>}
    <div className="flex items-center gap-3 ml-auto"><div className="text-right text-xs text-slate-400">{loading ? 'Loading report…' : lastUpdated ? 'Report loaded' : 'Not loaded'}<br />{lastUpdated?.toLocaleTimeString('en-GB')}</div>{onRefresh && <button type="button" onClick={onRefresh} disabled={loading} className="ch-button" aria-label="Refresh dashboard report"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button>}</div>
  </div>;
}

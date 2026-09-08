'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CircleAlert, Download } from 'lucide-react';
import { useDashboardFilterStore } from '@/lib/store/dashboardFilterStore';
import { useLiveDashboardReport } from '@/lib/hooks/useLiveDashboardReport';
import { EmptyState } from '@/components/dashboard/Charts';
import DashboardLiveStatus from './DashboardLiveStatus';
import SecurityPulse from './SecurityPulse';
import ReferenceDashboard from './ReferenceDashboard';
import SectionVisuals from './SectionVisuals';
import DashboardFilterBar from './DashboardFilterBar';
import DashboardKpiGrid from './DashboardKpiGrid';
import ActionRequired from './ActionRequired';
import AIInsights from './AIInsights';
import AuditLogWidget from './AuditLogWidget';

export default function DashboardOverview({ refreshKey, appearance = 'dark', controls }: { refreshKey: number; appearance?: 'dark' | 'light'; controls?: ReactNode }) {
  const { timeRange, comparisonType, selectedStoreId, customStartDate, customEndDate } = useDashboardFilterStore();
  const { report, loading, error, connection, refresh } = useLiveDashboardReport({ timeRange, comparisonType, selectedStoreId, customStartDate, customEndDate }, refreshKey);

  const stores = report?.stores.filter(s => selectedStoreId === 'all' || s.id === selectedStoreId) || [];
  const exportReport = () => {
    if (!report) return;
    const rows = [['Metric', 'Value', 'Scope'], ['Product sales', String(report.current.totalRevenue), 'Paid orders, excluding delivery'], ['Order gross profit', String(report.current.actualGrossProfit ?? 'Unavailable'), 'Order total less product cost; includes delivery, excludes fees'], ['Paid expenses', String(report.current.totalOverhead), 'Paid expenses by invoice date'], ['After paid expenses', String(report.current.netProfit ?? 'Unavailable'), 'Order gross profit less paid expenses'], ['Paid orders', String(report.current.totalOrders), 'Selected period'], ['Cost estimates', String(report.current.estimatedCosts), 'Orders using current product costs'], ['Missing costs', String(report.current.missingCosts), 'Orders with incomplete cost coverage'], ['Warehouse value', String(report.current.totalInventoryValue ?? 'Unavailable'), 'Current warehouse stock; all stores'], ['Period start', report.start.toISOString(), ''], ['Period end', report.end.toISOString(), ''], ['Store', selectedStoreId, ''], ['Loaded at', report.loadedAt.toISOString(), '']];
    const csv = rows.map(row => row.map(cell => '"' + cell.replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })); const a = document.createElement('a'); a.href = url; a.download = 'centralhub-dashboard-report.csv'; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <>
    <section className="ch-model-shell ch-visual-console ch-live-console" data-appearance={appearance} aria-label="Visual business dashboard">
      <h1 className="sr-only">Business dashboard</h1>
      <DashboardFilterBar compact lastUpdated={report?.loadedAt || null} loading={loading} onRefresh={refresh} actions={<>{controls}<button type="button" onClick={exportReport} disabled={!report || loading} className="ch-button ch-console-icon" title="Export figures" aria-label="Export dashboard figures"><Download size={16} /></button></>} />
      <DashboardLiveStatus connection={connection} loading={loading} error={!!error} updatedAt={report?.loadedAt || null} />
      {error && <div role="alert" className="ch-note ch-error flex items-center gap-3"><CircleAlert size={20} /><span>{error}{report ? ' Showing the last successful report until the next update.' : ''}</span></div>}
      {loading && !report && <div role="status" aria-label="Loading dashboard" className="ch-kpi-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="ch-panel h-28 animate-pulse"><div className="h-3 w-20 bg-slate-700/50 rounded mb-5" /><div className="h-7 w-28 bg-slate-700/50 rounded" /></div>)}</div>}
      {report && <div className="ch-visual-surface">
        <p className="ch-console-scope">{report.start.toLocaleDateString('en-GB')} – {report.end.toLocaleDateString('en-GB')} · {selectedStoreId === 'all' ? 'All stores' : stores[0]?.name || 'Selected store'}</p>
        <SecurityPulse selectedStoreId={selectedStoreId} compact />
        <ReferenceDashboard report={report} selectedStoreId={selectedStoreId} timeRange={timeRange} />
        <div className="ch-visual-comparisons"><DashboardKpiGrid compact current={report.current} previous={report.previous} /></div>
        <SectionVisuals report={report} selectedStoreId={selectedStoreId} refreshKey={report.loadedAt.getTime()} />
      </div>}
      {!report && !loading && !error && <EmptyState />}
    </section>
    {report && <div className="ch-dashboard-followup">
      <ActionRequired key={selectedStoreId + report.loadedAt.toISOString()} />
      <details className="ch-model-inspection"><summary>Definitions, actions & system messages</summary><div className="ch-dashboard-stack">
        <div className="ch-note"><p>Product sales exclude delivery. Order gross profit follows Profit Analysis: order totals less product costs, including delivery charged and before shipping, packing, gateway fees and overhead. After paid expenses subtracts paid expense invoices; it is not accounting net profit. <Link className="ch-link" href="/finance">Open Finance for accounting profit <ArrowUpRight size={14} /></Link></p><p className="mt-2">{report.current.estimatedCosts} orders use estimated current product costs; {report.current.missingCosts} have incomplete cost coverage. Warehouse, bank, integration and reserve figures show their labelled global/current scopes. Finance uses its existing seven-day accounting report. Other period charts use the selected store and dates.</p></div>
        <nav className="ch-workspace-links" aria-label="Section details"><Link href="/stores">Stores</Link><Link href="/inventory">Inventory</Link><Link href="/backorder-planning">Backorders</Link><Link href="/profit-analysis">Product performance</Link><Link href="/picking">Picking</Link><Link href="/packing">Packing</Link><Link href="/shipping">Shipping</Link><Link href="/customers">Customers</Link><Link href="/customer-care/inbox">Inbox</Link><Link href="/customer-care/channels">Channels</Link><Link href="/marketing">Marketing</Link><Link href="/analytics">Analytics</Link></nav>
        <AIInsights key={selectedStoreId + report.loadedAt.toISOString()} /><AuditLogWidget key={report.loadedAt.toISOString()} />
      </div></details>
    </div>}
  </>;
}

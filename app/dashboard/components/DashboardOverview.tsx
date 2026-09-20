'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ChevronDown, CircleAlert, Download } from 'lucide-react';
import { useDashboardFilterStore } from '@/lib/store/dashboardFilterStore';
import { useLiveDashboardReport } from '@/lib/hooks/useLiveDashboardReport';
import { EmptyState } from '@/components/dashboard/Charts';
import DashboardLiveStatus from './DashboardLiveStatus';
import SecurityPulse from './SecurityPulse';
import { getReferenceDashboardWidgets } from './ReferenceDashboard';
import { getSectionVisualWidgets } from './SectionVisuals';
import { ChannelVisualsProvider } from './ChannelVisuals';
import { getOperationsMonitorWidgets, OperationsMonitorProvider, OperationsStatusStrip } from './OperationsMonitor';
import DashboardFilterBar from './DashboardFilterBar';
import DashboardKpiGrid from './DashboardKpiGrid';
import BusinessPulse from './BusinessPulse';
import ActionRequired from './ActionRequired';
import AIInsights from './AIInsights';
import AuditLogWidget from './AuditLogWidget';
import DashboardWorkspace from './DashboardWorkspace';

type DashboardWidget = {
  id: string;
  title: string;
  description?: string;
  content: ReactNode;
  desktop?: number;
  tablet?: number;
  mobile?: number;
  minHeight?: number;
};

const EXECUTIVE_WIDGET_IDS = new Set([
  'growth-pulse',
  'security-pulse',
  'kpi-indexes',
  'live-commerce',
  'inventory-radar',
  'sync-mesh',
  'growth-signals',
  'action-required',
  'ai-insights',
]);

const FINANCE_WIDGET_IDS = new Set([
  'finance-summary',
  'bank-reconciliation',
  'paid-order-total',
  'order-gross-profit',
  'paid-payment-methods-model',
  'payment-methods',
  'sales-profit-trend',
  'sales-profitability-model',
  'marketing-reserve',
]);

const GROWTH_WIDGET_IDS = new Set([
  'website-activity',
  'traffic-pulse',
  'traffic-sources',
  'shopping-activity',
  'advertising-return',
  'advertising-rates',
  'advertising-spend',
  'target-progress',
  'customer-communications',
  'repeat-customers',
  'weekly-sales',
  'order-activity',
]);

const SYSTEM_WIDGET_IDS = new Set([
  'integration-health',
  'site-health-matrix',
  'store-scoreboard-live',
  'live-signal-stream',
  'audit-log',
]);

function detailSpan(widget: DashboardWidget) {
  const tabletSpan = widget.tablet ?? 12;
  const desktopSpan = widget.desktop ?? 4;
  const tabletClass = tabletSpan >= 12 ? 'fold-inner:col-span-2' : 'fold-inner:col-span-1';
  const desktopClass = desktopSpan >= 12 ? '2xl:col-span-3' : desktopSpan >= 8 ? '2xl:col-span-2' : '2xl:col-span-1';
  return `${tabletClass} ${desktopClass}`;
}

function DashboardDetailGroup({ title, description, widgets }: { title: string; description: string; widgets: DashboardWidget[] }) {
  if (!widgets.length) return null;
  return <details className="group overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/45">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 sm:px-5 [&::-webkit-details-marker]:hidden">
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-200">{title}</p>
        <p className="mt-1 text-[10px] leading-4 text-slate-500">{description} · {widgets.length} modules</p>
      </div>
      <ChevronDown size={18} className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
    </summary>
    <div className="grid grid-cols-1 gap-4 border-t border-slate-800 p-4 fold-inner:grid-cols-2 2xl:grid-cols-3">
      {widgets.map(widget => <section key={widget.id} className={`min-w-0 ${detailSpan(widget)}`} aria-label={widget.title}>
        {widget.content}
      </section>)}
    </div>
  </details>;
}

export default function DashboardOverview({ refreshKey, appearance = 'dark', controls }: { refreshKey: number; appearance?: 'dark' | 'light'; controls?: ReactNode }) {
  const { timeRange, comparisonType, selectedStoreId, customStartDate, customEndDate } = useDashboardFilterStore();
  const { report, loading, error, connection, refresh } = useLiveDashboardReport({ timeRange, comparisonType, selectedStoreId, customStartDate, customEndDate }, refreshKey);

  const stores = report?.stores.filter(s => selectedStoreId === 'all' || s.id === selectedStoreId) || [];
  const exportReport = () => {
    if (!report) return;
    const rows = [
      ['Metric', 'Value', 'Scope'],
      ['Paid order total', String(report.current.totalRevenue), 'Payment-received order totals including delivery charged'],
      ['Product subtotal', String(report.current.productSubtotal), 'Paid product item subtotal excluding delivery charged'],
      ['Delivery charged', String(report.current.deliveryRevenue), 'Delivery amount charged to paid orders'],
      ['Order gross profit', String(report.current.actualGrossProfit ?? 'Unavailable'), 'Paid order total less product cost; before fees and overhead'],
      ['Paid expenses', String(report.current.totalOverhead), 'Paid expenses by invoice date'],
      ['After paid expenses', String(report.current.netProfit ?? 'Unavailable'), 'Order gross profit less paid expenses'],
      ['Paid orders', String(report.current.totalOrders), 'Selected period'],
      ['Cost estimates', String(report.current.estimatedCosts), 'Orders using current product costs'],
      ['Missing costs', String(report.current.missingCosts), 'Orders with incomplete cost coverage'],
      ['Warehouse value', String(report.current.totalInventoryValue ?? 'Unavailable'), 'Current warehouse stock; all stores'],
      ['Period start', report.start.toISOString(), ''],
      ['Period end', report.end.toISOString(), ''],
      ['Store', selectedStoreId, ''],
      ['Loaded at', report.loadedAt.toISOString(), ''],
    ];
    const csv = rows.map(row => row.map(cell => '"' + cell.replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'centralhub-dashboard-report.csv';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const dashboardWidgets: DashboardWidget[] = report ? [
    { id: 'growth-pulse', title: 'Business pulse', description: 'Measured paid-order rhythm', desktop: 8, tablet: 8, mobile: 12, minHeight: 280, content: <BusinessPulse report={report} connection={connection} refreshError={!!error} selectedStoreId={selectedStoreId} /> },
    { id: 'growth-signals', title: 'Growth and attention', description: 'Measured sales and stock actions', desktop: 12, tablet: 12, mobile: 12, minHeight: 220, content: <BusinessPulse mode="signals" report={report} connection={connection} refreshError={!!error} selectedStoreId={selectedStoreId} /> },
    ...getOperationsMonitorWidgets(),
    ...getReferenceDashboardWidgets({ report, selectedStoreId, timeRange }),
    { id: 'security-pulse', title: 'Security pulse', description: 'Realtime security and site-risk monitoring', desktop: 4, tablet: 4, mobile: 12, minHeight: 280, content: <SecurityPulse selectedStoreId={selectedStoreId} compact /> },
    { id: 'kpi-indexes', title: 'KPI indexes', description: 'Revenue, profit, orders and inventory indexes', desktop: 12, tablet: 12, mobile: 12, minHeight: 160, content: <div className="ch-visual-comparisons"><DashboardKpiGrid compact current={report.current} previous={report.previous} /></div> },
    ...getSectionVisualWidgets({ report, selectedStoreId, refreshKey: report.loadedAt.getTime() }),
    { id: 'action-required', title: 'Action required', description: 'Items needing admin attention', desktop: 6, tablet: 12, mobile: 12, minHeight: 140, content: <ActionRequired key={selectedStoreId + report.loadedAt.toISOString()} /> },
    { id: 'ai-insights', title: 'AI insights', description: 'Decision support and system observations', desktop: 6, tablet: 12, mobile: 12, minHeight: 240, content: <AIInsights key={selectedStoreId + report.loadedAt.toISOString()} /> },
    { id: 'audit-log', title: 'Audit log', description: 'Recent CentralHub system activity', desktop: 12, tablet: 12, mobile: 12, minHeight: 240, content: <AuditLogWidget key={report.loadedAt.toISOString()} /> },
  ] : [];

  const executiveOrder = ['growth-pulse', 'security-pulse', 'kpi-indexes', 'live-commerce', 'inventory-radar', 'sync-mesh', 'growth-signals', 'action-required', 'ai-insights'];
  const executiveWidgets = dashboardWidgets.filter(widget => EXECUTIVE_WIDGET_IDS.has(widget.id)).sort((a, b) => executiveOrder.indexOf(a.id) - executiveOrder.indexOf(b.id));
  const detailWidgets = dashboardWidgets.filter(widget => !EXECUTIVE_WIDGET_IDS.has(widget.id));
  const financeWidgets = detailWidgets.filter(widget => FINANCE_WIDGET_IDS.has(widget.id));
  const growthWidgets = detailWidgets.filter(widget => GROWTH_WIDGET_IDS.has(widget.id));
  const systemWidgets = detailWidgets.filter(widget => SYSTEM_WIDGET_IDS.has(widget.id));
  const groupedIds = new Set([...FINANCE_WIDGET_IDS, ...GROWTH_WIDGET_IDS, ...SYSTEM_WIDGET_IDS]);
  const operationsWidgets = detailWidgets.filter(widget => !groupedIds.has(widget.id));

  return <>
    <section className="ch-model-shell ch-visual-console ch-live-console ch-rich-console" data-appearance={appearance} aria-label="Visual business dashboard">
      <h1 className="sr-only">Business dashboard</h1>
      <DashboardFilterBar compact lastUpdated={report?.loadedAt || null} loading={loading} onRefresh={refresh} actions={<>{controls}<button type="button" onClick={exportReport} disabled={!report || loading} className="ch-button ch-console-icon" title="Export figures" aria-label="Export dashboard figures"><Download size={16} /></button></>} />
      <DashboardLiveStatus connection={connection} loading={loading} error={!!error} updatedAt={report?.loadedAt || null} />
      {error && <div role="alert" className="ch-note ch-error flex items-center gap-3"><CircleAlert size={20} /><span>{error}{report ? ' Showing the last successful report until the next update.' : ''}</span></div>}
      {loading && !report && <div role="status" aria-label="Loading dashboard" className="ch-kpi-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="ch-panel h-28 animate-pulse"><div className="h-3 w-20 bg-slate-700/50 rounded mb-5" /><div className="h-7 w-28 bg-slate-700/50 rounded" /></div>)}</div>}
      {!report && <div className="ch-grid-main"><SecurityPulse selectedStoreId={selectedStoreId} compact /></div>}
      {report && <div className="ch-visual-surface">
        <p className="ch-console-scope">{report.start.toLocaleDateString('en-GB')} – {report.end.toLocaleDateString('en-GB')} · {selectedStoreId === 'all' ? 'All stores' : stores[0]?.name || 'Selected store'}</p>
        <OperationsMonitorProvider>
          <ChannelVisualsProvider start={report.start.toISOString().slice(0, 10)} end={report.end.toISOString().slice(0, 10)} selectedStoreId={selectedStoreId} refreshKey={report.loadedAt.getTime()}>
            <div className="space-y-5">
              <section aria-label="Executive overview">
                <div className="mb-3 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">Executive overview</p>
                    <p className="mt-1 text-xs text-slate-500">Live KPIs, security, core operations and actions that need attention.</p>
                  </div>
                </div>
                <OperationsStatusStrip />
                <DashboardWorkspace widgets={executiveWidgets.map(widget => ['live-commerce', 'sync-mesh', 'inventory-radar'].includes(widget.id) ? { ...widget, desktop: 4, tablet: 4, mobile: 12, minHeight: 260 } : widget)} />
              </section>

              <section className="space-y-3" aria-label="Detailed dashboard modules">
                <div className="px-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Detailed modules</p>
                  <p className="mt-1 text-xs text-slate-600">Open a section only when you need the deeper operational charts.</p>
                </div>
                <DashboardDetailGroup title="Operations & fulfilment" description="Orders, stock, delivery, customers and operational ratios" widgets={operationsWidgets} />
                <DashboardDetailGroup title="Finance & profitability" description="Revenue, profit, banking and financial performance" widgets={financeWidgets} />
                <DashboardDetailGroup title="Growth & marketing" description="Traffic, conversion, advertising and business targets" widgets={growthWidgets} />
                <DashboardDetailGroup title="System & integrations" description="Technical health, integrations, live signals and audit history" widgets={systemWidgets} />
              </section>
            </div>
          </ChannelVisualsProvider>
        </OperationsMonitorProvider>
      </div>}
      {!report && !loading && !error && <EmptyState />}
    </section>
    {report && <div className="ch-dashboard-followup">
      <details className="ch-model-inspection"><summary>Definitions, actions & system messages</summary><div className="ch-dashboard-stack">
        <div className="ch-note"><p>Paid order total is the amount actually received from paid orders, including delivery charged. Product subtotal is kept separate so it never looks like the order total is missing money. Order gross profit follows Profit Analysis: paid order totals less product costs, before shipping, packing, gateway fees and overhead. After paid expenses subtracts paid expense invoices; it is not accounting net profit. <Link className="ch-link" href="/finance">Open Finance for accounting profit <ArrowUpRight size={14} /></Link></p><p className="mt-2">The 24×7 command-centre cards use a separate compact live snapshot over CentralHub operational tables, realtime database events and a 30-second verification sample. Storefront heartbeat, site-health, sync, messaging, shipping, traffic and stock indicators are measured signals; the Ops index is explicitly a rule-based composite rather than a financial KPI. The executive overview keeps only the high-priority cards visible by default; every remaining module is still available in the collapsed detail groups below. {report.current.estimatedCosts} orders use estimated current product costs; {report.current.missingCosts} have incomplete cost coverage. Warehouse, bank, integration and reserve figures show their labelled global/current scopes. Finance uses its existing seven-day accounting report. Other period charts use the selected store and dates.</p></div>
        <nav className="ch-workspace-links" aria-label="Section details"><Link href="/stores">Stores</Link><Link href="/inventory">Inventory</Link><Link href="/backorder-planning">Backorders</Link><Link href="/profit-analysis">Product performance</Link><Link href="/picking">Picking</Link><Link href="/packing">Packing</Link><Link href="/shipping">Shipping</Link><Link href="/customers">Customers</Link><Link href="/customer-care/inbox">Inbox</Link><Link href="/customer-care/channels">Channels</Link><Link href="/marketing">Marketing</Link><Link href="/analytics">Analytics</Link></nav>
      </div></details>
    </div>}
  </>;
}

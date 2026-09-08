'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CircleAlert, Download } from 'lucide-react';
import { useDashboardFilterStore } from '@/lib/store/dashboardFilterStore';
import { DashboardReport, isPaidOrder, loadDashboardReport, numeric, productRevenue } from '@/lib/dashboard/reporting';
import { formatCurrency } from '@/lib/utils/currency';
import TimeSeriesChart, { ChartSeries } from '@/components/TimeSeriesChart';
import { CHART_COLOURS, DonutChart, EmptyState, MetricBars, Panel, RatioRing } from '@/components/dashboard/Charts';
import DashboardFilterBar from './DashboardFilterBar';
import DashboardKpiGrid from './DashboardKpiGrid';
import IntegrationHealth from './IntegrationHealth';
import ActionRequired from './ActionRequired';
import AIInsights from './AIInsights';
import CommunicationAnalytics from './CommunicationAnalytics';
import BusinessTargets from './BusinessTargets';
import AuditLogWidget from './AuditLogWidget';

export default function DashboardOverview({ refreshKey }: { refreshKey: number }) {
  const { timeRange, comparisonType, selectedStoreId, customStartDate, customEndDate } = useDashboardFilterStore();
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setReport(null);
    loadDashboardReport({ timeRange, comparisonType, selectedStoreId, customStartDate, customEndDate }).then(data => { if (!cancelled) setReport(data); }).catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'The report could not be loaded.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [timeRange, comparisonType, selectedStoreId, customStartDate, customEndDate, refreshKey, refresh]);

  const paid = report?.orders.filter(isPaidOrder) || [];
  const stores = report?.stores.filter(s => selectedStoreId === 'all' || s.id === selectedStoreId) || [];
  const daily = new Map<string, Map<string, number>>();
  for (const o of paid) { const id = o.store_id || 'unassigned'; const day = o.created_at.slice(0, 10); const days = daily.get(id) || new Map<string, number>(); days.set(day, (days.get(day) || 0) + productRevenue(o)); daily.set(id, days); }
  const dates: string[] = [];
  if (report) { const d = new Date(report.start.toISOString().slice(0, 10)); const end = report.end.toISOString().slice(0, 10); while (d.toISOString().slice(0, 10) <= end && dates.length < 3660) { dates.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } }
  const chartStores = [...stores, ...(daily.has('unassigned') ? [{ id: 'unassigned', name: 'Unassigned store', slug: null }] : [])];
  const series: ChartSeries[] = chartStores.map((s, i) => ({ id: s.id, name: s.name, color: CHART_COLOURS[i % CHART_COLOURS.length], data: dates.map(date => ({ date, value: daily.get(s.id)?.get(date) || 0 })) }));
  const grouped = (key: 'order_status' | 'payment_status' | 'delivery_city', rows = report?.orders || []) => {
    const result = new Map<string, number>();
    rows.forEach(o => { const label = (o[key] || 'Unknown').replace(/_/g, ' '); result.set(label, (result.get(label) || 0) + 1); });
    return [...result.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const inv = report?.inventory || [];
  const out = inv.filter(i => numeric(i.stock_quantity) <= 0).length;
  const low = inv.filter(i => numeric(i.stock_quantity) > 0 && numeric(i.stock_quantity) <= (i.low_stock_threshold == null ? 5 : numeric(i.low_stock_threshold))).length;
  const healthy = inv.length - out - low;
  const customerOrders = new Map<string, number>();
  paid.forEach(o => { if (o.customer_email?.trim()) { const key = o.customer_email.trim().toLowerCase(); customerOrders.set(key, (customerOrders.get(key) || 0) + 1); } });
  const repeat = [...customerOrders.values()].filter(count => count > 1).length;
  const covered = report ? report.current.costRows.filter(o => o.cost_quality === 'order_total' || o.cost_quality === 'snapshot').length : 0;
  const exportReport = () => {
    if (!report) return;
    const rows = [['Metric', 'Value', 'Scope'], ['Product sales', String(report.current.totalRevenue), 'Paid orders, excluding delivery'], ['Order gross profit', String(report.current.actualGrossProfit ?? 'Unavailable'), 'Order total less product cost; includes delivery, excludes fees'], ['Paid expenses', String(report.current.totalOverhead), 'Paid expenses by invoice date'], ['After paid expenses', String(report.current.netProfit ?? 'Unavailable'), 'Order gross profit less paid expenses'], ['Paid orders', String(report.current.totalOrders), 'Selected period'], ['Cost estimates', String(report.current.estimatedCosts), 'Orders using current product costs'], ['Missing costs', String(report.current.missingCosts), 'Orders with incomplete cost coverage'], ['Warehouse value', String(report.current.totalInventoryValue ?? 'Unavailable'), 'Current warehouse stock; all stores'], ['Period start', report.start.toISOString(), ''], ['Period end', report.end.toISOString(), ''], ['Store', selectedStoreId, ''], ['Loaded at', report.loadedAt.toISOString(), '']];
    const csv = rows.map(row => row.map(cell => '"' + cell.replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })); const a = document.createElement('a'); a.href = url; a.download = 'centralhub-dashboard-report.csv'; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="ch-dashboard-stack">
    <div className="ch-dashboard-hero"><div><p className="ch-eyebrow mb-2">Business overview</p><h1 className="ch-dashboard-title">Your business, at a glance.</h1><p className="ch-muted mt-2">Sales, fulfilment and stock across your stores.</p></div><button type="button" onClick={exportReport} disabled={!report || loading} className="ch-button"><Download size={16} />Export figures</button></div>
    <DashboardFilterBar lastUpdated={report?.loadedAt || null} loading={loading} onRefresh={() => setRefresh(n => n + 1)} />
    {error && <div role="alert" className="ch-note ch-error flex items-center gap-3"><CircleAlert size={20} /><span>{error} Figures are unavailable until the report loads successfully.</span></div>}
    {loading && <div role="status" aria-label="Loading dashboard" className="ch-kpi-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="ch-panel h-40 animate-pulse"><div className="h-3 w-20 bg-slate-700/50 rounded mb-5" /><div className="h-7 w-28 bg-slate-700/50 rounded" /></div>)}</div>}
    {report && <>
      <p className="ch-muted">{report.start.toLocaleDateString('en-GB')} – {report.end.toLocaleDateString('en-GB')} · {selectedStoreId === 'all' ? 'All stores' : stores[0]?.name || 'Selected store'}</p>
      <DashboardKpiGrid current={report.current} previous={report.previous} />
      <details className="ch-note"><summary className="cursor-pointer">How these figures are calculated{report.current.missingCosts > 0 ? ' · Missing costs need attention' : report.current.estimatedCosts > 0 ? ' · Cost estimates included' : ''}</summary><p className="mt-2">Product sales exclude delivery. Order gross profit follows Profit Analysis: order totals less product costs, including delivery charged and before shipping, packing, gateway fees and overhead. After paid expenses subtracts paid expense invoices; it is not accounting net profit. <Link className="ch-link" href="/finance">Open Finance for accounting profit <ArrowUpRight size={14} /></Link></p><p className="mt-1">{report.current.estimatedCosts} orders use estimated current product costs; {report.current.missingCosts} have incomplete cost coverage. Warehouse figures show the current shared stock position across all stores.</p></details>
      <ActionRequired key={selectedStoreId + refresh} />
      <div className="ch-grid-main"><TimeSeriesChart series={series} timeRange={timeRange} title="Sales momentum" subtitle="Paid product sales by day (UTC), excluding cancelled, refunded and deleted orders." /><Panel title="Order mix" subtitle="All active orders created in the selected period."><DonutChart data={grouped('order_status')} label="orders" /></Panel></div>
      <section><div className="ch-panel-heading"><h2 className="ch-panel-title">Store performance</h2><Link href="/stores" className="ch-link">Manage stores <ArrowUpRight size={15} /></Link></div><div className="ch-store-grid">{stores.map((s, i) => { const orders = paid.filter(o => o.store_id === s.id); const revenue = orders.reduce((sum, o) => sum + productRevenue(o), 0); const delivered = orders.filter(o => ['delivered', 'completed'].includes(o.order_status)).length; return <Link href={'/stores/' + s.id} key={s.id} className="ch-panel group"><div className="flex items-center justify-between gap-2"><span className="ch-legend-name"><i className="ch-dot" style={{ background: CHART_COLOURS[i % CHART_COLOURS.length] }} />{s.name}</span><ArrowUpRight size={16} className="text-slate-400" /></div><p className="ch-kpi-value mt-4">{formatCurrency(revenue)}</p><p className="ch-muted mt-2">{orders.length} paid orders · {delivered} delivered</p><div className="ch-bar-track mt-4"><div className="ch-bar-fill" style={{ width: `${orders.length ? delivered / orders.length * 100 : 0}%`, background: CHART_COLOURS[i % CHART_COLOURS.length] }} /></div><p className="text-xs text-slate-400 mt-2">Delivered / paid orders {orders.length ? `${(delivered / orders.length * 100).toFixed(1)}%` : '—'}</p></Link>; })}</div></section>
      <div className="ch-grid-three">
        <Panel title="Stock availability" subtitle="Current shared warehouse · all stores" action={<Link href="/inventory" className="ch-link">Inventory <ArrowUpRight size={14} /></Link>}><DonutChart data={[{ label: 'Above threshold', value: healthy, color: '#6ee7b7' }, { label: 'Low stock', value: low, color: '#fbbf24' }, { label: 'Zero / negative', value: out, color: '#fb7185' }]} label="stock records" /><Link href="/backorder-planning" className="ch-link mt-5">Review {low + out} stock records <ArrowUpRight size={14} /></Link></Panel>
        <Panel title="Top products" subtitle="Product sales from paid orders"><MetricBars data={report.products.slice(0, 5).map(p => ({ label: `${p.name} · ${p.units} units`, value: p.revenue }))} format={formatCurrency} /><Link href="/profit-analysis" className="ch-link mt-4">Product performance <ArrowUpRight size={14} /></Link></Panel>
        <Panel title="Payment status" subtitle="Order payment states; not a bank approval rate."><DonutChart data={grouped('payment_status')} label="orders" /><Link href="/finance/transactions" className="ch-link mt-4">Bank reconciliation <ArrowUpRight size={14} /></Link></Panel>
      </div>
      <div className="ch-grid-three">
        <Panel title="Fulfilment flow" subtitle="Paid orders created in the selected period"><MetricBars data={[{ label: 'To pick', value: paid.filter(o => ['confirmed', 'processing', 'picking'].includes(o.order_status)).length }, { label: 'To pack', value: paid.filter(o => ['picked', 'packing', 'ready_for_packing'].includes(o.order_status)).length }, { label: 'To dispatch', value: paid.filter(o => ['packed', 'ready_to_ship'].includes(o.order_status)).length }, { label: 'In delivery', value: paid.filter(o => ['shipped', 'shipment_booked', 'collected', 'at_local_depot', 'out_for_delivery', 'delivery_attempted', 'delivery_rescheduled'].includes(o.order_status)).length }, { label: 'Delivered', value: paid.filter(o => ['delivered', 'completed'].includes(o.order_status)).length }]} /><div className="flex flex-wrap gap-4 mt-4"><Link href="/picking" className="ch-link">Picking</Link><Link href="/packing" className="ch-link">Packing</Link><Link href="/shipping" className="ch-link">Shipping</Link></div></Panel>
        <Panel title="Customer activity" subtitle="Buyers identified by email in paid orders"><RatioRing value={customerOrders.size ? repeat / customerOrders.size * 100 : null} label="Repeat buyers" detail={`${repeat} of ${customerOrders.size} buyers placed more than one paid order in this period.`} /><p className="ch-muted mt-4">{paid.filter(o => !o.customer_email?.trim()).length} paid orders have no email and are excluded from this ratio.</p><Link href="/customers" className="ch-link mt-4">Customer directory <ArrowUpRight size={14} /></Link></Panel>
        <Panel title="Cost coverage" subtitle="Check coverage before relying on profit"><RatioRing value={paid.length ? covered / paid.length * 100 : null} label="Recorded product costs" detail={`${covered} of ${paid.length} paid orders have an order cost or complete item cost snapshots.`} /><p className="ch-muted mt-4">{report.current.estimatedCosts} estimated · {report.current.missingCosts} incomplete</p><Link href="/finance/profitability" className="ch-link mt-4">Review profitability <ArrowUpRight size={14} /></Link></Panel>
      </div>
      <div className="ch-grid-two"><Panel title="Delivery locations" subtitle="Paid orders in the selected period"><MetricBars data={grouped('delivery_city', paid).slice(0, 6)} /></Panel><BusinessTargets currentStats={report.current} periodStart={report.start} periodEnd={report.end} /></div>
      <div className="ch-grid-two ch-overview-widgets"><CommunicationAnalytics key={selectedStoreId + refresh} /><IntegrationHealth key={refresh} /></div>
      <AIInsights key={selectedStoreId + refresh} /><AuditLogWidget key={refresh} />
    </>}
    {!report && !loading && !error && <EmptyState />}
  </div>;
}

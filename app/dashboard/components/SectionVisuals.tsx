'use client';

import type { DashboardReport } from '@/lib/dashboard/reporting';
import { isPaidOrder, numeric, productRevenue } from '@/lib/dashboard/metrics';
import { formatCurrency } from '@/lib/utils/currency';
import { CHART_COLOURS, DonutChart, MetricBars, Panel } from '@/components/dashboard/Charts';
import { VisualMetric } from '@/components/dashboard/VisualMetric';
import FinancialCommandSummary from '@/app/finance/FinancialCommandSummary';
import CommunicationAnalytics from './CommunicationAnalytics';
import IntegrationHealth from './IntegrationHealth';
import BusinessTargets from './BusinessTargets';
import ChannelVisuals from './ChannelVisuals';

export default function SectionVisuals({ report, selectedStoreId, refreshKey }: { report: DashboardReport; selectedStoreId: string; refreshKey: number }) {
  const paid = report.orders.filter(isPaidOrder);
  const group = (key: 'order_status' | 'payment_status' | 'delivery_city', rows = report.orders) => {
    const values = new Map<string, number>();
    rows.forEach(o => { const label = (o[key] || 'Unknown').replace(/_/g, ' '); values.set(label, (values.get(label) || 0) + 1); });
    return [...values].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const out = report.inventory.filter(i => numeric(i.stock_quantity) <= 0).length;
  const low = report.inventory.filter(i => numeric(i.stock_quantity) > 0 && numeric(i.stock_quantity) <= (i.low_stock_threshold == null ? 5 : numeric(i.low_stock_threshold))).length;
  const storeSales = report.stores.filter(s => selectedStoreId === 'all' || s.id === selectedStoreId).map((store, i) => ({ label: store.name, value: paid.filter(o => o.store_id === store.id).reduce((sum, o) => sum + productRevenue(o), 0), color: CHART_COLOURS[i % CHART_COLOURS.length] }));
  if (paid.some(o => !o.store_id)) storeSales.push({ label: 'Unassigned', value: paid.filter(o => !o.store_id).reduce((sum, o) => sum + productRevenue(o), 0), color: '#94a3b8' });
  return <div className="ch-section-visual-grid">
    <FinancialCommandSummary refreshKey={refreshKey} />
    <Panel title="Stock availability" subtitle="Current warehouse · all stores"><DonutChart data={[{ label: 'Available', value: report.inventory.length - out - low, color: '#50e4eb' }, { label: 'Low stock', value: low, color: '#fbbf24' }, { label: 'Zero / negative', value: out, color: '#f04fed' }]} label="stock records" /></Panel>
    <Panel title="Top products" subtitle="Paid product sales · selected period"><MetricBars data={report.products.slice(0, 5).map(p => ({ label: p.name, value: p.revenue }))} format={formatCurrency} /></Panel>
    <Panel title="Order mix" subtitle="All orders · selected period"><DonutChart data={group('order_status')} label="orders" /></Panel>
    <Panel title="Payment mix" subtitle="Order states · selected period"><DonutChart data={group('payment_status')} label="orders" /></Panel>
    <Panel title="Fulfilment" subtitle="Paid orders · selected period"><MetricBars data={[
      { label: 'Picking', value: paid.filter(o => ['confirmed', 'processing', 'picking'].includes(o.order_status)).length },
      { label: 'Packing', value: paid.filter(o => ['picked', 'packing', 'ready_for_packing'].includes(o.order_status)).length },
      { label: 'Dispatch', value: paid.filter(o => ['packed', 'ready_to_ship'].includes(o.order_status)).length },
      { label: 'In delivery', value: paid.filter(o => ['shipped', 'shipment_booked', 'collected', 'at_local_depot', 'out_for_delivery', 'delivery_attempted', 'delivery_rescheduled'].includes(o.order_status)).length },
      { label: 'Delivered', value: paid.filter(o => ['delivered', 'completed'].includes(o.order_status)).length },
    ]} /></Panel>
    <Panel title="Store sales" subtitle="Paid products · selected period"><MetricBars data={storeSales} format={formatCurrency} /></Panel>
    <Panel title="Delivery locations" subtitle="Paid orders · selected period"><MetricBars data={group('delivery_city', paid).slice(0, 6)} /></Panel>
    <Panel title="Cost quality" subtitle="Paid orders · selected period"><DonutChart data={[
      { label: 'Recorded', value: report.current.costRows.filter(o => ['order_total', 'snapshot'].includes(o.cost_quality)).length, color: '#50e4eb' },
      { label: 'Estimated', value: report.current.estimatedCosts, color: '#fbbf24' },
      { label: 'Incomplete', value: report.current.missingCosts, color: '#f04fed' },
    ]} label="paid orders" /><div className="ch-visual-metrics"><VisualMetric label="No buyer email" value={paid.filter(o => !o.customer_email?.trim()).length} detail="Excluded from repeat-buyer ratio" /></div></Panel>
    <BusinessTargets key={refreshKey} visual currentStats={report.current} periodStart={report.start} periodEnd={report.end} />
    <CommunicationAnalytics visual key={'messages-' + selectedStoreId + '-' + refreshKey} />
    <IntegrationHealth visual key={'integrations-' + refreshKey} />
    <ChannelVisuals key={selectedStoreId + report.start.toISOString() + report.end.toISOString()} start={report.start.toISOString().slice(0, 10)} end={report.end.toISOString().slice(0, 10)} selectedStoreId={selectedStoreId} refreshKey={refreshKey} />
  </div>;
}

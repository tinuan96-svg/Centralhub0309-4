'use client';

import { Fragment, type ReactNode } from 'react';
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
import MetricMasonry from '@/components/dashboard/MetricMasonry';

export type SectionVisualWidgetDefinition = {
  id: string;
  title: string;
  description: string;
  content: ReactNode;
  desktop: number;
  tablet: number;
  mobile: number;
  minHeight: number;
};

export function getSectionVisualWidgets({ report, selectedStoreId, refreshKey }: { report: DashboardReport; selectedStoreId: string; refreshKey: number }): SectionVisualWidgetDefinition[] {
  const paid = report.orders.filter(isPaidOrder);
  const group = (key: 'order_status' | 'payment_method' | 'delivery_city', rows = paid) => {
    const values = new Map<string, number>();
    rows.forEach(o => { const label = (String(o[key] || 'Unknown')).replace(/_/g, ' '); values.set(label, (values.get(label) || 0) + 1); });
    return [...values].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const out = report.inventory.filter(i => numeric(i.stock_quantity) <= 0).length;
  const low = report.inventory.filter(i => numeric(i.stock_quantity) > 0 && numeric(i.stock_quantity) <= (i.low_stock_threshold == null ? 5 : numeric(i.low_stock_threshold))).length;
  const storeSales = report.stores.filter(s => selectedStoreId === 'all' || s.id === selectedStoreId).map((store, i) => ({ label: store.name, value: paid.filter(o => o.store_id === store.id).reduce((sum, o) => sum + productRevenue(o), 0), color: CHART_COLOURS[i % CHART_COLOURS.length] }));
  if (paid.some(o => !o.store_id)) storeSales.push({ label: 'Unassigned', value: paid.filter(o => !o.store_id).reduce((sum, o) => sum + productRevenue(o), 0), color: '#94a3b8' });

  const common = { desktop: 4, tablet: 6, mobile: 12, minHeight: 260 };
  return [
    { id: 'finance-summary', title: 'Finance', description: 'Seven-day accounting summary', ...common, minHeight: 300, content: <FinancialCommandSummary refreshKey={refreshKey} card="finance" /> },
    { id: 'bank-reconciliation', title: 'Bank reconciliation', description: 'Current reconciliation status', ...common, minHeight: 300, content: <FinancialCommandSummary refreshKey={refreshKey} card="bank" /> },
    { id: 'stock-availability', title: 'Stock availability', description: 'Current warehouse stock availability', ...common, content: <Panel title="Stock availability" subtitle="Current warehouse · all stores"><DonutChart data={[{ label: 'Available', value: report.inventory.length - out - low, color: '#50e4eb' }, { label: 'Low stock', value: low, color: '#fbbf24' }, { label: 'Zero / negative', value: out, color: '#f04fed' }]} label="stock records" /></Panel> },
    { id: 'payment-methods', title: 'Payment methods', description: 'Payment mix for paid orders', ...common, content: <Panel title="Payment methods" subtitle="Paid orders only · selected period"><DonutChart data={group('payment_method')} label="paid orders" /></Panel> },
    { id: 'order-mix', title: 'Order mix', description: 'Paid order status mix', ...common, content: <Panel title="Order mix" subtitle="Paid order status · selected period"><DonutChart data={group('order_status')} label="paid orders" /></Panel> },
    { id: 'top-products', title: 'Top products', description: 'Top products by paid product sales', ...common, content: <Panel title="Top products" subtitle="Paid product sales · selected period"><MetricBars data={report.products.slice(0, 5).map(p => ({ label: p.name, value: p.revenue }))} format={formatCurrency} /></Panel> },
    { id: 'delivery-locations', title: 'Delivery locations', description: 'Paid orders by delivery city', ...common, content: <Panel title="Delivery locations" subtitle="Paid orders · selected period"><MetricBars data={group('delivery_city').slice(0, 6)} /></Panel> },
    { id: 'store-sales', title: 'Store sales', description: 'Paid product sales by store', ...common, content: <Panel title="Store sales" subtitle="Paid products · selected period"><MetricBars data={storeSales} format={formatCurrency} /></Panel> },
    { id: 'fulfilment', title: 'Fulfilment', description: 'Paid orders across fulfilment stages', ...common, minHeight: 300, content: <Panel title="Fulfilment" subtitle="Paid orders · selected period"><MetricBars data={[
      { label: 'Picking', value: paid.filter(o => ['confirmed', 'processing', 'picking'].includes(o.order_status)).length },
      { label: 'Packing', value: paid.filter(o => ['picked', 'packing', 'ready_for_packing'].includes(o.order_status)).length },
      { label: 'Dispatch', value: paid.filter(o => ['packed', 'ready_to_ship'].includes(o.order_status)).length },
      { label: 'In delivery', value: paid.filter(o => ['shipped', 'shipment_booked', 'collected', 'at_local_depot', 'out_for_delivery', 'delivery_attempted', 'delivery_rescheduled'].includes(o.order_status)).length },
      { label: 'Delivered', value: paid.filter(o => ['delivered', 'completed'].includes(o.order_status)).length },
    ]} /></Panel> },
    { id: 'target-progress', title: 'Target progress', description: 'Progress against saved business targets', ...common, content: <BusinessTargets key={selectedStoreId} refreshKey={refreshKey} visual currentStats={report.current} periodStart={report.start} periodEnd={report.end} /> },
    { id: 'cost-quality', title: 'Cost quality', description: 'Product-cost data quality for paid orders', ...common, content: <Panel title="Cost quality" subtitle="Paid orders · selected period"><DonutChart data={[
      { label: 'Recorded', value: report.current.costRows.filter(o => ['order_total', 'snapshot'].includes(o.cost_quality)).length, color: '#50e4eb' },
      { label: 'Estimated', value: report.current.estimatedCosts, color: '#fbbf24' },
      { label: 'Incomplete', value: report.current.missingCosts, color: '#f04fed' },
    ]} label="paid orders" /><div className="ch-visual-metrics"><VisualMetric label="No buyer email" value={paid.filter(o => !o.customer_email?.trim()).length} detail="Excluded from repeat-buyer ratio" /></div></Panel> },
    { id: 'customer-communications', title: 'Customer communications', description: 'Open conversations and today’s messages', ...common, content: <CommunicationAnalytics visual key={'messages-' + selectedStoreId} refreshKey={refreshKey} /> },
    { id: 'integration-health', title: 'Integration health', description: 'Saved operational integration checks', ...common, content: <IntegrationHealth visual refreshKey={refreshKey} /> },
    { id: 'channel-analytics', title: 'Channel analytics', description: 'Website and marketing analytics cards', desktop: 12, tablet: 12, mobile: 12, minHeight: 360, content: <MetricMasonry><ChannelVisuals key={selectedStoreId + report.start.toISOString() + report.end.toISOString()} start={report.start.toISOString().slice(0, 10)} end={report.end.toISOString().slice(0, 10)} selectedStoreId={selectedStoreId} refreshKey={refreshKey} /></MetricMasonry> },
  ];
}

export default function SectionVisuals(props: { report: DashboardReport; selectedStoreId: string; refreshKey: number }) {
  return <MetricMasonry>{getSectionVisualWidgets(props).map(widget => <Fragment key={widget.id}>{widget.content}</Fragment>)}</MetricMasonry>;
}

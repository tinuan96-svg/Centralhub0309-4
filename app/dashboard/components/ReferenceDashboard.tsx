'use client';

import type { DashboardReport } from '@/lib/dashboard/reporting';
import { isPaidOrder, numeric, productRevenue } from '@/lib/dashboard/metrics';
import { formatCurrency } from '@/lib/utils/currency';
import TimeSeriesChart from '@/components/TimeSeriesChart';
import { Panel } from '@/components/dashboard/Charts';
import { ActivityCalendar, GradientRing, HealthRadar, MODEL_COLORS, StoreScatter, WeeklyColumns } from '@/components/dashboard/ReferenceCharts';
import { Boxes, CircleCheck, ClipboardList, PackageSearch, Receipt, Truck } from 'lucide-react';
import MicroTrend from '@/components/dashboard/MicroTrend';
import { VisualMetric } from '@/components/dashboard/VisualMetric';

export default function ReferenceDashboard({ report, selectedStoreId, timeRange }: { report: DashboardReport; selectedStoreId: string; timeRange: string }) {
  const paid = report.orders.filter(isPaidOrder);
  const stores = report.stores.filter(s => selectedStoreId === 'all' || s.id === selectedStoreId);
  if (paid.some(o => !o.store_id)) stores.push({ id: 'unassigned', name: 'Unassigned', slug: null });
  const daily = new Map<string, Map<string, number>>();
  const calendar = new Map<string, { date: string; count: number; revenue: number }>();
  const buyers = new Map<string, number>();
  for (const order of paid) {
    const day = order.created_at.slice(0, 10);
    const id = order.store_id || 'unassigned';
    const values = daily.get(id) || new Map<string, number>();
    values.set(day, (values.get(day) || 0) + productRevenue(order)); daily.set(id, values);
    const record = calendar.get(day) || { date: day, count: 0, revenue: 0 };
    record.count++; record.revenue += productRevenue(order); calendar.set(day, record);
    const email = order.customer_email?.trim().toLowerCase();
    if (email) buyers.set(email, (buyers.get(email) || 0) + 1);
  }
  const dates: string[] = [];
  const start = report.start.toISOString().slice(0, 10), end = report.end.toISOString().slice(0, 10);
  for (const day = new Date(start + 'T00:00:00Z'); day.toISOString().slice(0, 10) <= end && dates.length < 3661; day.setUTCDate(day.getUTCDate() + 1)) dates.push(day.toISOString().slice(0, 10));
  const series = stores.map((s, i) => ({ id: s.id, name: s.name, color: MODEL_COLORS[i % MODEL_COLORS.length], data: dates.map(date => ({ date, value: daily.get(s.id)?.get(date) || 0 })) }));
  const orderDays = new Map(paid.map(o => [o.id, o.created_at.slice(0, 10)]));
  const profitByDay = new Map<string, number>();
  for (const row of report.current.costRows) {
    const date = orderDays.get(row.id);
    if (date) profitByDay.set(date, (profitByDay.get(date) || 0) + row.gross_profit);
  }
  const momentum = [{ id: 'sales', name: 'Product sales', color: '#39e6ef', data: dates.map(date => ({ date, value: calendar.get(date)?.revenue || 0 })) }, ...(report.current.actualGrossProfit === null ? [] : [{ id: 'gross', name: 'Order gross profit', color: '#d38efa', data: dates.map(date => ({ date, value: profitByDay.get(date) || 0 })) }])];
  const ratio = (n: number, d: number) => d > 0 ? n / d * 100 : null;
  const delivered = paid.filter(o => ['delivered', 'completed'].includes(o.order_status)).length;
  const stocked = report.inventory.filter(i => numeric(i.stock_quantity) > 0).length;
  const lowStock = report.inventory.filter(i => numeric(i.stock_quantity) > 0 && numeric(i.stock_quantity) <= (i.low_stock_threshold == null ? 5 : numeric(i.low_stock_threshold))).length;
  const recorded = report.current.costRows.filter(o => ['order_total', 'snapshot'].includes(o.cost_quality)).length;
  const repeat = [...buyers.values()].filter(n => n > 1).length;
  const paymentGroups = [
    { label: 'Paid', value: report.orders.filter(o => o.payment_status === 'paid').length, color: '#ee42ef' },
    { label: 'Awaiting', value: report.orders.filter(o => ['pending', 'pending_payment', 'unpaid'].includes(o.payment_status)).length, color: '#ecaff3' },
    { label: 'Other', value: report.orders.filter(o => !['paid', 'pending', 'pending_payment', 'unpaid'].includes(o.payment_status)).length, color: '#a58bff' },
  ];
  const scatter = stores.map(s => {
    const orders = paid.filter(o => (o.store_id || 'unassigned') === s.id);
    const ids = new Set(orders.map(o => o.id));
    const costs = report.current.costRows.filter(o => ids.has(o.id));
    const total = orders.reduce((sum, o) => sum + numeric(o.total), 0);
    const complete = costs.length === orders.length && costs.every(o => o.cost_quality !== 'missing' && Number.isFinite(o.gross_profit));
    return { id: s.id, name: s.name, revenue: orders.reduce((sum, o) => sum + productRevenue(o), 0), margin: complete && total > 0 ? costs.reduce((sum, o) => sum + o.gross_profit, 0) / total * 100 : null, estimated: costs.some(o => o.cost_quality === 'estimated_current') };
  });

  return <div className="ch-model-grid">
    <div className="ch-snapshot-signals" aria-label="Operational indicators">
      {[
        { label: 'Orders', value: report.orders.length, icon: ClipboardList, detail: 'All orders in selected scope' },
        { label: 'Paid', value: paid.length, icon: CircleCheck, detail: 'Eligible paid orders in selected scope' },
        { label: 'Undelivered paid', value: paid.length - delivered, icon: Truck, detail: 'Paid orders not yet delivered or completed' },
        { label: 'Average product sale', value: paid.length ? formatCurrency(report.current.totalRevenue / paid.length) : '—', icon: Receipt, detail: 'Paid product sales / paid orders, excluding delivery' },
        { label: 'Low stock · global', value: lowStock, icon: Boxes, detail: 'Current shared warehouse stock records at or below threshold' },
        { label: 'Incomplete costs', value: report.current.missingCosts, icon: PackageSearch, detail: 'Paid orders without complete product costs' },
      ].map(item => <div key={item.label} title={item.detail}><item.icon size={16} aria-hidden="true" /><span>{item.label}</span><strong key={item.value} className="ch-value-arrival">{typeof item.value === 'number' ? item.value.toLocaleString('en-GB') : item.value}</strong></div>)}
    </div>
    <section className="ch-panel ch-model-financial-band" aria-label="Financial totals and key ratios">
      <div className="ch-model-total"><span className="ch-model-label">Product sales</span><strong key={report.current.totalRevenue} className="ch-value-arrival">{formatCurrency(report.current.totalRevenue)}</strong><MicroTrend values={momentum[0].data.map(d => d.value)} label="Daily product sales in GBP" /><dl><div><dt>Paid expenses</dt><dd>{formatCurrency(report.current.totalOverhead)}</dd></div><div><dt>Warehouse · global</dt><dd>{report.current.totalInventoryValue === null ? '—' : formatCurrency(report.current.totalInventoryValue)}</dd></div></dl></div>
      <div className="ch-model-total"><span className="ch-model-label">Order gross profit</span><strong key={report.current.actualGrossProfit} className="ch-value-arrival">{report.current.actualGrossProfit === null ? '—' : formatCurrency(report.current.actualGrossProfit)}</strong>{momentum[1] && <MicroTrend values={momentum[1].data.map(d => d.value)} label="Daily order gross profit in GBP" color="#f04fed" />}<span className="ch-model-meta">{report.current.missingCosts ? 'Incomplete costs' : report.current.estimatedCosts ? 'Estimated costs included' : 'Before fees & overhead'}</span><dl><div><dt>After paid expenses</dt><dd>{report.current.netProfit === null ? '—' : formatCurrency(report.current.netProfit)}</dd></div></dl></div>
      <GradientRing label="Delivered" value={ratio(delivered, paid.length)} detail={`${delivered} / ${paid.length} paid orders`} />
      <GradientRing label="Recorded costs" value={ratio(recorded, paid.length)} detail={`${recorded} / ${paid.length} paid orders`} />
      <GradientRing label="Stock available" value={ratio(stocked, report.inventory.length)} detail="Current warehouse · all stores" />
    </section>
    <Panel title="Payment positions" subtitle="Payment states · all orders in the period" className="ch-model-positions">
      <div className="ch-model-dot-rows">{paymentGroups.map(row => { const percent = ratio(row.value, report.orders.length); return <div key={row.label}><span>{row.label}</span><div className="ch-model-dots" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ background: percent !== null && i < Math.round(percent / 10) ? row.color : 'var(--model-track)' }} />)}</div><strong>{percent === null ? '—' : percent.toFixed(1) + '%'}</strong><small>{row.value}</small></div>; })}</div>
    </Panel>
    <section className="ch-panel ch-model-trend-profile" aria-label="Sales trend and operating ratios">
      <div className="ch-model-trend"><TimeSeriesChart compact dense series={momentum} timeRange={timeRange} title="Sales & order gross profit" subtitle={report.current.actualGrossProfit === null ? 'GBP · Profit unavailable: incomplete costs' : 'GBP · Gross includes delivery, before fees'} /></div>
      <HealthRadar axes={[{ label: 'Paid', value: ratio(paid.length, report.orders.length), detail: 'Eligible paid / all orders' }, { label: 'Delivery', value: ratio(delivered, paid.length), detail: 'Delivered / paid orders' }, { label: 'Repeat', value: ratio(repeat, buyers.size), detail: 'Repeat / identified buyers' }, { label: 'Costs', value: ratio(recorded, paid.length), detail: 'Recorded costs / paid orders' }, { label: 'Stock', value: ratio(stocked, report.inventory.length), detail: 'Positive stock / stock records' }]} />
    </section>
    <Panel title="Sales & profitability" subtitle="Store comparison · before fees & overhead" className="ch-model-profit"><StoreScatter stores={scatter} /></Panel>

    <section className="ch-rate-strip" aria-label="Operating rates">
      {[
        { label: 'Paid order rate', value: ratio(paid.length, report.orders.length), detail: 'Eligible paid / all orders' },
        { label: 'Delivery completion', value: ratio(delivered, paid.length), detail: 'Delivered / paid orders' },
        { label: 'Repeat buyer rate', value: ratio(repeat, buyers.size), detail: 'Repeat / identified buyers' },
        { label: 'Recorded cost coverage', value: ratio(recorded, paid.length), detail: 'Recorded costs / paid orders' },
      ].map(rate => <div key={rate.label} title={rate.detail}><span>{rate.label}</span><strong>{rate.value === null ? '—' : rate.value.toFixed(1) + '%'}</strong><div className="ch-rate-track" aria-hidden="true"><i style={{ width: (rate.value === null ? 0 : Math.max(0, Math.min(100, rate.value))) + '%' }} /></div></div>)}
    </section>
    <Panel title="Store sales mix" subtitle="Paid product sales · selected period" className="ch-store-mix">
      {scatter.map((store, index) => {
        const share = ratio(store.revenue, report.current.totalRevenue);
        return <div className="ch-store-mix-row" key={store.id}><div><span>{store.name}</span><strong>{formatCurrency(store.revenue)}</strong></div><div className="ch-rate-track" aria-hidden="true"><i style={{ width: Math.max(0, Math.min(100, share ?? 0)) + '%', background: MODEL_COLORS[index % MODEL_COLORS.length] }} /></div><small>{share === null ? 'No sales baseline' : share.toFixed(1) + '% of product sales'} · {paid.filter(order => (order.store_id || 'unassigned') === store.id).length} paid orders</small></div>;
      })}
    </Panel>
    <Panel title="Repeat customers" className="ch-model-customer"><GradientRing segmented label="Repeat buyer ratio" value={ratio(repeat, buyers.size)} detail={`${repeat} of ${buyers.size} identified buyers`} /><div className="ch-visual-metrics"><VisualMetric label="Single-order buyers" value={buyers.size - repeat} /><VisualMetric label="Orders / buyer" value={buyers.size ? ([...buyers.values()].reduce((sum, count) => sum + count, 0) / buyers.size).toFixed(2) : '—'} /></div></Panel>
    <Panel title="Weekly sales" className="ch-model-weekly"><WeeklyColumns series={series.map(s => ({ id: s.id, name: s.name, values: s.data }))} dates={dates.slice(-7)} /></Panel>
    <Panel title="Order activity" className="ch-model-activity"><ActivityCalendar days={[...calendar.values()]} start={start} end={end} /></Panel>
  </div>;
}

'use client';

import Link from 'next/link';
import { Activity, ArrowUpRight, Clock3, PackageSearch, ReceiptText, TrendingUp, WifiOff } from 'lucide-react';
import { useMemo } from 'react';
import type { DashboardReport } from '@/lib/dashboard/reporting';
import type { DashboardConnection } from '@/lib/hooks/useDashboardRealtime';
import { formatCurrency } from '@/lib/utils/currency';

type Props = { report: DashboardReport; connection: DashboardConnection; refreshError: boolean; selectedStoreId: string };

function readableCount(value: number) { return value.toLocaleString('en-GB'); }

export default function BusinessPulse({ report, connection, refreshError, selectedStoreId, mode = 'pulse', demo = false }: Props & { mode?: 'pulse' | 'signals'; demo?: boolean }) {
  const activity = useMemo(() => {
    const start = report.start.getTime();
    const end = Math.min(report.end.getTime(), report.loadedAt.getTime());
    const span = Math.max(1, end - start);
    const steps = 16;
    const buckets = Array.from({ length: steps }, () => ({ orders: 0, revenue: 0 }));
    for (const order of report.orders) {
      const when = Date.parse(order.created_at);
      if (!Number.isFinite(when) || when < start || when > end) continue;
      const index = Math.min(steps - 1, Math.floor((when - start) / span * steps));
      buckets[index].orders++;
      buckets[index].revenue += Number(order.total) || 0;
    }
    const max = Math.max(1, ...buckets.map(bucket => bucket.revenue));
    const points = buckets.map((bucket, index) => {
      const x = 6 + index * (308 / (steps - 1));
      const y = 79 - Math.max(0, bucket.revenue) / max * 61;
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    const peak = Math.max(0, ...buckets.map(bucket => bucket.revenue));
    const avgOrder = report.current.totalOrders ? report.current.totalRevenue / report.current.totalOrders : null;
    return { buckets, points, peak, avgOrder };
  }, [report]);

  const movingLowStock = useMemo(() => {
    const stocks = new Map(report.inventory.map(row => [row.product_id, row]));
    return report.products
      .filter(product => {
        const stock = stocks.get(product.id);
        if (!stock || product.units <= 0) return false;
        const threshold = stock.low_stock_threshold == null ? 0 : Number(stock.low_stock_threshold);
        return stock.stock_quantity <= threshold;
      })
      .map(product => ({ ...product, stock: stocks.get(product.id)! }))
      .sort((a, b) => b.units - a.units);
  }, [report]);

  const incompleteCosts = report.current.missingCosts > 0;
  const daysCovered = Math.max(1, (Math.min(report.end.getTime(), report.loadedAt.getTime()) - report.start.getTime()) / 86_400_000);
  const isRecent = Date.now() - report.loadedAt.getTime() < 90_000;
  const live = !demo && !refreshError && isRecent && connection === 'connected';
  const polled = !demo && !refreshError && isRecent && connection === 'polling';
  const top = report.products.slice(0, 3);
  // This is realised paid-unit pace, not a forecast or a purchase quantity.
  const lowStockDetail = movingLowStock.slice(0, 3).map(product => ({
    ...product,
    dailyUnits: product.units / daysCovered,
  }));

  if (mode === 'signals') return <section className="ch-signal-panel ch-panel" aria-label="Growth and attention signals">
      <div className="ch-business-decisions">
        <div className="ch-business-decisions-title"><TrendingUp size={16} /><strong>Growth & attention signals</strong><small>Read-only · derived from this report</small></div>
        {incompleteCosts && <Link href="/profit-analysis" className="ch-business-action"><ReceiptText size={17}/><span><strong>Complete cost coverage</strong><small>Gross profit is unavailable while paid-order costs are incomplete. Review cost snapshots.</small></span><ArrowUpRight size={16}/></Link>}
        {movingLowStock.length > 0 && <Link href="/backorder-planning" className="ch-business-action"><PackageSearch size={17}/><span><strong>{readableCount(movingLowStock.length)} selling products at or below stock threshold</strong><small>Shared warehouse quantity · paid units from selected period.</small>
          {lowStockDetail.map(product => <small className="ch-business-stock-detail" key={product.id}><b>{product.name}</b> · on hand {product.stock.stock_quantity.toLocaleString('en-GB')} · sold {product.units.toLocaleString('en-GB')} · {product.dailyUnits.toFixed(1)} units/day in period · threshold {product.stock.low_stock_threshold == null ? 'not set' : product.stock.low_stock_threshold.toLocaleString('en-GB')}</small>)}
          <small>Open Backorder Planning for lead-time and safety-stock-based quantities; no purchase quantity is estimated here.</small>
        </span><ArrowUpRight size={16}/></Link>}
        {top[0] && <Link href="/profit-analysis" className="ch-business-action"><TrendingUp size={17}/><span><strong>Highest paid-product revenue: {top[0].name}</strong><small>{readableCount(top[0].units)} units · {formatCurrency(top[0].revenue)} product sales in selected period.</small></span><ArrowUpRight size={16}/></Link>}
        {!top.length && !incompleteCosts && movingLowStock.length === 0 && <div className="ch-business-action ch-business-action-empty"><Clock3 size={17}/><span><strong>No paid-product sales in the selected period</strong><small>Check the period, storefront filter and order/payment sync before making a pricing decision.</small></span></div>}
        <div className="ch-business-note"><WifiOff size={13}/><span>Store selector filters sales; stock and stock thresholds are shared-warehouse figures. No forecasts or unverified margin claims.</span></div>
      </div>
  </section>;
  return <section className="ch-business-pulse ch-panel" aria-label="Measured business pulse">
    <div className="ch-business-pulse-head">
      <div><p className="ch-business-eyebrow"><Activity size={15} /> CENTRALHUB · BUSINESS PULSE</p>
        <h2>Business pulse <span className="ch-business-inline-scope">· selected period</span></h2>
      </div>
      <div className="ch-business-source" data-live={live || polled} title={'Report sampled ' + report.loadedAt.toLocaleTimeString('en-GB')}>
        <span className="ch-business-source-dot" />
        <span>{demo ? 'Demo data · simulated' : live ? 'Live · 30s checks' : polled ? '30s checks' : connection === 'offline' ? 'Offline · cached' : connection === 'paused' ? 'Paused · cached' : 'Refresh delayed'}</span>
        <small>Sampled {report.loadedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</small>
      </div>
    </div>

    <div className="ch-business-grid">
      <div className="ch-business-chart">
        <div className="ch-business-chart-head"><span><Activity size={14} /> Paid-order revenue rhythm</span><span>{report.current.totalOrders ? formatCurrency(activity.peak) + ' peak per interval' : 'No paid sales in period'}</span></div>
        <div className="ch-business-wave" data-active={live || polled}>
          <svg viewBox="0 0 320 96" preserveAspectRatio="none" role="img" aria-label={'Paid-order revenue over the selected period. ' + readableCount(report.current.totalOrders) + ' paid orders. Peak interval ' + formatCurrency(activity.peak) + '.'}>
            <defs><linearGradient id="business-wave-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity=".38"/><stop offset="100%" stopColor="#22d3ee" stopOpacity="0"/></linearGradient></defs>
            {[18, 38, 58, 79].map(y => <line key={y} x1="0" x2="320" y1={y} y2={y} stroke="currentColor" strokeOpacity=".13" strokeWidth=".8" />)}
            <polyline points={'6,79 ' + activity.points + ' 314,79'} fill="url(#business-wave-fill)" stroke="none" />
            <polyline points={activity.points} stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            {activity.buckets.map((bucket, i) => <circle key={i} cx={6 + i * (308 / 15)} cy={79 - Math.max(0, bucket.revenue) / Math.max(1, activity.peak) * 61} r="2" fill="#a5f3fc"><title>{readableCount(bucket.orders)} paid orders · {formatCurrency(bucket.revenue)}</title></circle>)}
          </svg><div className="ch-business-sweep" aria-hidden="true" />
        </div>
        <div className="ch-business-chart-foot"><span>{report.start.toLocaleDateString('en-GB')}</span><span>Paid orders · visual sweep only</span><span>{new Date(Math.min(report.end.getTime(), report.loadedAt.getTime())).toLocaleDateString('en-GB')}</span></div>
        <div className="ch-business-brief">
          <div><span>Paid revenue</span><strong>{formatCurrency(report.current.totalRevenue)}</strong></div>
          <div><span>Average paid order</span><strong>{activity.avgOrder === null ? '—' : formatCurrency(activity.avgOrder)}</strong></div>
          <div><span>Orders / covered day</span><strong>{(report.current.totalOrders / daysCovered).toFixed(1)}</strong></div>
        </div>
      </div>


    </div>
  </section>;
}

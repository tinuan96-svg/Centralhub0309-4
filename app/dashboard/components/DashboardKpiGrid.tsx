'use client';
import { CSSProperties } from 'react';
import { Banknote, ChartNoAxesCombined, Coins, Package, ShoppingBag, Wallet } from 'lucide-react';
import { useDashboardFilterStore } from '@/lib/store/dashboardFilterStore';
import { formatCurrency } from '@/lib/utils/currency';
import { PeriodSummary, percentChange } from '@/lib/dashboard/reporting';

export default function DashboardKpiGrid({ current, previous, compact = false }: { current: PeriodSummary; previous: PeriodSummary | null; compact?: boolean }) {
  const { comparisonType } = useDashboardFilterStore();
  const cards = [
    { label: 'Paid order total', value: current.totalRevenue, previous: previous?.totalRevenue, icon: Banknote, colour: '#67e8f9', note: 'Payment-received order total including delivery charged' },
    { label: 'Product subtotal', value: current.productSubtotal, previous: previous?.productSubtotal, icon: Banknote, colour: '#38bdf8', note: 'Product item subtotal only, excluding delivery' },
    { label: 'Order gross profit', value: current.actualGrossProfit, previous: previous?.actualGrossProfit, icon: Coins, colour: '#6ee7b7', note: current.missingCosts ? 'Paid order product costs incomplete' : current.estimatedCosts ? 'Paid orders · includes estimated product costs' : 'Paid orders · before fees and operating costs' },
    { label: 'Paid expenses', value: current.totalOverhead, previous: previous?.totalOverhead, icon: Wallet, colour: '#fda4af', invert: true, note: 'Paid expense invoices · selected invoice dates' },
    { label: 'After paid expenses', value: current.netProfit, previous: previous?.netProfit, icon: ChartNoAxesCombined, colour: '#c4b5fd', note: 'Paid-order gross profit less paid expenses' },
    { label: 'Warehouse value', value: current.totalInventoryValue, icon: Package, colour: '#fcd34d', note: 'Current stock · all stores' },
    { label: 'Paid orders', value: current.totalOrders, previous: previous?.totalOrders, icon: ShoppingBag, colour: '#93c5fd', count: true, note: 'Payment received orders only' },
  ];
  return <div className="ch-kpi-grid">{cards.map(card => {
    const change = comparisonType === 'none' || card.value === null ? null : percentChange(card.value, card.previous);
    const positive = change !== null && (card.invert ? change < 0 : change > 0);
    return <article className={'ch-panel ch-kpi' + (compact ? ' ch-kpi-compact' : '')} key={card.label} title={card.note} style={{ '--metric-accent': card.colour } as CSSProperties}>
      <div className="flex items-start justify-between gap-2 mb-3"><p className="ch-kpi-label">{card.label}</p><span className="ch-kpi-icon"><card.icon size={18} aria-hidden="true" /></span></div>
      <p className="ch-kpi-value">{card.value === null ? '—' : card.count ? card.value.toLocaleString('en-GB') : formatCurrency(card.value)}</p>
      <p className="ch-comparison">{change === null ? card.label === 'Warehouse value' ? 'Current snapshot' : comparisonType === 'none' ? 'Selected period' : 'No comparable baseline' : <><span className={change === 0 ? 'text-slate-300' : positive ? 'text-emerald-300' : 'text-rose-300'}>{change > 0 ? '↗' : change < 0 ? '↘' : '—'} {Math.abs(change).toFixed(1)}%</span> vs {comparisonType === 'lastYear' ? 'last year' : 'previous period'}</>}</p>
      {!compact && <p className="text-xs text-slate-400 leading-relaxed mt-2">{card.note}</p>}
    </article>;
  })}</div>;
}

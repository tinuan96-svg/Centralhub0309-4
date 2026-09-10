'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import StoreScopeSelector from '@/components/StoreScopeSelector';
import TimeSeriesChart, { ChartSeries } from '@/components/TimeSeriesChart';
import {
  MasterDataEntityReport as Report,
  MasterDataEntityType,
  MasterDataReportService,
  MasterDataTimeRange,
} from '@/lib/services/masterDataReportService';

const PALETTE = ['#38bdf8', '#34d399', '#f59e0b', '#a78bfa', '#fb7185', '#22d3ee'];
const RANGES: Array<{ id: MasterDataTimeRange; label: string }> = [
  { id: '7days', label: '7D' },
  { id: '30days', label: '30D' },
  { id: '90days', label: '90D' },
  { id: '6months', label: '6M' },
  { id: '12months', label: '12M' },
  { id: 'all', label: 'All' },
];

type Metric = 'revenue' | 'units' | 'profit';

const gbp = (value: number) => new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 2,
}).format(Number(value || 0));

const integer = (value: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(Number(value || 0));
const percent = (value: number) => `${Number(value || 0).toFixed(1)}%`;

function GrowthBadge({ value, suffix = '%' }: { value: number | null | undefined; suffix?: string }) {
  if (value === null || value === undefined) return <span className="text-[10px] font-black uppercase text-violet-300">New / no baseline</span>;
  const positive = value > 0;
  const negative = value < 0;
  return (
    <span className={`text-[10px] font-black ${positive ? 'text-emerald-400' : negative ? 'text-rose-400' : 'text-slate-400'}`}>
      {positive ? '▲' : negative ? '▼' : '•'} {Math.abs(value).toFixed(1)}{suffix}
    </span>
  );
}

function KpiCard({ label, value, hint, tone = 'text-white' }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4 min-w-0">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-2 text-xl lg:text-2xl font-black tracking-tight truncate ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-[10px] text-slate-500 leading-snug">{hint}</p>}
    </div>
  );
}

function IndexCard({ label, value, detail, score }: { label: string; value: string; detail: string; score?: number }) {
  const width = Math.max(0, Math.min(100, score ?? 0));
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-black text-white">{value}</p>
        </div>
      </div>
      {score !== undefined && (
        <div className="mt-3 h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div className="h-full rounded-full bg-cyan-500" style={{ width: `${width}%` }} />
        </div>
      )}
      <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">{detail}</p>
    </div>
  );
}

export default function MasterDataEntityReport({ entityType, entityId }: { entityType: MasterDataEntityType; entityId: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const initialStore = searchParams.get('storeId');
  const initialRange = (searchParams.get('timeRange') || '30days') as MasterDataTimeRange;
  const [storeId, setStoreId] = useState<string | null>(initialStore && initialStore !== 'all' ? initialStore : null);
  const [timeRange, setTimeRange] = useState<MasterDataTimeRange>(RANGES.some(r => r.id === initialRange) ? initialRange : '30days');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<Metric>('revenue');
  const [productSearch, setProductSearch] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    MasterDataReportService.getReport(entityType, entityId, { storeId, timeRange })
      .then(data => { if (active) setReport(data); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [entityType, entityId, storeId, timeRange]);

  const syncUrl = (nextStore: string | null, nextRange: MasterDataTimeRange) => {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set('storeId', nextStore || 'all');
    qs.set('timeRange', nextRange);
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
  };

  const onStoreChange = (next: string | null) => {
    setStoreId(next);
    syncUrl(next, timeRange);
  };

  const onRangeChange = (next: MasterDataTimeRange) => {
    setTimeRange(next);
    syncUrl(storeId, next);
  };

  const mainSeries = useMemo<ChartSeries[]>(() => {
    if (!report) return [];
    return [{
      id: 'entity-total',
      name: report.entity.name,
      color: '#38bdf8',
      data: report.trend.map(point => ({
        date: point.date,
        value: metric === 'revenue' ? point.revenue : metric === 'units' ? point.units : point.profit,
      })),
    }];
  }, [report, metric]);

  const breakdownSeries = useMemo<ChartSeries[]>(() => {
    if (!report) return [];
    return report.breakdownTrend.map((series, index) => ({
      id: series.id,
      name: series.name,
      color: PALETTE[index % PALETTE.length],
      data: series.points.map(point => ({
        date: point.date,
        value: metric === 'revenue' ? point.revenue : metric === 'units' ? point.units : point.profit,
      })),
    }));
  }, [report, metric]);

  const filteredProducts = useMemo(() => {
    if (!report) return [];
    const q = productSearch.trim().toLowerCase();
    if (!q) return report.products;
    return report.products.filter(product =>
      product.name.toLowerCase().includes(q) ||
      (product.sku || '').toLowerCase().includes(q) ||
      product.brandName.toLowerCase().includes(q) ||
      product.categoryName.toLowerCase().includes(q)
    );
  }, [report, productSearch]);

  const insights = useMemo(() => {
    if (!report) return [];
    const result: Array<{ title: string; text: string; tone: string }> = [];
    const m = report.metrics;
    if (m.salesBreadth < 40 && m.activeProducts > 3) result.push({ title: 'Sales breadth opportunity', text: `Only ${percent(m.salesBreadth)} of active SKUs sold in this period. The long tail needs pricing, placement or range review.`, tone: 'text-amber-300' });
    if (m.stockRiskRate >= 25) result.push({ title: 'Stock risk is elevated', text: `${percent(m.stockRiskRate)} of stock-tracked active SKUs are low or out of stock. Protect the highest-revenue items first.`, tone: 'text-rose-300' });
    if (report.indices.topContributorShare >= 50) result.push({ title: 'Mix is concentrated', text: `${report.breakdown[0]?.name || 'The top contributor'} drives ${percent(report.indices.topContributorShare)} of revenue. This is strong, but creates dependency risk.`, tone: 'text-violet-300' });
    if (m.margin > 25 && m.revenue > 0) result.push({ title: 'Healthy gross margin', text: `Gross margin is ${percent(m.margin)} for the selected period. Use product-level rows to identify which SKUs are carrying it.`, tone: 'text-emerald-300' });
    if (m.outOfStockProducts > 0) result.push({ title: 'Lost-sales exposure', text: `${m.outOfStockProducts} active stock-tracked SKU${m.outOfStockProducts === 1 ? '' : 's'} are out of stock right now.`, tone: 'text-rose-300' });
    return result.slice(0, 5);
  }, [report]);

  const exportCsv = () => {
    if (!report) return;
    const rows = [
      ['Product', 'SKU', 'Brand', 'Category', 'Units', 'Revenue', 'Gross Profit', 'Margin %', 'Orders', 'Current Stock', 'Revenue Share %', 'Stock Cover Days'],
      ...report.products.map(p => [p.name, p.sku || '', p.brandName, p.categoryName, p.units, p.revenue, p.grossProfit, p.margin, p.orders, p.currentStock, p.revenueShare, p.stockCoverDays ?? '']),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${report.entity.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${timeRange}-report.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !report) {
    return <div className="p-8 text-center text-slate-500 uppercase font-black tracking-widest animate-pulse">Building deep performance report…</div>;
  }

  if (!report) {
    return <div className="p-8 text-center text-rose-400 font-bold">Unable to load this report.</div>;
  }

  const counterpart = entityType === 'category' ? 'brand' : 'category';
  const breakdownLabel = entityType === 'category' ? 'Brand' : 'Category';
  const periodLabel = timeRange === 'all' ? 'All paid-order history' : `${RANGES.find(r => r.id === timeRange)?.label || timeRange} selected period`;

  return (
    <div className="space-y-6 pb-16">
      <div className="rounded-[2rem] border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-950/50 p-5 lg:p-7 shadow-2xl">
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-6">
          <div className="flex items-start gap-4 min-w-0">
            <button onClick={() => router.back()} className="shrink-0 w-11 h-11 rounded-xl border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white">←</button>
            <div className="shrink-0 w-14 h-14 rounded-2xl border border-slate-700 bg-slate-800 flex items-center justify-center overflow-hidden text-2xl font-black text-cyan-300">
              {report.entity.logoUrl ? <img src={report.entity.logoUrl} alt="" className="w-full h-full object-contain p-1" /> : report.entity.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight truncate">{report.entity.name}</h1>
                <span className={`px-2 py-1 rounded-lg border text-[9px] font-black uppercase ${report.entity.isActive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800 text-slate-400'}`}>{report.entity.isActive ? 'Active' : 'Inactive'}</span>
              </div>
              <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-slate-500">{entityType === 'brand' ? 'Brand' : 'Category'} performance command centre</p>
              {report.entity.description && <p className="mt-2 max-w-3xl text-sm text-slate-400 line-clamp-2">{report.entity.description}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StoreScopeSelector value={storeId} onStoreChange={onStoreChange} />
            <div className="flex bg-slate-950/70 border border-slate-800 rounded-xl p-1 overflow-x-auto">
              {RANGES.map(range => (
                <button key={range.id} onClick={() => onRangeChange(range.id)} className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase whitespace-nowrap ${timeRange === range.id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>{range.label}</button>
              ))}
            </div>
            <button onClick={exportCsv} className="px-3 py-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-[10px] font-black uppercase">Export CSV</button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-500">
          <span className="px-2.5 py-1 rounded-lg bg-slate-950/60 border border-slate-800">{periodLabel}</span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-950/60 border border-slate-800">Paid orders only</span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-950/60 border border-slate-800">{report.period.bucket.toUpperCase()} trend buckets</span>
          {loading && <span className="text-cyan-400 animate-pulse">Refreshing…</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard label="Revenue" value={gbp(report.metrics.revenue)} tone="text-emerald-400" hint={`${gbp(report.metrics.revenuePerDay)} / day`} />
        <KpiCard label="Units sold" value={integer(report.metrics.units)} tone="text-blue-400" hint={`${report.metrics.unitsPerOrder.toFixed(1)} units / order`} />
        <KpiCard label="Orders" value={integer(report.metrics.orders)} tone="text-violet-300" hint={`${gbp(report.metrics.revenuePerOrder)} revenue / order`} />
        <KpiCard label="Gross profit" value={gbp(report.metrics.grossProfit)} tone="text-amber-400" hint={`${percent(report.metrics.margin)} gross margin`} />
        <KpiCard label="Avg selling price" value={gbp(report.metrics.avgUnitPrice)} tone="text-cyan-300" hint="Revenue divided by units sold" />
        <KpiCard label="Active SKUs" value={`${report.metrics.activeProducts}/${report.metrics.totalProducts}`} hint={`${report.metrics.sellingProducts} sold in period`} />
        <KpiCard label="Current stock" value={integer(report.metrics.currentStock)} hint="Stock-tracked active SKUs" />
        <KpiCard label="Low / out stock" value={`${report.metrics.lowStockProducts} / ${report.metrics.outOfStockProducts}`} tone={report.metrics.outOfStockProducts ? 'text-rose-300' : 'text-emerald-300'} hint="Current inventory risk" />
        <KpiCard label={`${breakdownLabel}s selling`} value={integer(report.metrics.contributorCount)} hint={`${report.metrics.storeCount} store${report.metrics.storeCount === 1 ? '' : 's'} generated sales`} />
        <KpiCard label="Revenue / active SKU" value={gbp(report.metrics.revenuePerActiveSku)} hint="Catalog productivity" />
      </div>

      {report.growth && report.previous && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-white">Period-over-period momentum</h2>
              <p className="text-xs text-slate-500 mt-1">Current period compared with the immediately preceding period of equal length.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Revenue', value: gbp(report.previous.revenue), growth: report.growth.revenue, suffix: '%' },
              { label: 'Units', value: integer(report.previous.units), growth: report.growth.units, suffix: '%' },
              { label: 'Orders', value: integer(report.previous.orders), growth: report.growth.orders, suffix: '%' },
              { label: 'Gross profit', value: gbp(report.previous.grossProfit), growth: report.growth.grossProfit, suffix: '%' },
              { label: 'Margin', value: percent(report.previous.margin), growth: report.growth.marginPoints, suffix: ' pp' },
            ].map(item => (
              <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Previous {item.label}</p>
                <p className="mt-1 font-black text-slate-200">{item.value}</p>
                <div className="mt-1"><GrowthBadge value={item.growth} suffix={item.suffix} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-white">Sales trajectory</h2>
              <p className="text-xs text-slate-500 mt-1">Revenue, unit and gross-profit movement across the selected period.</p>
            </div>
            <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1">
              {(['revenue', 'units', 'profit'] as Metric[]).map(item => (
                <button key={item} onClick={() => setMetric(item)} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase ${metric === item ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>{item}</button>
              ))}
            </div>
          </div>
          <TimeSeriesChart series={mainSeries} timeRange={timeRange} title={`${report.entity.name} ${metric} trend`} unit={metric === 'units' ? 'count' : 'GBP'} compact />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-white">Decision signals</h2>
          <div className="mt-3 space-y-3">
            {insights.length ? insights.map((item, index) => (
              <div key={index} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
                <p className={`text-[10px] font-black uppercase tracking-wider ${item.tone}`}>{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.text}</p>
              </div>
            )) : <p className="text-sm text-slate-500">No major risk or opportunity signal stands out for this period.</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <IndexCard label="Sales breadth" value={percent(report.indices.salesBreadth)} score={report.indices.salesBreadth} detail="Share of active SKUs that generated at least one paid sale." />
        <IndexCard label="Stock risk" value={percent(report.indices.stockRiskRate)} score={report.indices.stockRiskRate} detail="Active stock-tracked SKUs that are low or out of stock." />
        <IndexCard label={`Top ${breakdownLabel.toLowerCase()} share`} value={percent(report.indices.topContributorShare)} score={report.indices.topContributorShare} detail="Revenue dependency on the largest contributor." />
        <IndexCard label="Mix concentration" value={report.indices.concentrationIndex.toFixed(1)} score={report.indices.concentrationIndex} detail="HHI-style concentration index. Higher means sales rely on fewer contributors." />
        <IndexCard label="SKU productivity" value={gbp(report.indices.revenuePerActiveSku)} detail="Revenue generated per active catalog SKU in the period." />
        <IndexCard label="Daily run rate" value={gbp(report.indices.revenuePerDay)} detail="Average paid-item revenue per calendar day in the period." />
      </div>

      <div className="space-y-3">
        <div className="px-1">
          <h2 className="text-sm font-black uppercase tracking-widest text-white">{entityType === 'category' ? 'Brand sales over time' : 'Category sales over time'}</h2>
          <p className="text-xs text-slate-500 mt-1">Top six {breakdownLabel.toLowerCase()} contributors plotted separately. This is the cross-view for comparisons such as Rice by brand or Double Horse by category.</p>
        </div>
        <TimeSeriesChart series={breakdownSeries} timeRange={timeRange} title={`${breakdownLabel} contribution over time`} unit={metric === 'units' ? 'count' : 'GBP'} compact />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/45 overflow-hidden">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-sm font-black uppercase tracking-widest text-white">{breakdownLabel} contribution ranking</h2>
            <p className="text-xs text-slate-500 mt-1">Sales, profit, margin and revenue share inside {report.entity.name}.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-950/50 text-[9px] uppercase tracking-widest text-slate-500">
                <tr><th className="text-left px-4 py-3">{breakdownLabel}</th><th className="text-right px-3 py-3">Revenue</th><th className="text-right px-3 py-3">Units</th><th className="text-right px-3 py-3">Profit</th><th className="text-right px-3 py-3">Margin</th><th className="text-right px-4 py-3">Share</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {report.breakdown.map(row => {
                  const linkable = row.id !== 'unassigned' && row.id !== 'uncategorized';
                  return (
                    <tr key={row.id} className="hover:bg-slate-800/25">
                      <td className="px-4 py-3 min-w-[180px]">
                        {linkable ? <Link className="font-bold text-slate-200 hover:text-cyan-300" href={`/settings/master-data/${counterpart}s/${row.id}?storeId=${storeId || 'all'}&timeRange=${timeRange}`}>{row.name}</Link> : <span className="font-bold text-slate-400">{row.name}</span>}
                        <div className="mt-1 h-1 rounded bg-slate-800 overflow-hidden"><div className="h-full bg-cyan-500" style={{ width: `${Math.min(100, row.share)}%` }} /></div>
                      </td>
                      <td className="px-3 py-3 text-right font-black text-emerald-400">{gbp(row.revenue)}</td>
                      <td className="px-3 py-3 text-right text-slate-300">{integer(row.units)}</td>
                      <td className="px-3 py-3 text-right text-amber-300">{gbp(row.grossProfit)}</td>
                      <td className="px-3 py-3 text-right text-slate-300">{percent(row.margin)}</td>
                      <td className="px-4 py-3 text-right font-black text-cyan-300">{percent(row.share)}</td>
                    </tr>
                  );
                })}
                {!report.breakdown.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No paid sales in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/45 overflow-hidden">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-sm font-black uppercase tracking-widest text-white">Store performance</h2>
            <p className="text-xs text-slate-500 mt-1">Where this {entityType} is generating sales across the connected store network.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-950/50 text-[9px] uppercase tracking-widest text-slate-500">
                <tr><th className="text-left px-4 py-3">Store</th><th className="text-right px-3 py-3">Orders</th><th className="text-right px-3 py-3">Units</th><th className="text-right px-3 py-3">Revenue</th><th className="text-right px-3 py-3">Profit</th><th className="text-right px-4 py-3">Share</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {report.stores.map(store => (
                  <tr key={store.id} className="hover:bg-slate-800/25">
                    <td className="px-4 py-3 font-bold text-slate-200">{store.name}</td>
                    <td className="px-3 py-3 text-right">{store.orders}</td>
                    <td className="px-3 py-3 text-right">{integer(store.units)}</td>
                    <td className="px-3 py-3 text-right font-black text-emerald-400">{gbp(store.revenue)}</td>
                    <td className="px-3 py-3 text-right text-amber-300">{gbp(store.grossProfit)}</td>
                    <td className="px-4 py-3 text-right text-cyan-300 font-black">{percent(store.share)}</td>
                  </tr>
                ))}
                {!report.stores.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No store sales in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-800 bg-slate-900/45 overflow-hidden shadow-xl">
        <div className="p-4 lg:p-5 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-white">Complete product performance</h2>
            <p className="text-xs text-slate-500 mt-1">Includes selling and non-selling catalog items, live stock, velocity and stock-cover estimate.</p>
          </div>
          <div className="flex items-center gap-2">
            <input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search product, SKU, brand, category…" className="w-full lg:w-72 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-cyan-500" />
            <span className="shrink-0 text-[10px] font-black text-slate-500">{filteredProducts.length} rows</span>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[680px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-950 text-[9px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="text-left px-4 py-3">Product</th><th className="text-left px-3 py-3">{entityType === 'category' ? 'Brand' : 'Category'}</th><th className="text-right px-3 py-3">Units</th><th className="text-right px-3 py-3">Revenue</th><th className="text-right px-3 py-3">Profit</th><th className="text-right px-3 py-3">Margin</th><th className="text-right px-3 py-3">Orders</th><th className="text-right px-3 py-3">Share</th><th className="text-right px-3 py-3">Stock</th><th className="text-right px-4 py-3">Cover</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredProducts.map(product => (
                <tr key={product.id} className={`${product.revenue === 0 ? 'opacity-60' : ''} hover:bg-slate-800/25`}>
                  <td className="px-4 py-3 min-w-[230px]">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${product.isActive ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                      <div><p className="font-bold text-slate-200">{product.name}</p><p className="text-[9px] font-mono text-slate-500">{product.sku || 'NO SKU'}</p></div>
                    </div>
                  </td>
                  <td className="px-3 py-3 min-w-[140px] text-slate-400">{entityType === 'category' ? product.brandName : product.categoryName}</td>
                  <td className="px-3 py-3 text-right font-bold text-slate-300">{integer(product.units)}</td>
                  <td className="px-3 py-3 text-right font-black text-emerald-400">{gbp(product.revenue)}</td>
                  <td className="px-3 py-3 text-right text-amber-300 font-bold">{gbp(product.grossProfit)}</td>
                  <td className={`px-3 py-3 text-right font-bold ${product.margin >= 20 ? 'text-cyan-300' : product.revenue > 0 ? 'text-orange-300' : 'text-slate-600'}`}>{percent(product.margin)}</td>
                  <td className="px-3 py-3 text-right">{product.orders}</td>
                  <td className="px-3 py-3 text-right text-cyan-300">{percent(product.revenueShare)}</td>
                  <td className={`px-3 py-3 text-right font-black ${product.currentStock <= 0 ? 'text-rose-400' : product.currentStock <= product.lowStockThreshold ? 'text-amber-300' : 'text-slate-300'}`}>{integer(product.currentStock)}</td>
                  <td className="px-4 py-3 text-right text-slate-400">{product.stockCoverDays === null ? (product.units > 0 ? '—' : 'No sales') : `${product.stockCoverDays.toFixed(0)}d`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

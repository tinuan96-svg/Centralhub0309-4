'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import StoreScopeSelector from '@/components/StoreScopeSelector';
import TimeSeriesChart, { type ChartSeries } from '@/components/TimeSeriesChart';
import {
  CategoryRollupReportService,
  type CategoryRollupReport,
  type CategoryRollupTimeRange,
} from '@/lib/services/categoryRollupReportService';

const PALETTE = ['#38bdf8', '#34d399', '#f59e0b', '#a78bfa', '#fb7185', '#22d3ee', '#84cc16', '#f97316'];
const RANGES: Array<{ id: CategoryRollupTimeRange; label: string }> = [
  { id: '7days', label: '7D' },
  { id: '30days', label: '30D' },
  { id: '90days', label: '90D' },
  { id: '6months', label: '6M' },
  { id: '12months', label: '12M' },
  { id: 'all', label: 'All' },
];

type MetricKey = 'revenue' | 'units' | 'profit';
type ProductFilter = 'all' | 'sold' | 'zero' | 'low' | 'out';

const gbp = (value: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(Number(value || 0));
const integer = (value: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(Number(value || 0));
const decimal = (value: number, digits = 1) => Number(value || 0).toFixed(digits);
const percent = (value: number) => `${decimal(value)}%`;
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const divide = (value: number, total: number) => total ? value / total : 0;

function Section({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 px-1 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.16em] text-white">{title}</h2>
          {subtitle && <p className="mt-1 max-w-5xl text-xs leading-relaxed text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, hint, tone = 'text-white' }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/55 p-4">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-2 break-words text-xl font-black tracking-tight lg:text-2xl ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-[10px] leading-snug text-slate-500">{hint}</p>}
    </div>
  );
}

function IndexCard({ label, value, detail, inverse = false }: { label: string; value: number; detail: string; inverse?: boolean }) {
  const score = clamp(value);
  const healthy = inverse ? score <= 20 : score >= 60;
  const warn = inverse ? score <= 40 : score >= 35;
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
        <span className={`text-sm font-black ${healthy ? 'text-emerald-300' : warn ? 'text-amber-300' : 'text-rose-300'}`}>{percent(value)}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${healthy ? 'bg-emerald-400' : warn ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${score}%` }} />
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

function Growth({ value, suffix = '%' }: { value: number | null | undefined; suffix?: string }) {
  if (value === null || value === undefined) return <span className="text-[10px] font-black uppercase text-violet-300">New / no baseline</span>;
  return <span className={`text-[10px] font-black ${value > 0 ? 'text-emerald-400' : value < 0 ? 'text-rose-400' : 'text-slate-400'}`}>{value > 0 ? '▲' : value < 0 ? '▼' : '•'} {Math.abs(value).toFixed(1)}{suffix}</span>;
}

function Ranking({ title, rows, metric }: { title: string; rows: Array<{ id: string; name: string; revenue: number; units: number; grossProfit: number; share: number }>; metric: MetricKey }) {
  const value = (row: (typeof rows)[number]) => metric === 'revenue' ? row.revenue : metric === 'units' ? row.units : row.grossProfit;
  const max = Math.max(1, ...rows.map(value));
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
      <h3 className="text-xs font-black uppercase tracking-widest text-white">{title}</h3>
      <div className="mt-4 space-y-3">
        {rows.slice(0, 10).map((row, index) => (
          <div key={row.id}>
            <div className="mb-1 flex items-start justify-between gap-3 text-xs">
              <span className="min-w-0 break-words font-bold text-slate-300"><span className="mr-2 text-slate-600">#{index + 1}</span>{row.name}</span>
              <span className="shrink-0 font-black text-white">{metric === 'units' ? integer(value(row)) : gbp(value(row))}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${clamp(divide(value(row), max) * 100)}%` }} /></div>
            <p className="mt-1 text-right text-[9px] text-slate-600">{percent(row.share)} revenue share</p>
          </div>
        ))}
        {!rows.length && <p className="py-8 text-center text-xs text-slate-500">No paid sales in this period.</p>}
      </div>
    </div>
  );
}

export default function CategoryParentRollup({ entityId }: { entityId: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const initialStore = searchParams.get('storeId');
  const requestedRange = (searchParams.get('timeRange') || '30days') as CategoryRollupTimeRange;
  const [storeId, setStoreId] = useState<string | null>(initialStore && initialStore !== 'all' ? initialStore : null);
  const [timeRange, setTimeRange] = useState<CategoryRollupTimeRange>(RANGES.some(range => range.id === requestedRange) ? requestedRange : '30days');
  const [metric, setMetric] = useState<MetricKey>('revenue');
  const [report, setReport] = useState<CategoryRollupReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [productFilter, setProductFilter] = useState<ProductFilter>('all');

  useEffect(() => {
    let active = true;
    setLoading(true);
    CategoryRollupReportService.getReport(entityId, { storeId, timeRange })
      .then(data => { if (active) setReport(data); })
      .catch(error => { console.error('[CategoryParentRollup] load failed:', error); if (active) setReport(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [entityId, storeId, timeRange]);

  const syncUrl = (nextStore: string | null, nextRange: CategoryRollupTimeRange) => {
    const query = new URLSearchParams(searchParams.toString());
    query.set('storeId', nextStore || 'all');
    query.set('timeRange', nextRange);
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  };

  const mainSeries = useMemo<ChartSeries[]>(() => report ? [{
    id: 'category-rollup-total',
    name: report.entity.name,
    color: '#38bdf8',
    data: report.trend.map(point => ({ date: point.date, value: metric === 'revenue' ? point.revenue : metric === 'units' ? point.units : point.profit })),
  }] : [], [report, metric]);

  const childSeries = useMemo<ChartSeries[]>(() => report ? report.childTrend.map((series, index) => ({
    id: series.id,
    name: series.name,
    color: PALETTE[index % PALETTE.length],
    data: series.points.map(point => ({ date: point.date, value: metric === 'revenue' ? point.revenue : metric === 'units' ? point.units : point.profit })),
  })) : [], [report, metric]);

  const brandSeries = useMemo<ChartSeries[]>(() => report ? report.brandTrend.map((series, index) => ({
    id: series.id,
    name: series.name,
    color: PALETTE[(index + 2) % PALETTE.length],
    data: series.points.map(point => ({ date: point.date, value: metric === 'revenue' ? point.revenue : metric === 'units' ? point.units : point.profit })),
  })) : [], [report, metric]);

  const analytics = useMemo(() => {
    if (!report) return null;
    const sold = report.products.filter(product => product.revenue > 0);
    const zero = report.products.filter(product => product.revenue <= 0);
    const top3Share = sold.slice(0, 3).reduce((sum, product) => sum + product.revenueShare, 0);
    const top5Share = sold.slice(0, 5).reduce((sum, product) => sum + product.revenueShare, 0);
    const sellingBrands = report.brands.filter(row => row.revenue > 0);
    const concentration = sellingBrands.reduce((sum, row) => sum + Math.pow(row.share / 100, 2), 0) * 100;
    const revenueValues = sold.map(product => product.revenue).sort((a, b) => a - b);
    const marginValues = sold.map(product => product.margin).sort((a, b) => a - b);
    const median = (values: number[]) => values.length ? values[Math.floor(values.length / 2)] : 0;
    let cumulative = 0;
    let paretoCount = 0;
    for (const product of sold) { cumulative += product.revenueShare; paretoCount += 1; if (cumulative >= 80) break; }
    return {
      sold,
      zero,
      top3Share,
      top5Share,
      concentration,
      medianRevenue: median(revenueValues),
      medianMargin: median(marginValues),
      paretoCount,
      revenueLeader: sold[0] || null,
      fastest: [...sold].sort((a, b) => b.unitsPerDay - a.unitsPerDay)[0] || null,
      marginLeader: [...sold].sort((a, b) => b.margin - a.margin)[0] || null,
      marginWatch: [...sold].sort((a, b) => a.margin - b.margin)[0] || null,
    };
  }, [report]);

  const filteredProducts = useMemo(() => {
    if (!report) return [];
    const query = search.trim().toLowerCase();
    return report.products.filter(product => {
      if (productFilter === 'sold' && product.revenue <= 0) return false;
      if (productFilter === 'zero' && product.revenue > 0) return false;
      if (productFilter === 'low' && !(product.currentStock > 0 && product.currentStock <= product.lowStockThreshold)) return false;
      if (productFilter === 'out' && product.currentStock > 0) return false;
      if (!query) return true;
      return [product.name, product.sku || '', product.brandName, product.categoryName].some(value => value.toLowerCase().includes(query));
    });
  }, [report, search, productFilter]);

  const exportCsv = () => {
    if (!report) return;
    const rows = [
      ['Product', 'SKU', 'Brand', 'Category', 'Units', 'Units/Day', 'Revenue', 'Revenue Share %', 'Gross Profit', 'Margin %', 'Orders', 'Average Unit Price', 'Current Stock', 'Low Stock Threshold', 'Stock Cover Days'],
      ...report.products.map(product => [product.name, product.sku || '', product.brandName, product.categoryName, product.units, product.unitsPerDay, product.revenue, product.revenueShare, product.grossProfit, product.margin, product.orders, product.avgUnitPrice, product.currentStock, product.lowStockThreshold, product.stockCoverDays ?? '']),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${report.entity.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${timeRange}-rollup.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !report) return <div className="h-72 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/40" />;
  if (!report || !analytics) return <div className="rounded-3xl border border-rose-900/40 bg-rose-950/20 p-8 text-center font-bold text-rose-300">Unable to load this category report.</div>;

  const topBrand = report.brands.find(row => row.revenue > 0);
  const topChild = report.children.find(row => row.revenue > 0);
  const metricUnit = metric === 'units' ? 'count' : 'GBP';

  return (
    <div className="space-y-8 pb-24 fold-inner:pb-10">
      <section className="rounded-[2rem] border border-slate-800 bg-gradient-to-br from-slate-900/90 to-slate-950/60 p-5 shadow-2xl lg:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <Link href="/inventory/categories" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white">←</Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-2xl font-black tracking-tight text-white md:text-4xl">{report.entity.name}</h1>
                <span className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[9px] font-black uppercase text-cyan-300">Full tree rollup</span>
                <span className={`rounded-lg border px-2 py-1 text-[9px] font-black uppercase ${report.entity.isActive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800 text-slate-400'}`}>{report.entity.isActive ? 'Active' : 'Inactive'}</span>
              </div>
              <p className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-slate-500">Category intelligence · all descendant categories, brands, products and stores</p>
              {report.entity.description && <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-400">{report.entity.description}</p>}
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StoreScopeSelector value={storeId} onStoreChange={next => { setStoreId(next); syncUrl(next, timeRange); }} />
            <div className="flex max-w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70 p-1 no-scrollbar">{RANGES.map(range => <button key={range.id} type="button" onClick={() => { setTimeRange(range.id); syncUrl(storeId, range.id); }} className={`shrink-0 rounded-lg px-3 py-2 text-[10px] font-black uppercase ${timeRange === range.id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>{range.label}</button>)}</div>
            <button type="button" onClick={() => window.print()} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-[10px] font-black uppercase text-slate-300">Print</button>
            <button type="button" onClick={exportCsv} className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[10px] font-black uppercase text-cyan-300">Export CSV</button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-bold text-slate-500">
          <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-emerald-300">Paid orders only</span>
          <span className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1">{report.period.days} calendar days</span>
          <span className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1">{report.period.bucket.toUpperCase()} trend buckets</span>
          <span className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1">{report.metrics.childCount} subcategory groups</span>
          <span className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1">{report.metrics.storeCount} selling stores</span>
          {loading && <span className="animate-pulse text-cyan-400">Refreshing…</span>}
        </div>
      </section>

      <Section title="Executive snapshot" subtitle="Full commercial view across this category and every descendant category. Values come from paid, non-cancelled order items in the selected store scope and time period.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Revenue" value={gbp(report.metrics.revenue)} hint={`${gbp(report.metrics.revenuePerDay)} per day`} tone="text-emerald-400" />
          <Kpi label="Units sold" value={integer(report.metrics.units)} hint={`${report.metrics.sellingProducts} selling SKUs`} tone="text-blue-400" />
          <Kpi label="Orders" value={integer(report.metrics.orderCount)} hint={`${gbp(report.metrics.revenuePerOrder)} revenue / order`} tone="text-violet-300" />
          <Kpi label="Gross profit" value={gbp(report.metrics.grossProfit)} hint={`${percent(report.metrics.margin)} gross margin`} tone="text-amber-300" />
          <Kpi label="Average selling price" value={gbp(report.metrics.avgUnitPrice)} hint="Revenue ÷ units" tone="text-cyan-300" />
          <Kpi label="Current stock" value={integer(report.metrics.currentStock)} hint="Active stock-tracked SKUs" />
          <Kpi label="Catalog SKUs" value={integer(report.metrics.totalProducts)} hint={`${report.metrics.activeProducts} active`} />
          <Kpi label="Subcategories selling" value={`${report.metrics.sellingChildCount}/${report.metrics.childCount}`} hint="Immediate descendant groups with paid sales" />
          <Kpi label="Brands selling" value={integer(report.metrics.brandCount)} hint={topBrand ? `${topBrand.name} leads` : 'No paid brand sales'} />
          <Kpi label="Low-stock SKUs" value={integer(report.metrics.lowStockProducts)} hint={`${percent(report.metrics.stockRiskRate)} total stock risk`} tone={report.metrics.lowStockProducts ? 'text-amber-300' : 'text-emerald-300'} />
          <Kpi label="Out-of-stock SKUs" value={integer(report.metrics.outOfStockProducts)} hint="Current inventory position" tone={report.metrics.outOfStockProducts ? 'text-rose-300' : 'text-emerald-300'} />
          <Kpi label="Zero-sale SKUs" value={integer(analytics.zero.length)} hint={`${percent(divide(analytics.zero.length, Math.max(report.metrics.activeProducts, 1)) * 100)} of active catalog`} tone={analytics.zero.length ? 'text-orange-300' : 'text-emerald-300'} />
        </div>
      </Section>

      <Section title="Performance DNA" subtitle="Indexes reveal concentration, range productivity and inventory risk instead of relying only on topline sales.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <IndexCard label="Sales breadth" value={report.metrics.salesBreadth} detail="Active SKUs that generated paid sales." />
          <IndexCard label="Stock risk" value={report.metrics.stockRiskRate} detail="Tracked SKUs low or out of stock." inverse />
          <IndexCard label="Top brand dependence" value={topBrand?.share || 0} detail="Revenue share from the largest selling brand." inverse />
          <IndexCard label="Top subcategory dependence" value={topChild?.share || 0} detail="Revenue share from the strongest immediate subcategory." inverse />
          <IndexCard label="Top 3 SKU concentration" value={analytics.top3Share} detail="Revenue share generated by the three highest-revenue products." inverse />
          <IndexCard label="Top 5 SKU concentration" value={analytics.top5Share} detail="Revenue share generated by the five highest-revenue products." inverse />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Brand concentration index" value={decimal(analytics.concentration)} hint="HHI-style mix index" />
          <Kpi label="80% revenue reached by" value={`${analytics.paretoCount} SKU${analytics.paretoCount === 1 ? '' : 's'}`} hint={`${report.metrics.sellingProducts} selling SKUs total`} />
          <Kpi label="Median selling-SKU revenue" value={gbp(analytics.medianRevenue)} hint="Middle selling product by period revenue" />
          <Kpi label="Median selling-SKU margin" value={percent(analytics.medianMargin)} hint="Middle selling product by gross margin" />
        </div>
      </Section>

      {report.previous && report.growth && (
        <Section title="Period-over-period movement" subtitle="Selected period versus the immediately preceding period of the same length.">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { label: 'Revenue', now: gbp(report.metrics.revenue), previous: gbp(report.previous.revenue), growth: report.growth.revenue, suffix: '%' },
              { label: 'Units', now: integer(report.metrics.units), previous: integer(report.previous.units), growth: report.growth.units, suffix: '%' },
              { label: 'Orders', now: integer(report.metrics.orderCount), previous: integer(report.previous.orderCount), growth: report.growth.orderCount, suffix: '%' },
              { label: 'Gross profit', now: gbp(report.metrics.grossProfit), previous: gbp(report.previous.grossProfit), growth: report.growth.grossProfit, suffix: '%' },
              { label: 'Margin', now: percent(report.metrics.margin), previous: percent(report.previous.margin), growth: report.growth.marginPoints, suffix: ' pp' },
            ].map(item => <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{item.label}</p><p className="mt-1 text-xl font-black text-white">{item.now}</p><p className="mt-1 text-[10px] text-slate-600">Previous {item.previous}</p><div className="mt-2"><Growth value={item.growth} suffix={item.suffix} /></div></div>)}
          </div>
        </Section>
      )}

      <Section title="Sales trajectory" subtitle="Total category-tree performance and the strongest subcategories over time. Switch between revenue, units and gross profit." action={<div className="flex rounded-xl border border-slate-800 bg-slate-950 p-1">{(['revenue', 'units', 'profit'] as MetricKey[]).map(item => <button key={item} type="button" onClick={() => setMetric(item)} className={`rounded-lg px-3 py-1.5 text-[9px] font-black uppercase ${metric === item ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>{item}</button>)}</div>}>
        <div className="grid gap-4 xl:grid-cols-2">
          <TimeSeriesChart series={mainSeries} timeRange={timeRange} title={`${report.entity.name} ${metric} trend`} subtitle="All descendant categories combined" unit={metricUnit} compact />
          <TimeSeriesChart series={childSeries} timeRange={timeRange} title={`Subcategory ${metric} over time`} subtitle="Top immediate subcategories plotted independently" unit={metricUnit} compact />
        </div>
      </Section>

      <Section title="Subcategory intelligence" subtitle="See exactly which parts of this category tree create sales, profit and stock exposure. Tap a subcategory to drill into its own full report.">
        <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
          <Ranking title={`Subcategory ${metric} ranking`} rows={report.children} metric={metric} />
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/45">
            <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs"><thead className="bg-slate-950/65 text-[9px] uppercase tracking-widest text-slate-500"><tr><th className="px-4 py-3 text-left">Subcategory</th><th className="px-3 py-3 text-right">Revenue</th><th className="px-3 py-3 text-right">Units</th><th className="px-3 py-3 text-right">Orders</th><th className="px-3 py-3 text-right">Profit</th><th className="px-3 py-3 text-right">Margin</th><th className="px-3 py-3 text-right">Share</th><th className="px-3 py-3 text-right">Active SKUs</th><th className="px-4 py-3 text-right">Stock</th></tr></thead><tbody className="divide-y divide-slate-800/60">{report.children.map(row => <tr key={`${row.id}-${row.direct ? 'direct' : 'child'}`} className="hover:bg-slate-800/25"><td className="px-4 py-3">{row.direct ? <span className="font-bold text-slate-300">{row.name}</span> : <Link href={`/inventory/categories/${row.id}?storeId=${storeId || 'all'}&timeRange=${timeRange}`} className="font-bold text-slate-200 hover:text-cyan-300">{row.name}</Link>}<div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-500" style={{ width: `${clamp(row.share)}%` }} /></div></td><td className="px-3 py-3 text-right font-black text-emerald-400">{gbp(row.revenue)}</td><td className="px-3 py-3 text-right">{integer(row.units)}</td><td className="px-3 py-3 text-right">{integer(row.orders)}</td><td className="px-3 py-3 text-right font-bold text-amber-300">{gbp(row.grossProfit)}</td><td className="px-3 py-3 text-right">{percent(row.margin)}</td><td className="px-3 py-3 text-right font-black text-cyan-300">{percent(row.share)}</td><td className="px-3 py-3 text-right">{row.activeProducts}</td><td className="px-4 py-3 text-right">{integer(row.currentStock)}</td></tr>)}</tbody></table></div>
          </div>
        </div>
      </Section>

      <Section title="Brand intelligence" subtitle={`Brand-level sales inside ${report.entity.name}. This answers which brands actually sell inside the category tree and how the mix changes over time.`}>
        <div className="grid gap-4 xl:grid-cols-2">
          <TimeSeriesChart series={brandSeries} timeRange={timeRange} title={`Brand ${metric} over time`} subtitle="Top selling brands plotted independently" unit={metricUnit} compact />
          <Ranking title={`Brand ${metric} ranking`} rows={report.brands.filter(row => row.revenue > 0)} metric={metric} />
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/45"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-xs"><thead className="bg-slate-950/65 text-[9px] uppercase tracking-widest text-slate-500"><tr><th className="px-4 py-3 text-left">Brand</th><th className="px-3 py-3 text-right">Revenue</th><th className="px-3 py-3 text-right">Units</th><th className="px-3 py-3 text-right">Orders</th><th className="px-3 py-3 text-right">Profit</th><th className="px-3 py-3 text-right">Margin</th><th className="px-3 py-3 text-right">Share</th><th className="px-3 py-3 text-right">Active SKUs</th><th className="px-4 py-3 text-right">Stock</th></tr></thead><tbody className="divide-y divide-slate-800/60">{report.brands.map(row => <tr key={row.id} className="hover:bg-slate-800/25"><td className="px-4 py-3">{row.id === 'unassigned' ? <span className="font-bold text-slate-400">{row.name}</span> : <Link href={`/inventory/brands/${row.id}?storeId=${storeId || 'all'}&timeRange=${timeRange}`} className="font-bold text-slate-200 hover:text-cyan-300">{row.name}</Link>}</td><td className="px-3 py-3 text-right font-black text-emerald-400">{gbp(row.revenue)}</td><td className="px-3 py-3 text-right">{integer(row.units)}</td><td className="px-3 py-3 text-right">{integer(row.orders)}</td><td className="px-3 py-3 text-right font-bold text-amber-300">{gbp(row.grossProfit)}</td><td className="px-3 py-3 text-right">{percent(row.margin)}</td><td className="px-3 py-3 text-right font-black text-cyan-300">{percent(row.share)}</td><td className="px-3 py-3 text-right">{row.activeProducts}</td><td className="px-4 py-3 text-right">{integer(row.currentStock)}</td></tr>)}</tbody></table></div></div>
      </Section>

      <Section title="Product standouts" subtitle="Named SKU leaders make the report actionable without digging through the full ledger first.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Revenue leader', product: analytics.revenueLeader, value: analytics.revenueLeader ? gbp(analytics.revenueLeader.revenue) : '—', hint: analytics.revenueLeader ? `${integer(analytics.revenueLeader.units)} units · ${percent(analytics.revenueLeader.revenueShare)} share` : '' },
            { label: 'Fastest velocity', product: analytics.fastest, value: analytics.fastest ? `${decimal(analytics.fastest.unitsPerDay, 2)} units/day` : '—', hint: analytics.fastest ? `${integer(analytics.fastest.units)} units in selected period` : '' },
            { label: 'Highest gross margin', product: analytics.marginLeader, value: analytics.marginLeader ? percent(analytics.marginLeader.margin) : '—', hint: analytics.marginLeader ? `${gbp(analytics.marginLeader.grossProfit)} gross profit` : '' },
            { label: 'Margin watch', product: analytics.marginWatch, value: analytics.marginWatch ? percent(analytics.marginWatch.margin) : '—', hint: analytics.marginWatch ? `${gbp(analytics.marginWatch.revenue)} revenue` : '' },
          ].map(card => <div key={card.label} className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{card.label}</p><p className="mt-2 break-words text-sm font-black text-white">{card.product?.name || 'No qualifying SKU'}</p><p className="mt-1 text-lg font-black text-cyan-300">{card.value}</p><p className="mt-1 text-[10px] text-slate-500">{card.hint}</p></div>)}
        </div>
      </Section>

      <Section title="Full product ledger" subtitle="Every product in this category tree, including zero-sale and stock-risk SKUs. Search or filter without changing the underlying report scope.">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search product, SKU, brand or category…" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500" />
            <div className="flex max-w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-1 no-scrollbar">{(['all', 'sold', 'zero', 'low', 'out'] as ProductFilter[]).map(filter => <button key={filter} type="button" onClick={() => setProductFilter(filter)} className={`shrink-0 rounded-lg px-3 py-2 text-[9px] font-black uppercase ${productFilter === filter ? 'bg-cyan-600 text-white' : 'text-slate-500'}`}>{filter}</button>)}</div>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/45"><div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-xs"><thead className="bg-slate-950/65 text-[9px] uppercase tracking-widest text-slate-500"><tr><th className="px-4 py-3 text-left">Product</th><th className="px-3 py-3 text-left">Brand</th><th className="px-3 py-3 text-left">Category</th><th className="px-3 py-3 text-right">Units</th><th className="px-3 py-3 text-right">Units/day</th><th className="px-3 py-3 text-right">Revenue</th><th className="px-3 py-3 text-right">Share</th><th className="px-3 py-3 text-right">Profit</th><th className="px-3 py-3 text-right">Margin</th><th className="px-3 py-3 text-right">Orders</th><th className="px-3 py-3 text-right">Stock</th><th className="px-4 py-3 text-right">Cover</th></tr></thead><tbody className="divide-y divide-slate-800/60">{filteredProducts.map(product => <tr key={product.id} className="hover:bg-slate-800/25"><td className="max-w-[300px] px-4 py-3"><p className="break-words font-bold text-slate-200">{product.name}</p><p className="mt-1 font-mono text-[9px] text-slate-600">{product.sku || 'No SKU'} · {product.isActive ? 'Active' : 'Inactive'}</p></td><td className="px-3 py-3 text-slate-400">{product.brandName}</td><td className="px-3 py-3 text-slate-400">{product.categoryName}</td><td className="px-3 py-3 text-right font-bold">{integer(product.units)}</td><td className="px-3 py-3 text-right">{decimal(product.unitsPerDay, 2)}</td><td className="px-3 py-3 text-right font-black text-emerald-400">{gbp(product.revenue)}</td><td className="px-3 py-3 text-right text-cyan-300">{percent(product.revenueShare)}</td><td className="px-3 py-3 text-right font-bold text-amber-300">{gbp(product.grossProfit)}</td><td className={`px-3 py-3 text-right font-bold ${product.revenue > 0 && product.margin < 10 ? 'text-rose-300' : 'text-slate-300'}`}>{percent(product.margin)}</td><td className="px-3 py-3 text-right">{integer(product.orders)}</td><td className={`px-3 py-3 text-right font-black ${product.currentStock <= 0 ? 'text-rose-300' : product.currentStock <= product.lowStockThreshold ? 'text-amber-300' : 'text-slate-200'}`}>{integer(product.currentStock)}</td><td className="px-4 py-3 text-right">{product.stockCoverDays === null ? '—' : `${decimal(product.stockCoverDays)}d`}</td></tr>)}</tbody></table></div>{!filteredProducts.length && <p className="p-8 text-center text-sm text-slate-500">No products match this filter.</p>}</div>
      </Section>

      <Section title="Store network performance" subtitle="Where this category tree actually sells across connected stores, with revenue share, margin and order contribution.">
        <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4"><div className="space-y-4">{report.stores.map((store, index) => <div key={store.id}><div className="mb-1 flex items-start justify-between gap-3 text-xs"><span className="font-bold text-slate-300">{store.name}</span><span className="font-black text-white">{percent(store.share)}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full" style={{ width: `${clamp(store.share)}%`, background: PALETTE[index % PALETTE.length] }} /></div><div className="mt-1 flex justify-between text-[9px] text-slate-600"><span>{gbp(store.revenue)} · {integer(store.units)} units</span><span>{percent(store.margin)} margin</span></div></div>)}{!report.stores.length && <p className="py-8 text-center text-slate-500">No store sales in this period.</p>}</div></div>
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/45"><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-xs"><thead className="bg-slate-950/65 text-[9px] uppercase tracking-widest text-slate-500"><tr><th className="px-4 py-3 text-left">Store</th><th className="px-3 py-3 text-right">Revenue</th><th className="px-3 py-3 text-right">Units</th><th className="px-3 py-3 text-right">Orders</th><th className="px-3 py-3 text-right">Profit</th><th className="px-3 py-3 text-right">Margin</th><th className="px-4 py-3 text-right">Share</th></tr></thead><tbody className="divide-y divide-slate-800/60">{report.stores.map(store => <tr key={store.id}><td className="px-4 py-3 font-bold text-slate-200">{store.name}</td><td className="px-3 py-3 text-right font-black text-emerald-400">{gbp(store.revenue)}</td><td className="px-3 py-3 text-right">{integer(store.units)}</td><td className="px-3 py-3 text-right">{integer(store.orders)}</td><td className="px-3 py-3 text-right text-amber-300">{gbp(store.grossProfit)}</td><td className="px-3 py-3 text-right">{percent(store.margin)}</td><td className="px-4 py-3 text-right font-black text-cyan-300">{percent(store.share)}</td></tr>)}</tbody></table></div></div>
        </div>
      </Section>
    </div>
  );
}

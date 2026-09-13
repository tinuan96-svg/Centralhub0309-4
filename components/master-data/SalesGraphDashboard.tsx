'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import StoreScopeSelector from '@/components/StoreScopeSelector';
import TimeSeriesChart, { type ChartSeries } from '@/components/TimeSeriesChart';
import {
  SalesGraphReportService,
  type SalesGraphGroup,
  type SalesGraphReport,
  type SalesGraphTimeRange,
} from '@/lib/services/salesGraphReportService';

type Focus = 'category' | 'brand';
type Metric = 'revenue' | 'units' | 'profit';

const PALETTE = ['#38bdf8', '#34d399', '#f59e0b', '#a78bfa', '#fb7185', '#22d3ee', '#84cc16', '#f97316', '#60a5fa', '#f472b6', '#2dd4bf', '#facc15'];
const RANGES: Array<{ id: SalesGraphTimeRange; label: string }> = [
  { id: '7days', label: '7D' },
  { id: '30days', label: '30D' },
  { id: '90days', label: '90D' },
  { id: '6months', label: '6M' },
  { id: '12months', label: '12M' },
  { id: 'all', label: 'All' },
];

const gbp = (value: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(Number(value || 0));
const integer = (value: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(Number(value || 0));
const percent = (value: number) => `${Number(value || 0).toFixed(1)}%`;
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function MetricCard({ label, value, detail, tone = 'text-white' }: { label: string; value: string; detail?: string; tone?: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4"><p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p><p className={`mt-2 text-xl font-black lg:text-2xl ${tone}`}>{value}</p>{detail && <p className="mt-1 text-[10px] text-slate-500">{detail}</p>}</div>;
}

function seriesFrom(groups: SalesGraphGroup[], metric: Metric, limit = 12): ChartSeries[] {
  return groups.filter(group => group.revenue > 0).slice(0, limit).map((group, index) => ({
    id: group.id,
    name: group.name,
    color: PALETTE[index % PALETTE.length],
    data: group.trend.map(point => ({ date: point.date, value: point[metric] })),
  }));
}

function totalSeries(report: SalesGraphReport): ChartSeries[] {
  const dates = new Map<string, { revenue: number; profit: number }>();
  report.categories.forEach(group => group.trend.forEach(point => {
    const row = dates.get(point.date) || { revenue: 0, profit: 0 };
    row.revenue += point.revenue;
    row.profit += point.profit;
    dates.set(point.date, row);
  }));
  const rows = Array.from(dates.entries()).sort(([a], [b]) => a.localeCompare(b));
  return [
    { id: 'revenue', name: 'Revenue', color: '#38bdf8', data: rows.map(([date, row]) => ({ date, value: row.revenue })) },
    { id: 'profit', name: 'Gross profit', color: '#34d399', data: rows.map(([date, row]) => ({ date, value: row.profit })) },
  ];
}

function RankingBars({ title, rows, kind }: { title: string; rows: SalesGraphGroup[]; kind: Focus }) {
  const max = Math.max(1, ...rows.map(row => row.revenue));
  const route = kind === 'category' ? '/inventory/categories/' : '/inventory/brands/';
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
    <div className="flex items-end justify-between gap-3"><div><h3 className="text-xs font-black uppercase tracking-widest text-white">{title}</h3><p className="mt-1 text-[10px] text-slate-500">Revenue ranking with exact value, share and units.</p></div><span className="text-[9px] font-black uppercase text-slate-600">Top {Math.min(rows.length, 18)}</span></div>
    <div className="mt-4 max-h-[540px] space-y-3 overflow-y-auto pr-1">
      {rows.slice(0, 18).map((row, index) => {
        const content = <><div className="mb-1 flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-200"><span className="mr-2 text-slate-600">#{index + 1}</span>{row.name}</p><p className="mt-0.5 text-[9px] text-slate-600">{integer(row.units)} units · {row.orders} orders · {percent(row.margin)} margin</p></div><div className="shrink-0 text-right"><p className="text-xs font-black text-emerald-300">{gbp(row.revenue)}</p><p className="text-[9px] font-black text-cyan-300">{percent(row.share)}</p></div></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.max(1.5, (row.revenue / max) * 100)}%` }} /></div></>;
        return uuid(row.id) ? <Link key={row.id} href={`${route}${row.id}`} className="block rounded-xl p-2 hover:bg-slate-800/30">{content}</Link> : <div key={row.id} className="rounded-xl p-2">{content}</div>;
      })}
      {!rows.length && <p className="py-10 text-center text-xs text-slate-600">No paid sales in this period.</p>}
    </div>
  </div>;
}

function MixMatrix({ report }: { report: SalesGraphReport }) {
  const topCategories = report.categories.filter(row => row.revenue > 0).slice(0, 9);
  const topBrands = report.brands.filter(row => row.revenue > 0).slice(0, 9);
  const brandIndex = new Map(topBrands.map((brand, index) => [brand.id, index]));
  const cellsByCategory = new Map<string, Map<string, number>>();
  report.matrix.forEach(cell => {
    if (!topCategories.some(category => category.id === cell.categoryId)) return;
    const map = cellsByCategory.get(cell.categoryId) || new Map<string, number>();
    map.set(cell.brandId, (map.get(cell.brandId) || 0) + cell.revenue);
    cellsByCategory.set(cell.categoryId, map);
  });

  return <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4 xl:col-span-2">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h3 className="text-xs font-black uppercase tracking-widest text-white">Brand × category sales mix</h3><p className="mt-1 text-[10px] text-slate-500">Each category bar is split by the brands generating its revenue. Hover/tap labels are backed by exact period sales.</p></div><div className="flex flex-wrap gap-x-3 gap-y-1">{topBrands.map((brand, index) => <span key={brand.id} className="flex items-center gap-1 text-[9px] font-bold text-slate-400"><span className="h-2 w-2 rounded-full" style={{ background: PALETTE[index % PALETTE.length] }} />{brand.name}</span>)}</div></div>
    <div className="mt-5 space-y-4">{topCategories.map(category => {
      const cells = cellsByCategory.get(category.id) || new Map<string, number>();
      const known = topBrands.reduce((sum, brand) => sum + (cells.get(brand.id) || 0), 0);
      const other = Math.max(0, category.revenue - known);
      return <div key={category.id}><div className="mb-1 flex items-center justify-between gap-3"><span className="truncate text-xs font-bold text-slate-200">{category.name}</span><span className="shrink-0 text-xs font-black text-emerald-300">{gbp(category.revenue)}</span></div><div className="flex h-5 overflow-hidden rounded-lg bg-slate-800">{topBrands.map((brand, index) => { const value = cells.get(brand.id) || 0; if (!value) return null; return <div key={brand.id} title={`${category.name} · ${brand.name}: ${gbp(value)}`} style={{ width: `${(value / category.revenue) * 100}%`, background: PALETTE[index % PALETTE.length] }} />; })}{other > 0 && <div title={`${category.name} · Other brands: ${gbp(other)}`} className="bg-slate-600" style={{ width: `${(other / category.revenue) * 100}%` }} />}</div></div>;
    })}{!topCategories.length && <p className="py-10 text-center text-xs text-slate-600">No sales mix available.</p>}</div>
  </div>;
}

export default function SalesGraphDashboard({ focus }: { focus: Focus }) {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<SalesGraphTimeRange>('30days');
  const [metric, setMetric] = useState<Metric>('revenue');
  const [report, setReport] = useState<SalesGraphReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    SalesGraphReportService.getReport({ storeId, timeRange })
      .then(data => { if (active) setReport(data); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Unable to load sales graphs'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [storeId, timeRange]);

  const primaryRows = report ? (focus === 'category' ? report.categories : report.brands) : [];
  const secondaryRows = report ? (focus === 'category' ? report.brands : report.categories) : [];
  const primaryName = focus === 'category' ? 'Category' : 'Brand';
  const secondaryName = focus === 'category' ? 'Brand' : 'Category';
  const primarySeries = useMemo(() => seriesFrom(primaryRows, metric), [primaryRows, metric]);
  const secondarySeries = useMemo(() => seriesFrom(secondaryRows, metric), [secondaryRows, metric]);
  const pulseSeries = useMemo(() => report ? totalSeries(report) : [], [report]);
  const topPrimary = primaryRows[0];
  const topSecondary = secondaryRows[0];
  const metricUnit = metric === 'units' ? 'count' : 'GBP';

  return <section className="space-y-5 rounded-3xl border border-cyan-500/15 bg-slate-950/35 p-4 shadow-2xl shadow-cyan-950/10 fold-inner:p-5 lg:p-6">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-cyan-300">Graph studio</span><span className="text-[9px] font-black uppercase tracking-widest text-slate-600">Paid sales only</span></div><h1 className="mt-2 text-2xl font-black tracking-tight text-white lg:text-3xl">{primaryName} sales — graphical intelligence</h1><p className="mt-1 max-w-4xl text-xs leading-relaxed text-slate-400">Visualise which {primaryName.toLowerCase()}s sell, which {secondaryName.toLowerCase()}s drive them, exact sales value, units, profit and how the mix changes over time.</p></div>
      <div className="flex min-w-0 flex-wrap items-center gap-3"><StoreScopeSelector value={storeId} onStoreChange={setStoreId} /><div className="flex max-w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80 p-1 no-scrollbar">{RANGES.map(range => <button type="button" key={range.id} onClick={() => setTimeRange(range.id)} className={`rounded-lg px-3 py-2 text-[10px] font-black ${timeRange === range.id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>{range.label}</button>)}</div></div>
    </div>

    {error && <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-xs font-bold text-rose-300">{error}</div>}
    {loading && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50" />)}</div>}

    {!loading && report && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Revenue" value={gbp(report.totals.revenue)} detail={`${report.totals.orders} paid orders`} tone="text-emerald-300" /><MetricCard label="Units sold" value={integer(report.totals.units)} detail={`${report.totals.categories} selling categories`} tone="text-blue-300" /><MetricCard label="Gross profit" value={gbp(report.totals.profit)} detail={`${percent(report.totals.margin)} gross margin`} tone="text-amber-300" /><MetricCard label="Selling brands" value={integer(report.totals.brands)} detail={topSecondary ? `Top ${secondaryName.toLowerCase()}: ${topSecondary.name}` : 'No sales'} tone="text-cyan-300" /><MetricCard label={`Top ${primaryName.toLowerCase()}`} value={topPrimary?.name || '—'} detail={topPrimary ? `${gbp(topPrimary.revenue)} · ${percent(topPrimary.share)} of sales` : 'No sales'} /><MetricCard label={`Top ${secondaryName.toLowerCase()}`} value={topSecondary?.name || '—'} detail={topSecondary ? `${gbp(topSecondary.revenue)} · ${percent(topSecondary.share)} of sales` : 'No sales'} /><MetricCard label={`${primaryName} concentration`} value={topPrimary ? percent(topPrimary.share) : '0.0%'} detail={`Revenue share held by #1 ${primaryName.toLowerCase()}`} /><MetricCard label={`${secondaryName} concentration`} value={topSecondary ? percent(topSecondary.share) : '0.0%'} detail={`Revenue share held by #1 ${secondaryName.toLowerCase()}`} /></div>

      <div className="grid gap-4 xl:grid-cols-2"><div className="xl:col-span-2"><TimeSeriesChart series={pulseSeries} timeRange={timeRange} title="Total sales and gross-profit trend" subtitle={`Full ${report.period.bucket}-bucket period pulse. Hover/drag to inspect exact values.`} unit="GBP" compact /></div></div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/35 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Graph measure</p><p className="mt-1 text-xs text-slate-400">Switch both contribution graphs together.</p></div><div className="flex rounded-xl border border-slate-800 bg-slate-950 p-1">{(['revenue', 'units', 'profit'] as Metric[]).map(item => <button type="button" key={item} onClick={() => setMetric(item)} className={`rounded-lg px-4 py-2 text-[10px] font-black uppercase ${metric === item ? 'bg-cyan-600 text-white' : 'text-slate-500'}`}>{item}</button>)}</div></div>

      <div className="grid gap-4 xl:grid-cols-2"><TimeSeriesChart series={primarySeries} timeRange={timeRange} title={`${primaryName} sales over time`} subtitle={`Every line is a named ${primaryName.toLowerCase()} contributor. Top contributors are shown with exact values available inside the graph.`} unit={metricUnit} compact /><TimeSeriesChart series={secondarySeries} timeRange={timeRange} title={`${secondaryName} sales over time`} subtitle={`Named ${secondaryName.toLowerCase()} contributors plotted over the same selected period for direct comparison.`} unit={metricUnit} compact /></div>

      <div className="grid gap-4 xl:grid-cols-2"><RankingBars title="Sales by category" rows={report.categories} kind="category" /><RankingBars title="Sales by brand" rows={report.brands} kind="brand" /><MixMatrix report={report} /></div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/35 px-4 py-3 text-[10px] leading-relaxed text-slate-500">Trend charts show the highest-revenue contributors to keep the graph readable; the ranked graphs below retain the wider selling set. Category reporting rolls child categories into their top-level category so the overview represents the commercial category structure rather than fragmented subcategory rows.</div>
    </>}
  </section>;
}

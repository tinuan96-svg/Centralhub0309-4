'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import StoreScopeSelector from '@/components/StoreScopeSelector';
import TimeSeriesChart, { ChartSeries } from '@/components/TimeSeriesChart';
import {
  MasterDataEntityReport as Report,
  MasterDataEntityType,
  MasterDataReportService,
  MasterDataTimeRange,
} from '@/lib/services/masterDataReportService';

const PALETTE = ['#38bdf8', '#34d399', '#f59e0b', '#a78bfa', '#fb7185', '#22d3ee', '#f472b6', '#84cc16'];
const RANGES: Array<{ id: MasterDataTimeRange; label: string }> = [
  { id: '7days', label: '7D' },
  { id: '30days', label: '30D' },
  { id: '90days', label: '90D' },
  { id: '6months', label: '6M' },
  { id: '12months', label: '12M' },
  { id: 'all', label: 'All' },
];

type Metric = 'revenue' | 'units' | 'profit';

type BreakdownRow = Report['breakdown'][number];
type ProductRow = Report['products'][number];

const gbp = (value: number) => new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 2,
}).format(Number(value || 0));

const integer = (value: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(Number(value || 0));
const decimal = (value: number, digits = 1) => Number(value || 0).toFixed(digits);
const percent = (value: number) => `${decimal(value)}%`;
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const divide = (a: number, b: number) => b ? a / b : 0;

function Section({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 px-1 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.16em] text-white">{title}</h2>
          {subtitle && <p className="mt-1 max-w-4xl text-xs leading-relaxed text-slate-500">{subtitle}</p>}
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

function Meter({ label, value, detail, invert = false }: { label: string; value: number; detail: string; invert?: boolean }) {
  const score = clamp(value);
  const healthy = invert ? score <= 20 : score >= 60;
  const warn = invert ? score <= 40 : score >= 35;
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

function GrowthBadge({ value, suffix = '%' }: { value: number | null | undefined; suffix?: string }) {
  if (value === null || value === undefined) return <span className="text-[10px] font-black uppercase text-violet-300">New / no baseline</span>;
  const positive = value > 0;
  const negative = value < 0;
  return <span className={`text-[10px] font-black ${positive ? 'text-emerald-400' : negative ? 'text-rose-400' : 'text-slate-400'}`}>{positive ? '▲' : negative ? '▼' : '•'} {Math.abs(value).toFixed(1)}{suffix}</span>;
}

function Donut({ rows, title }: { rows: BreakdownRow[]; title: string }) {
  const visible = rows.slice(0, 5);
  const used = visible.reduce((sum, row) => sum + row.share, 0);
  const segments = [...visible.map((row, i) => ({ name: row.name, share: row.share, color: PALETTE[i % PALETTE.length] }))];
  if (used < 99.95) segments.push({ name: 'Other', share: Math.max(0, 100 - used), color: '#475569' });
  let offset = 0;
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
      <h3 className="text-xs font-black uppercase tracking-widest text-white">{title}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-[170px_1fr] sm:items-center">
        <div className="relative mx-auto h-40 w-40">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-label={`${title} donut chart`}>
            <circle cx="60" cy="60" r="46" fill="none" stroke="#1e293b" strokeWidth="16" />
            {segments.map(segment => {
              const current = offset;
              offset += segment.share;
              return <circle key={segment.name} cx="60" cy="60" r="46" pathLength="100" fill="none" stroke={segment.color} strokeWidth="16" strokeDasharray={`${Math.max(0, segment.share)} ${Math.max(0, 100 - segment.share)}`} strokeDashoffset={-current} />;
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-black text-white">{rows.length}</span>
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">contributors</span>
          </div>
        </div>
        <div className="space-y-2">
          {segments.map((segment, index) => (
            <div key={`${segment.name}-${index}`} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: segment.color }} />
              <span className="min-w-0 flex-1 break-words text-slate-300">{segment.name}</span>
              <span className="font-black text-white">{percent(segment.share)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HorizontalRanking({ rows, metric, label }: { rows: BreakdownRow[]; metric: Metric; label: string }) {
  const value = (row: BreakdownRow) => metric === 'revenue' ? row.revenue : metric === 'units' ? row.units : row.grossProfit;
  const max = Math.max(1, ...rows.map(value));
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
      <h3 className="text-xs font-black uppercase tracking-widest text-white">{label} ranking</h3>
      <div className="mt-4 space-y-3">
        {rows.slice(0, 10).map((row, index) => (
          <div key={row.id}>
            <div className="mb-1 flex items-start justify-between gap-3 text-xs">
              <span className="min-w-0 break-words font-bold text-slate-300"><span className="mr-2 text-slate-600">#{index + 1}</span>{row.name}</span>
              <span className="shrink-0 font-black text-white">{metric === 'units' ? integer(value(row)) : gbp(value(row))}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${clamp(divide(value(row), max) * 100)}%` }} /></div>
          </div>
        ))}
        {!rows.length && <p className="py-8 text-center text-xs text-slate-500">No paid sales in this period.</p>}
      </div>
    </div>
  );
}

function Distribution({ title, rows, total }: { title: string; rows: Array<{ label: string; count: number; hint?: string }>; total: number }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
      <h3 className="text-xs font-black uppercase tracking-widest text-white">{title}</h3>
      <div className="mt-4 space-y-3">
        {rows.map(row => {
          const share = divide(row.count, Math.max(total, 1)) * 100;
          return (
            <div key={row.label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="text-slate-400">{row.label}</span><span className="font-black text-white">{row.count} <span className="font-medium text-slate-600">({percent(share)})</span></span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-violet-400" style={{ width: `${clamp(share)}%` }} /></div>
              {row.hint && <p className="mt-1 text-[9px] text-slate-600">{row.hint}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProductPortfolio({ products }: { products: ProductRow[] }) {
  const sold = products.filter(p => p.revenue > 0).slice(0, 16);
  const maxRevenue = Math.max(1, ...sold.map(p => p.revenue));
  const minMargin = Math.min(0, ...sold.map(p => p.margin));
  const maxMargin = Math.max(30, ...sold.map(p => p.margin));
  const marginRange = Math.max(1, maxMargin - minMargin);
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="text-xs font-black uppercase tracking-widest text-white">Product performance map</h3><p className="mt-1 text-[10px] text-slate-500">Horizontal = revenue, vertical = gross margin. Top 16 selling SKUs are plotted.</p></div>
        <div className="text-[9px] font-black uppercase text-slate-600">High margin ↑ · High revenue →</div>
      </div>
      <div className="relative mt-4 h-72 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70">
        <div className="absolute left-1/2 top-0 h-full w-px bg-slate-800" />
        <div className="absolute left-0 top-1/2 h-px w-full bg-slate-800" />
        <span className="absolute left-3 top-2 text-[9px] font-black uppercase text-slate-700">Margin builders</span>
        <span className="absolute right-3 top-2 text-[9px] font-black uppercase text-slate-700">Stars</span>
        <span className="absolute bottom-2 left-3 text-[9px] font-black uppercase text-slate-700">Low traction</span>
        <span className="absolute bottom-2 right-3 text-[9px] font-black uppercase text-slate-700">Volume / margin watch</span>
        {sold.map((product, index) => {
          const left = 5 + divide(product.revenue, maxRevenue) * 88;
          const bottom = 6 + divide(product.margin - minMargin, marginRange) * 86;
          return (
            <div key={product.id} className="group absolute -translate-x-1/2 translate-y-1/2" style={{ left: `${left}%`, bottom: `${bottom}%` }}>
              <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-950 shadow-lg" style={{ background: PALETTE[index % PALETTE.length] }} />
              <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 hidden w-48 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-950 p-2 text-[10px] shadow-2xl group-hover:block">
                <p className="break-words font-black text-white">{product.name}</p><p className="mt-1 text-slate-400">{gbp(product.revenue)} revenue · {percent(product.margin)} margin · {integer(product.units)} units</p>
              </div>
            </div>
          );
        })}
        {!sold.length && <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">No selling products to plot.</div>}
      </div>
    </div>
  );
}

export default function UltimateMasterDataReport({ entityType, entityId }: { entityType: MasterDataEntityType; entityId: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const initialStore = searchParams.get('storeId');
  const initialRange = (searchParams.get('timeRange') || '30days') as MasterDataTimeRange;
  const [storeId, setStoreId] = useState<string | null>(initialStore && initialStore !== 'all' ? initialStore : null);
  const [timeRange, setTimeRange] = useState<MasterDataTimeRange>(RANGES.some(r => r.id === initialRange) ? initialRange : '30days');
  const [metric, setMetric] = useState<Metric>('revenue');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'sold' | 'zero' | 'low' | 'out'>('all');

  useEffect(() => {
    let active = true;
    setLoading(true);
    MasterDataReportService.getReport(entityType, entityId, { storeId, timeRange })
      .then(data => { if (active) setReport(data); })
      .catch(() => { if (active) setReport(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [entityType, entityId, storeId, timeRange]);

  const syncUrl = (nextStore: string | null, nextRange: MasterDataTimeRange) => {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set('storeId', nextStore || 'all');
    qs.set('timeRange', nextRange);
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
  };

  const mainSeries = useMemo<ChartSeries[]>(() => {
    if (!report) return [];
    return [{ id: 'total', name: report.entity.name, color: '#38bdf8', data: report.trend.map(point => ({ date: point.date, value: metric === 'revenue' ? point.revenue : metric === 'units' ? point.units : point.profit })) }];
  }, [report, metric]);

  const breakdownSeries = useMemo<ChartSeries[]>(() => {
    if (!report) return [];
    return report.breakdownTrend.map((series, index) => ({ id: series.id, name: series.name, color: PALETTE[index % PALETTE.length], data: series.points.map(point => ({ date: point.date, value: metric === 'revenue' ? point.revenue : metric === 'units' ? point.units : point.profit })) }));
  }, [report, metric]);

  const analytics = useMemo(() => {
    if (!report) return null;
    const sold = report.products.filter(p => p.revenue > 0).sort((a, b) => b.revenue - a.revenue);
    const zero = report.products.filter(p => p.revenue <= 0);
    const low = report.products.filter(p => p.isActive && p.currentStock > 0 && p.currentStock <= p.lowStockThreshold);
    const out = report.products.filter(p => p.isActive && p.currentStock <= 0);
    const top3Share = sold.slice(0, 3).reduce((sum, p) => sum + p.revenueShare, 0);
    const top5Share = sold.slice(0, 5).reduce((sum, p) => sum + p.revenueShare, 0);
    const totalRevenue = Math.max(report.metrics.revenue, 0);
    let cumulative = 0;
    const abc = sold.map(product => {
      const before = cumulative;
      cumulative += product.revenueShare;
      const abcClass = before < 80 ? 'A' : before < 95 ? 'B' : 'C';
      return { ...product, abcClass, cumulativeShare: cumulative };
    });
    const paretoCount = abc.findIndex(row => row.cumulativeShare >= 80) + 1 || abc.length;
    const abcSummary = ['A', 'B', 'C'].map(letter => {
      const rows = abc.filter(row => row.abcClass === letter);
      return { label: letter, count: rows.length, revenue: rows.reduce((sum, row) => sum + row.revenue, 0), share: rows.reduce((sum, row) => sum + row.revenueShare, 0) };
    });
    const marginBuckets = [
      { label: 'Loss (<0%)', count: sold.filter(p => p.margin < 0).length },
      { label: '0–10%', count: sold.filter(p => p.margin >= 0 && p.margin < 10).length },
      { label: '10–20%', count: sold.filter(p => p.margin >= 10 && p.margin < 20).length },
      { label: '20–30%', count: sold.filter(p => p.margin >= 20 && p.margin < 30).length },
      { label: '30%+', count: sold.filter(p => p.margin >= 30).length },
    ];
    const velocity = (p: ProductRow) => divide(p.units, report.period.days);
    const velocityBuckets = [
      { label: 'No sales', count: zero.length },
      { label: '<0.1 unit/day', count: sold.filter(p => velocity(p) < 0.1).length },
      { label: '0.1–0.5/day', count: sold.filter(p => velocity(p) >= 0.1 && velocity(p) < 0.5).length },
      { label: '0.5–1/day', count: sold.filter(p => velocity(p) >= 0.5 && velocity(p) < 1).length },
      { label: '1+ unit/day', count: sold.filter(p => velocity(p) >= 1).length },
    ];
    const coverBuckets = [
      { label: 'Out of stock', count: out.length },
      { label: '<7 days cover', count: report.products.filter(p => p.stockCoverDays !== null && p.stockCoverDays >= 0 && p.stockCoverDays < 7).length },
      { label: '7–30 days', count: report.products.filter(p => p.stockCoverDays !== null && p.stockCoverDays >= 7 && p.stockCoverDays < 30).length },
      { label: '30–90 days', count: report.products.filter(p => p.stockCoverDays !== null && p.stockCoverDays >= 30 && p.stockCoverDays < 90).length },
      { label: '90+ days', count: report.products.filter(p => p.stockCoverDays !== null && p.stockCoverDays >= 90).length },
      { label: 'No velocity baseline', count: report.products.filter(p => p.stockCoverDays === null && p.currentStock > 0).length },
    ];
    const bestMargin = [...sold].sort((a, b) => b.margin - a.margin)[0] || null;
    const weakestMargin = [...sold].sort((a, b) => a.margin - b.margin)[0] || null;
    const fastest = [...sold].sort((a, b) => velocity(b) - velocity(a))[0] || null;
    const highestRevenue = sold[0] || null;
    const revenueMedian = sold.length ? [...sold].map(p => p.revenue).sort((a, b) => a - b)[Math.floor(sold.length / 2)] : 0;
    const marginMedian = sold.length ? [...sold].map(p => p.margin).sort((a, b) => a - b)[Math.floor(sold.length / 2)] : 0;
    return { sold, zero, low, out, top3Share, top5Share, totalRevenue, abc, abcSummary, paretoCount, marginBuckets, velocityBuckets, coverBuckets, velocity, bestMargin, weakestMargin, fastest, highestRevenue, revenueMedian, marginMedian };
  }, [report]);

  const filteredProducts = useMemo(() => {
    if (!report || !analytics) return [];
    const abcMap = new Map(analytics.abc.map(row => [row.id, row.abcClass]));
    const q = search.trim().toLowerCase();
    return report.products.filter(product => {
      if (ledgerFilter === 'sold' && product.revenue <= 0) return false;
      if (ledgerFilter === 'zero' && product.revenue > 0) return false;
      if (ledgerFilter === 'low' && !(product.currentStock > 0 && product.currentStock <= product.lowStockThreshold)) return false;
      if (ledgerFilter === 'out' && product.currentStock > 0) return false;
      if (!q) return true;
      return [product.name, product.sku || '', product.brandName, product.categoryName, abcMap.get(product.id) || ''].some(value => value.toLowerCase().includes(q));
    });
  }, [report, analytics, search, ledgerFilter]);

  const exportCsv = () => {
    if (!report || !analytics) return;
    const abcMap = new Map(analytics.abc.map(row => [row.id, row.abcClass]));
    const rows = [
      ['Product', 'SKU', 'Brand', 'Category', 'ABC Class', 'Units', 'Units/Day', 'Revenue', 'Revenue Share %', 'Gross Profit', 'Margin %', 'Orders', 'Avg Unit Price', 'Current Stock', 'Low Stock Threshold', 'Stock Cover Days'],
      ...report.products.map(p => [p.name, p.sku || '', p.brandName, p.categoryName, abcMap.get(p.id) || '', p.units, analytics.velocity(p), p.revenue, p.revenueShare, p.grossProfit, p.margin, p.orders, p.avgUnitPrice, p.currentStock, p.lowStockThreshold, p.stockCoverDays ?? '']),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${report.entity.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${timeRange}-full-report.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !report) return <div className="p-10 text-center text-xs font-black uppercase tracking-widest text-slate-500 animate-pulse">Building full-spectrum paid-sales report…</div>;
  if (!report || !analytics) return <div className="p-10 text-center font-bold text-rose-400">Unable to load this report.</div>;

  const breakdownLabel = entityType === 'category' ? 'Brand' : 'Category';
  const counterpart = entityType === 'category' ? 'brand' : 'category';
  const topContributor = report.breakdown[0];
  const topStore = report.stores[0];
  const periodLabel = timeRange === 'all' ? 'All paid-order history' : `${RANGES.find(r => r.id === timeRange)?.label || timeRange} selected period`;
  const abcMap = new Map(analytics.abc.map(row => [row.id, row.abcClass]));

  return (
    <div className="space-y-8 pb-20">
      <div className="rounded-[2rem] border border-slate-800 bg-gradient-to-br from-slate-900/90 to-slate-950/60 p-5 shadow-2xl lg:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <button type="button" onClick={() => router.back()} className="h-11 w-11 shrink-0 rounded-xl border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white">←</button>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 text-2xl font-black text-cyan-300">{report.entity.logoUrl ? <img src={report.entity.logoUrl} alt="" className="h-full w-full object-contain p-1" /> : report.entity.name.slice(0, 1).toUpperCase()}</div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h1 className="break-words text-2xl font-black tracking-tight text-white md:text-4xl">{report.entity.name}</h1><span className={`rounded-lg border px-2 py-1 text-[9px] font-black uppercase ${report.entity.isActive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800 text-slate-400'}`}>{report.entity.isActive ? 'Active' : 'Inactive'}</span></div>
              <p className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{entityType} intelligence · complete commercial report</p>
              {report.entity.description && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">{report.entity.description}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StoreScopeSelector value={storeId} onStoreChange={next => { setStoreId(next); syncUrl(next, timeRange); }} />
            <div className="flex max-w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70 p-1">{RANGES.map(range => <button key={range.id} type="button" onClick={() => { setTimeRange(range.id); syncUrl(storeId, range.id); }} className={`shrink-0 rounded-lg px-3 py-2 text-[10px] font-black uppercase ${timeRange === range.id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>{range.label}</button>)}</div>
            <button type="button" onClick={() => window.print()} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-[10px] font-black uppercase text-slate-300">Print</button>
            <button type="button" onClick={exportCsv} className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[10px] font-black uppercase text-cyan-300">Export full CSV</button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-bold text-slate-500"><span className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1">{periodLabel}</span><span className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-emerald-300">Paid orders only</span><span className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1">{report.period.bucket.toUpperCase()} trend buckets</span><span className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1">{report.metrics.storeCount} selling stores</span>{loading && <span className="animate-pulse text-cyan-400">Refreshing…</span>}</div>
      </div>

      <Section title="Executive snapshot" subtitle="Every headline value is shown without abbreviation, backed by paid order items for the selected store scope and period.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Revenue" value={gbp(report.metrics.revenue)} hint={`${gbp(report.metrics.revenuePerDay)} per calendar day`} tone="text-emerald-400" />
          <Kpi label="Units sold" value={integer(report.metrics.units)} hint={`${decimal(report.metrics.unitsPerOrder)} units per order`} tone="text-blue-400" />
          <Kpi label="Orders containing this" value={integer(report.metrics.orders)} hint={`${gbp(report.metrics.revenuePerOrder)} revenue per order`} tone="text-violet-300" />
          <Kpi label="Gross profit" value={gbp(report.metrics.grossProfit)} hint={`${percent(report.metrics.margin)} gross margin`} tone="text-amber-300" />
          <Kpi label="Average selling price" value={gbp(report.metrics.avgUnitPrice)} hint="Paid item revenue ÷ units" tone="text-cyan-300" />
          <Kpi label="Current stock units" value={integer(report.metrics.currentStock)} hint="Across active stock-tracked SKUs" />
          <Kpi label="Catalog SKUs" value={integer(report.metrics.totalProducts)} hint={`${report.metrics.activeProducts} active · ${report.metrics.sellingProducts} sold`} />
          <Kpi label={`${breakdownLabel}s selling`} value={integer(report.metrics.contributorCount)} hint={`${report.breakdown.length} contributors in paid sales`} />
          <Kpi label="Revenue / active SKU" value={gbp(report.metrics.revenuePerActiveSku)} hint="Catalog productivity" />
          <Kpi label="Low-stock SKUs" value={integer(report.metrics.lowStockProducts)} hint={`${percent(report.metrics.stockRiskRate)} total stock-risk rate`} tone={report.metrics.lowStockProducts ? 'text-amber-300' : 'text-emerald-300'} />
          <Kpi label="Out-of-stock SKUs" value={integer(report.metrics.outOfStockProducts)} hint={`${percent(report.metrics.stockoutRate)} stockout rate`} tone={report.metrics.outOfStockProducts ? 'text-rose-300' : 'text-emerald-300'} />
          <Kpi label="Zero-sale SKUs" value={integer(analytics.zero.length)} hint={`${percent(divide(analytics.zero.length, Math.max(report.metrics.activeProducts, 1)) * 100)} of catalog`} tone={analytics.zero.length ? 'text-orange-300' : 'text-emerald-300'} />
        </div>
      </Section>

      <Section title="Performance DNA" subtitle="Indexes compress the shape of the business into decision-ready measures. Higher is not always better: concentration and stock risk should be watched, while breadth should generally rise.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Meter label="Sales breadth" value={report.indices.salesBreadth} detail="Active SKUs that generated paid sales." />
          <Meter label="Stock risk" value={report.indices.stockRiskRate} detail="Active stock-tracked SKUs low or out of stock." invert />
          <Meter label={`Top ${breakdownLabel.toLowerCase()} dependence`} value={report.indices.topContributorShare} detail="Revenue share from the largest contributor." invert />
          <Meter label="Top 3 SKU concentration" value={analytics.top3Share} detail="Revenue share generated by the three highest-revenue products." invert />
          <Meter label="Top 5 SKU concentration" value={analytics.top5Share} detail="Revenue share generated by the five highest-revenue products." invert />
          <Meter label="Selling-SKU penetration" value={divide(report.metrics.sellingProducts, Math.max(report.metrics.totalProducts, 1)) * 100} detail="Share of the full catalog that sold during the period." />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Mix concentration index" value={decimal(report.indices.concentrationIndex)} hint="HHI-style index across contributors" />
          <Kpi label="80% revenue reached by" value={`${analytics.paretoCount} SKU${analytics.paretoCount === 1 ? '' : 's'}`} hint={`${report.metrics.sellingProducts} selling SKUs total`} />
          <Kpi label="Median selling-SKU revenue" value={gbp(analytics.revenueMedian)} hint="Middle product by period revenue" />
          <Kpi label="Median selling-SKU margin" value={percent(analytics.marginMedian)} hint="Middle product by gross margin" />
        </div>
      </Section>

      {report.growth && report.previous && <Section title="Period-over-period movement" subtitle="Current period versus the immediately preceding period of the same length."><div className="grid grid-cols-2 gap-3 md:grid-cols-5">{[
        { label: 'Revenue', now: gbp(report.metrics.revenue), previous: gbp(report.previous.revenue), growth: report.growth.revenue, suffix: '%' },
        { label: 'Units', now: integer(report.metrics.units), previous: integer(report.previous.units), growth: report.growth.units, suffix: '%' },
        { label: 'Orders', now: integer(report.metrics.orders), previous: integer(report.previous.orders), growth: report.growth.orders, suffix: '%' },
        { label: 'Gross profit', now: gbp(report.metrics.grossProfit), previous: gbp(report.previous.grossProfit), growth: report.growth.grossProfit, suffix: '%' },
        { label: 'Margin', now: percent(report.metrics.margin), previous: percent(report.previous.margin), growth: report.growth.marginPoints, suffix: ' pp' },
      ].map(item => <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{item.label}</p><p className="mt-1 text-xl font-black text-white">{item.now}</p><p className="mt-1 text-[10px] text-slate-600">Previous {item.previous}</p><div className="mt-2"><GrowthBadge value={item.growth} suffix={item.suffix} /></div></div>)}</div></Section>}

      <Section title="Sales trajectory" subtitle="Switch between revenue, units and gross profit. Exact values for every time bucket are available inside each chart." action={<div className="flex rounded-xl border border-slate-800 bg-slate-950 p-1">{(['revenue', 'units', 'profit'] as Metric[]).map(item => <button type="button" key={item} onClick={() => setMetric(item)} className={`rounded-lg px-3 py-1.5 text-[9px] font-black uppercase ${metric === item ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>{item}</button>)}</div>}>
        <div className="grid gap-4 xl:grid-cols-2"><TimeSeriesChart series={mainSeries} timeRange={timeRange} title={`${report.entity.name} ${metric} trend`} subtitle="Total selected entity performance" unit={metric === 'units' ? 'count' : 'GBP'} compact /><TimeSeriesChart series={breakdownSeries} timeRange={timeRange} title={`${breakdownLabel} contribution over time`} subtitle={`Top ${breakdownLabel.toLowerCase()} contributors plotted independently`} unit={metric === 'units' ? 'count' : 'GBP'} compact /></div>
      </Section>

      <Section title="Mix and contribution" subtitle={entityType === 'category' ? `See exactly which brands are driving ${report.entity.name}, both as a share-of-total view and as a ranked value view.` : `See exactly which categories are driving ${report.entity.name}, both as a share-of-total view and as a ranked value view.`}>
        <div className="grid gap-4 xl:grid-cols-3"><Donut rows={report.breakdown} title={`${breakdownLabel} revenue mix`} /><HorizontalRanking rows={report.breakdown} metric={metric} label={breakdownLabel} /><div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4"><h3 className="text-xs font-black uppercase tracking-widest text-white">Mix facts</h3><div className="mt-4 space-y-3 text-xs">{[
          ['Largest contributor', topContributor ? topContributor.name : '—', topContributor ? percent(topContributor.share) : '—'],
          ['Largest contributor revenue', topContributor ? gbp(topContributor.revenue) : '—', topContributor ? `${integer(topContributor.units)} units` : ''],
          ['Largest contributor profit', topContributor ? gbp(topContributor.grossProfit) : '—', topContributor ? `${percent(topContributor.margin)} margin` : ''],
          ['Contributors with sales', integer(report.breakdown.length), `${report.metrics.contributorCount} counted`],
          ['Mix concentration index', decimal(report.indices.concentrationIndex), 'Higher = more dependent'],
        ].map(row => <div key={row[0]} className="rounded-xl border border-slate-800 bg-slate-950/45 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-600">{row[0]}</p><div className="mt-1 flex items-end justify-between gap-3"><span className="break-words font-black text-white">{row[1]}</span><span className="text-right text-[10px] text-slate-500">{row[2]}</span></div></div>)}</div></div></div>
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/45"><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-950/65 text-[9px] uppercase tracking-widest text-slate-500"><tr><th className="px-4 py-3 text-left">{breakdownLabel}</th><th className="px-3 py-3 text-right">Revenue</th><th className="px-3 py-3 text-right">Units</th><th className="px-3 py-3 text-right">Orders</th><th className="px-3 py-3 text-right">Profit</th><th className="px-3 py-3 text-right">Margin</th><th className="px-3 py-3 text-right">Share</th><th className="px-3 py-3 text-right">Active SKUs</th><th className="px-4 py-3 text-right">Stock</th></tr></thead><tbody className="divide-y divide-slate-800/60">{report.breakdown.map(row => { const linkable = row.id !== 'unassigned' && row.id !== 'uncategorized'; return <tr key={row.id} className="hover:bg-slate-800/25"><td className="min-w-[220px] px-4 py-3">{linkable ? <Link href={`/inventory/${counterpart}s/${row.id}?storeId=${storeId || 'all'}&timeRange=${timeRange}`} className="break-words font-bold text-slate-200 hover:text-cyan-300">{row.name}</Link> : <span className="break-words font-bold text-slate-400">{row.name}</span>}<div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-500" style={{ width: `${clamp(row.share)}%` }} /></div></td><td className="px-3 py-3 text-right font-black text-emerald-400">{gbp(row.revenue)}</td><td className="px-3 py-3 text-right">{integer(row.units)}</td><td className="px-3 py-3 text-right">{integer(row.orders)}</td><td className="px-3 py-3 text-right font-bold text-amber-300">{gbp(row.grossProfit)}</td><td className="px-3 py-3 text-right">{percent(row.margin)}</td><td className="px-3 py-3 text-right font-black text-cyan-300">{percent(row.share)}</td><td className="px-3 py-3 text-right">{row.activeProducts}</td><td className="px-4 py-3 text-right">{integer(row.currentStock)}</td></tr>; })}</tbody></table></div></div>
      </Section>

      <Section title="Pareto and ABC revenue structure" subtitle="Products are classified from paid-sales revenue: A products carry the first ~80% of revenue, B the next ~15%, and C the remaining tail. This exposes where assortment attention matters most.">
        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4"><div className="space-y-3">{analytics.abc.slice(0, 15).map((row, index) => <div key={row.id}><div className="mb-1 grid grid-cols-[28px_1fr_auto_auto] items-center gap-2 text-xs"><span className={`flex h-6 w-6 items-center justify-center rounded-md font-black ${row.abcClass === 'A' ? 'bg-emerald-500/15 text-emerald-300' : row.abcClass === 'B' ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-700 text-slate-300'}`}>{row.abcClass}</span><span className="min-w-0 break-words font-bold text-slate-300">{row.name}</span><span className="font-black text-white">{gbp(row.revenue)}</span><span className="w-16 text-right text-[10px] text-cyan-300">Σ {percent(row.cumulativeShare)}</span></div><div className="ml-9 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-emerald-400" style={{ width: `${clamp(row.revenueShare)}%` }} /></div></div>)}{!analytics.abc.length && <p className="py-8 text-center text-slate-500">No sales to classify.</p>}</div></div>
          <div className="space-y-3">{analytics.abcSummary.map(row => <div key={row.label} className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4"><div className="flex items-center justify-between"><span className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg font-black ${row.label === 'A' ? 'bg-emerald-500/15 text-emerald-300' : row.label === 'B' ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-800 text-slate-300'}`}>{row.label}</span><div className="text-right"><p className="text-xl font-black text-white">{gbp(row.revenue)}</p><p className="text-[10px] text-slate-500">{row.count} SKUs · {percent(row.share)} revenue</p></div></div></div>)}<div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4"><p className="text-[9px] font-black uppercase tracking-widest text-cyan-300">Pareto point</p><p className="mt-1 text-2xl font-black text-white">{analytics.paretoCount} SKU{analytics.paretoCount === 1 ? '' : 's'}</p><p className="mt-1 text-xs text-slate-500">Number of top-selling products required to reach at least 80% of revenue.</p></div></div>
        </div>
      </Section>

      <Section title="Product portfolio and standout SKUs" subtitle="A second view of the same data: a revenue-vs-margin performance map plus named leaders and risk signals.">
        <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]"><ProductPortfolio products={analytics.sold} /><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">{[
          { label: 'Revenue leader', product: analytics.highestRevenue, value: analytics.highestRevenue ? gbp(analytics.highestRevenue.revenue) : '—', hint: analytics.highestRevenue ? `${integer(analytics.highestRevenue.units)} units · ${percent(analytics.highestRevenue.revenueShare)} share` : '' },
          { label: 'Fastest velocity', product: analytics.fastest, value: analytics.fastest ? `${decimal(analytics.velocity(analytics.fastest), 2)} units/day` : '—', hint: analytics.fastest ? `${integer(analytics.fastest.units)} units in selected period` : '' },
          { label: 'Highest gross margin', product: analytics.bestMargin, value: analytics.bestMargin ? percent(analytics.bestMargin.margin) : '—', hint: analytics.bestMargin ? `${gbp(analytics.bestMargin.grossProfit)} gross profit` : '' },
          { label: 'Margin watch', product: analytics.weakestMargin, value: analytics.weakestMargin ? percent(analytics.weakestMargin.margin) : '—', hint: analytics.weakestMargin ? `${gbp(analytics.weakestMargin.revenue)} revenue` : '' },
        ].map(card => <div key={card.label} className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{card.label}</p><p className="mt-2 break-words text-sm font-black text-white">{card.product?.name || 'No qualifying SKU'}</p><p className="mt-1 text-lg font-black text-cyan-300">{card.value}</p><p className="mt-1 text-[10px] text-slate-500">{card.hint}</p></div>)}</div></div>
      </Section>

      <Section title="Distribution lab" subtitle="Distribution views reveal whether performance is balanced or being hidden by averages.">
        <div className="grid gap-4 md:grid-cols-3"><Distribution title="Margin distribution" rows={analytics.marginBuckets} total={Math.max(analytics.sold.length, 1)} /><Distribution title="Sales velocity distribution" rows={analytics.velocityBuckets} total={Math.max(report.products.length, 1)} /><Distribution title="Stock-cover distribution" rows={analytics.coverBuckets} total={Math.max(report.products.length, 1)} /></div>
      </Section>

      <Section title="Store network performance" subtitle="See where this brand or category actually sells across the connected store network, with full values and share of entity revenue.">
        <div className="grid gap-4 xl:grid-cols-[1fr_1.5fr]"><div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4"><h3 className="text-xs font-black uppercase tracking-widest text-white">Store revenue share</h3><div className="mt-4 space-y-4">{report.stores.map((store, index) => <div key={store.id}><div className="mb-1 flex items-start justify-between gap-3 text-xs"><span className="break-words font-bold text-slate-300">{store.name}</span><span className="shrink-0 font-black text-white">{percent(store.share)}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full" style={{ width: `${clamp(store.share)}%`, background: PALETTE[index % PALETTE.length] }} /></div></div>)}{!report.stores.length && <p className="py-8 text-center text-slate-500">No store sales.</p>}</div>{topStore && <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-3"><p className="text-[9px] font-black uppercase text-slate-600">Top store</p><p className="mt-1 break-words font-black text-white">{topStore.name}</p><p className="mt-1 text-xs text-slate-500">{gbp(topStore.revenue)} · {integer(topStore.units)} units · {percent(topStore.share)} of revenue</p></div>}</div><div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/45"><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-950/65 text-[9px] uppercase tracking-widest text-slate-500"><tr><th className="px-4 py-3 text-left">Store</th><th className="px-3 py-3 text-right">Orders</th><th className="px-3 py-3 text-right">Units</th><th className="px-3 py-3 text-right">Revenue</th><th className="px-3 py-3 text-right">Profit</th><th className="px-3 py-3 text-right">Margin</th><th className="px-4 py-3 text-right">Revenue share</th></tr></thead><tbody className="divide-y divide-slate-800/60">{report.stores.map(store => <tr key={store.id} className="hover:bg-slate-800/25"><td className="min-w-[180px] break-words px-4 py-3 font-bold text-slate-200">{store.name}</td><td className="px-3 py-3 text-right">{store.orders}</td><td className="px-3 py-3 text-right">{integer(store.units)}</td><td className="px-3 py-3 text-right font-black text-emerald-400">{gbp(store.revenue)}</td><td className="px-3 py-3 text-right text-amber-300">{gbp(store.grossProfit)}</td><td className="px-3 py-3 text-right">{percent(store.margin)}</td><td className="px-4 py-3 text-right font-black text-cyan-300">{percent(store.share)}</td></tr>)}</tbody></table></div></div></div>
      </Section>

      <Section title="Inventory exposure" subtitle="Sales history and live stock are combined to highlight lost-sales exposure, replenishment pressure and dead-stock candidates.">
        <div className="grid gap-4 lg:grid-cols-3"><div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4"><div className="flex items-center justify-between"><h3 className="text-xs font-black uppercase tracking-widest text-rose-300">Out of stock</h3><span className="text-2xl font-black text-white">{analytics.out.length}</span></div><div className="mt-3 space-y-2">{analytics.out.slice(0, 8).map(p => <div key={p.id} className="rounded-lg bg-slate-950/45 p-2"><p className="break-words text-xs font-bold text-slate-300">{p.name}</p><p className="mt-1 text-[9px] text-slate-500">{gbp(p.revenue)} period revenue · {integer(p.units)} units sold</p></div>)}{!analytics.out.length && <p className="text-xs text-emerald-300">No active out-of-stock SKUs.</p>}</div></div><div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4"><div className="flex items-center justify-between"><h3 className="text-xs font-black uppercase tracking-widest text-amber-300">Low stock</h3><span className="text-2xl font-black text-white">{analytics.low.length}</span></div><div className="mt-3 space-y-2">{analytics.low.slice(0, 8).map(p => <div key={p.id} className="rounded-lg bg-slate-950/45 p-2"><p className="break-words text-xs font-bold text-slate-300">{p.name}</p><p className="mt-1 text-[9px] text-slate-500">{integer(p.currentStock)} stock · {p.stockCoverDays === null ? 'No cover baseline' : `${decimal(p.stockCoverDays, 0)} days cover`}</p></div>)}{!analytics.low.length && <p className="text-xs text-emerald-300">No active low-stock SKUs.</p>}</div></div><div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4"><div className="flex items-center justify-between"><h3 className="text-xs font-black uppercase tracking-widest text-orange-300">No sales in period</h3><span className="text-2xl font-black text-white">{analytics.zero.length}</span></div><div className="mt-3 space-y-2">{analytics.zero.slice(0, 8).map(p => <div key={p.id} className="rounded-lg bg-slate-950/45 p-2"><p className="break-words text-xs font-bold text-slate-300">{p.name}</p><p className="mt-1 text-[9px] text-slate-500">{integer(p.currentStock)} current stock · {p.isActive ? 'Active' : 'Inactive'}</p></div>)}{!analytics.zero.length && <p className="text-xs text-emerald-300">Every catalog SKU sold in this period.</p>}</div></div></div>
      </Section>

      <Section title="Complete product performance ledger" subtitle="Every catalog item is included, including non-sellers. Search and filter the ledger; export contains even more calculated fields.">
        <div className="overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-900/45 shadow-xl"><div className="flex flex-col gap-3 border-b border-slate-800 p-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-1.5">{(['all', 'sold', 'zero', 'low', 'out'] as const).map(item => <button key={item} type="button" onClick={() => setLedgerFilter(item)} className={`rounded-lg px-3 py-2 text-[9px] font-black uppercase ${ledgerFilter === item ? 'bg-blue-600 text-white' : 'border border-slate-800 bg-slate-950 text-slate-500'}`}>{item === 'zero' ? 'No sales' : item === 'out' ? 'Out of stock' : item}</button>)}</div><div className="flex items-center gap-2"><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search product, SKU, brand, category or ABC…" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-cyan-500 lg:w-80" /><span className="shrink-0 text-[10px] font-black text-slate-500">{filteredProducts.length} rows</span></div></div><div className="max-h-[780px] overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 z-10 bg-slate-950 text-[9px] uppercase tracking-widest text-slate-500"><tr><th className="px-4 py-3 text-left">Product</th><th className="px-3 py-3 text-center">ABC</th><th className="px-3 py-3 text-left">{entityType === 'category' ? 'Brand' : 'Category'}</th><th className="px-3 py-3 text-right">Units</th><th className="px-3 py-3 text-right">Units/day</th><th className="px-3 py-3 text-right">Revenue</th><th className="px-3 py-3 text-right">Share</th><th className="px-3 py-3 text-right">Profit</th><th className="px-3 py-3 text-right">Margin</th><th className="px-3 py-3 text-right">Orders</th><th className="px-3 py-3 text-right">Avg unit</th><th className="px-3 py-3 text-right">Stock</th><th className="px-4 py-3 text-right">Cover</th></tr></thead><tbody className="divide-y divide-slate-800/60">{filteredProducts.map(product => { const abc = abcMap.get(product.id); return <tr key={product.id} className={`${product.revenue === 0 ? 'opacity-65' : ''} hover:bg-slate-800/25`}><td className="min-w-[260px] px-4 py-3"><div className="flex items-start gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${product.isActive ? 'bg-emerald-400' : 'bg-slate-600'}`} /><div><p className="break-words font-bold text-slate-200">{product.name}</p><p className="mt-0.5 break-all font-mono text-[9px] text-slate-500">{product.sku || 'NO SKU'}</p></div></div></td><td className="px-3 py-3 text-center">{abc ? <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg font-black ${abc === 'A' ? 'bg-emerald-500/15 text-emerald-300' : abc === 'B' ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-800 text-slate-300'}`}>{abc}</span> : <span className="text-slate-700">—</span>}</td><td className="min-w-[160px] break-words px-3 py-3 text-slate-400">{entityType === 'category' ? product.brandName : product.categoryName}</td><td className="px-3 py-3 text-right font-bold">{integer(product.units)}</td><td className="px-3 py-3 text-right">{decimal(analytics.velocity(product), 2)}</td><td className="px-3 py-3 text-right font-black text-emerald-400">{gbp(product.revenue)}</td><td className="px-3 py-3 text-right font-bold text-cyan-300">{percent(product.revenueShare)}</td><td className="px-3 py-3 text-right font-bold text-amber-300">{gbp(product.grossProfit)}</td><td className={`px-3 py-3 text-right font-bold ${product.margin >= 20 ? 'text-cyan-300' : product.revenue > 0 ? 'text-orange-300' : 'text-slate-600'}`}>{percent(product.margin)}</td><td className="px-3 py-3 text-right">{product.orders}</td><td className="px-3 py-3 text-right">{gbp(product.avgUnitPrice)}</td><td className={`px-3 py-3 text-right font-black ${product.currentStock <= 0 ? 'text-rose-400' : product.currentStock <= product.lowStockThreshold ? 'text-amber-300' : 'text-slate-300'}`}>{integer(product.currentStock)}</td><td className="px-4 py-3 text-right text-slate-400">{product.stockCoverDays === null ? (product.units > 0 ? '—' : 'No sales') : `${decimal(product.stockCoverDays, 0)}d`}</td></tr>; })}{!filteredProducts.length && <tr><td colSpan={13} className="px-4 py-12 text-center text-slate-500">No products match this view.</td></tr>}</tbody></table></div></div>
      </Section>
    </div>
  );
}

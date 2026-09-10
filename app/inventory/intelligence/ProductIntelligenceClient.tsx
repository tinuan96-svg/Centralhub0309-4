'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Boxes, CircleAlert, LineChart, PackageSearch, TrendingUp } from 'lucide-react';
import StoreScopeSelector from '@/components/StoreScopeSelector';
import TimeSeriesChart from '@/components/TimeSeriesChart';
import { EmptyState, MetricBars, Panel } from '@/components/dashboard/Charts';
import { VisualMetric } from '@/components/dashboard/VisualMetric';
import ProductWorkspaceNav from '@/components/products/ProductWorkspaceNav';
import { IntelligenceService, ProductIntelligenceReport } from '@/lib/services/intelligenceService';
import { formatCurrency } from '@/lib/utils/currency';

type TimeRange = '7days' | '30days' | '90days' | '6months' | '12months' | 'all';

const ranges: TimeRange[] = ['7days', '30days', '90days', '6months', '12months', 'all'];
const colors = ['#67e8f9', '#a78bfa', '#6ee7b7', '#fbbf24', '#fb7185', '#60a5fa'];

function number(value: number) {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(value || 0);
}

function percent(value: number) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${Number(value || 0).toFixed(1)}%`;
}

function comparisonTone(value: number) {
  if (value > 0.5) return 'text-emerald-300';
  if (value < -0.5) return 'text-rose-300';
  return 'text-slate-300';
}

function DataQualityNotice({ report }: { report: ProductIntelligenceReport }) {
  const issues = [
    report.quality.unmappedItems ? `${report.quality.unmappedItems} sold item rows have no current product mapping` : null,
    report.quality.zeroCostItems ? `${report.quality.zeroCostItems} sold item rows have zero cost snapshots` : null,
    report.quality.productsWithoutBrand ? `${report.quality.productsWithoutBrand} sold products are missing brand mapping` : null,
    report.quality.productsWithoutCategory ? `${report.quality.productsWithoutCategory} sold products are missing category mapping` : null
  ].filter(Boolean);

  if (!issues.length) return null;

  return (
    <section className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 text-amber-300" size={20} />
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-amber-200">Sales data quality checks</h2>
            <p className="mt-1 text-sm text-amber-100/70">Figures use paid order items. These mapping gaps can affect brand, category and profit accuracy.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {issues.map(issue => (
            <span key={issue} className="rounded-lg border border-amber-400/20 bg-slate-950/30 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-100">
              {issue}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function ProductIntelligenceClient() {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('30days');
  const [report, setReport] = useState<ProductIntelligenceReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const { start, end } = IntelligenceService.getDateRange(timeRange);
      const data = await IntelligenceService.getProductIntelligence({ storeId: storeId || 'all', startDate: start, endDate: end });
      if (active) {
        setReport(data);
        setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [storeId, timeRange]);

  const revenueSeries = useMemo(() => report ? [
    { id: 'revenue', name: 'Revenue', color: '#67e8f9', data: report.current.daily.map(day => ({ date: day.date, value: day.revenue })) },
    { id: 'profit', name: 'Gross profit', color: '#6ee7b7', data: report.current.daily.map(day => ({ date: day.date, value: day.profit })) }
  ] : [], [report]);

  const riceSeries = useMemo(() => report ? report.current.riceBrandTrends.slice(0, 5).map((brand, index) => ({
    id: brand.id,
    name: brand.name,
    color: colors[index % colors.length],
    data: brand.trend.map(point => ({ date: point.date, value: point.revenue }))
  })) : [], [report]);

  const topProducts = report?.current.products.slice(0, 12) || [];
  const brandCategoryRows = report?.current.brandCategory.slice(0, 14) || [];

  return (
    <main className="mx-auto max-w-[1800px] space-y-6 p-6">
      <ProductWorkspaceNav />

      <section className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4 lg:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-cyan-300">Product intelligence</span>
              <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-300">Paid orders only</span>
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-white lg:text-3xl">Sales performance by item, brand and category</h1>
            <p className="mt-1 max-w-4xl text-sm text-slate-400">Item-level revenue, units, margin, brand-by-category performance, rice trends and Double Horse category breakdown using the existing CentralHub order item data.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StoreScopeSelector value={storeId} onStoreChange={setStoreId} />
            <div className="flex rounded-xl border border-slate-800 bg-slate-950/70 p-1">
              {ranges.map(range => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setTimeRange(range)}
                  className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wide ${timeRange === range ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {loading && !report ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50" />)}
        </div>
      ) : report ? (
        <section className="ch-model-shell ch-visual-console ch-rich-console space-y-6" data-appearance="dark">
          <DataQualityNotice report={report} />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Panel title="Product sales" subtitle="Paid item revenue">
              <div className="ch-visual-metrics">
                <VisualMetric label="Revenue" value={formatCurrency(report.current.metrics.revenue)} icon={<TrendingUp size={14} />} detail={`${percent(report.comparison.revenue)} vs previous period`} />
                <VisualMetric label="Gross profit" value={formatCurrency(report.current.metrics.grossProfit)} detail={`${percent(report.comparison.profit)} vs previous period`} />
              </div>
              <p className={`ch-model-meta mt-2 ${comparisonTone(report.comparison.margin)}`}>Margin movement: {percent(report.comparison.margin)} points</p>
            </Panel>

            <Panel title="Item velocity" subtitle="Units and paid orders">
              <div className="ch-visual-metrics">
                <VisualMetric label="Units sold" value={number(report.current.metrics.unitsSold)} icon={<Boxes size={14} />} detail={`${percent(report.comparison.units)} vs previous period`} />
                <VisualMetric label="Paid orders" value={number(report.current.metrics.orderCount)} detail={`${percent(report.comparison.orderCount)} vs previous period`} />
              </div>
            </Panel>

            <Panel title="Catalogue coverage" subtitle="Products that actually sold">
              <div className="ch-visual-metrics">
                <VisualMetric label="Sold SKUs" value={number(report.current.products.length)} icon={<PackageSearch size={14} />} />
                <VisualMetric label="Active stores" value={number(report.current.metrics.storeCount)} />
              </div>
            </Panel>

            <Panel title="Profitability index" subtitle="Current period">
              <div className="ch-visual-metrics">
                <VisualMetric label="Margin" value={`${report.current.metrics.margin.toFixed(1)}%`} icon={<BarChart3 size={14} />} />
                <VisualMetric label="Avg revenue/order" value={formatCurrency(report.current.metrics.orderCount ? report.current.metrics.revenue / report.current.metrics.orderCount : 0)} />
              </div>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.8fr)]">
            <TimeSeriesChart compact dense timeRange={timeRange} title="Product revenue and gross profit" subtitle="Daily paid item totals" series={revenueSeries} />
            <Panel title="Top categories" subtitle="Paid product sales by category">
              <MetricBars data={(report.current.categories || []).slice(0, 8).map((row, index) => ({ label: row.name, value: row.revenue, color: colors[index % colors.length] }))} format={formatCurrency} />
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Brand by category performance" subtitle="Which brand wins inside each category">
              {brandCategoryRows.length ? (
                <div className="overflow-x-auto">
                  <table className="ch-data-table">
                    <thead><tr><th>Brand</th><th>Category</th><th>Revenue</th><th>Units</th><th>Margin</th><th>Orders</th></tr></thead>
                    <tbody>
                      {brandCategoryRows.map(row => (
                        <tr key={`${row.brandId}-${row.categoryId}`}>
                          <td>{row.brandName}</td>
                          <td>{row.categoryName}</td>
                          <td>{formatCurrency(row.revenue)}</td>
                          <td>{number(row.units)}</td>
                          <td>{row.margin.toFixed(1)}%</td>
                          <td>{number(row.orderCount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState>No brand/category sales in this selection.</EmptyState>}
            </Panel>

            <Panel title="Double Horse across categories" subtitle="Category-level sales for Double Horse products">
              {report.current.doubleHorseCategories.length ? (
                <MetricBars data={report.current.doubleHorseCategories.slice(0, 10).map((row, index) => ({ label: row.name, value: row.revenue, color: colors[index % colors.length] }))} format={formatCurrency} />
              ) : <EmptyState>No Double Horse paid item sales in this selection.</EmptyState>}
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <TimeSeriesChart compact dense timeRange={timeRange} title="Rice brand trends" subtitle="Matta, Ponni, Palakkadan and rice-related products by brand" series={riceSeries} />
            <Panel title="Brand leaderboard" subtitle="Revenue, units and product margin">
              <MetricBars data={(report.current.brands || []).slice(0, 10).map((row, index) => ({ label: `${row.name} (${number(row.units)} units)`, value: row.revenue, color: colors[index % colors.length] }))} format={formatCurrency} />
            </Panel>
          </div>

          <Panel title="Item-level sales intelligence" subtitle="Top selling products with SKU, brand, category, stock and margin">
            {topProducts.length ? (
              <div className="overflow-x-auto">
                <table className="ch-data-table">
                  <thead><tr><th>Product</th><th>SKU</th><th>Brand</th><th>Category</th><th>Revenue</th><th>Units</th><th>Orders</th><th>Profit</th><th>Margin</th><th>Stock</th></tr></thead>
                  <tbody>
                    {topProducts.map(product => (
                      <tr key={product.id}>
                        <td><Link className="text-cyan-200 hover:text-white" href={`/inventory-management/stock/${product.id}`}>{product.name}</Link></td>
                        <td>{product.sku || '-'}</td>
                        <td>{product.brand_name || 'No Brand'}</td>
                        <td>{product.category_name || 'Uncategorized'}</td>
                        <td>{formatCurrency(product.revenue)}</td>
                        <td>{number(product.unitsSold)}</td>
                        <td>{number(product.orderCount)}</td>
                        <td>{formatCurrency(product.grossProfit)}</td>
                        <td>{product.margin.toFixed(1)}%</td>
                        <td>{number(product.stock)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState>No item-level sales for this selection.</EmptyState>}
          </Panel>
        </section>
      ) : (
        <section className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-6 text-rose-100">Unable to load product intelligence.</section>
      )}
    </main>
  );
}

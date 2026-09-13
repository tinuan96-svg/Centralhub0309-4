'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import StoreScopeSelector from '@/components/StoreScopeSelector';
import { categoryService, type Category } from '@/lib/services/categoryService';
import { ProductIntelligenceService } from '@/lib/services/productIntelligenceService';
import type { ProductIntelligenceReport, ProductPerformance } from '@/lib/services/intelligenceService';
import { supabase } from '@/lib/supabase';

type TimeRange = '7days' | '30days' | '90days' | '6months' | '12months' | 'all';

type CatalogProduct = {
  id: string;
  category_id: string | null;
  is_active: boolean | null;
  stock: number | null;
  low_stock_threshold: number | null;
  enable_stock_tracking: boolean | null;
};

const ranges: Array<{ id: TimeRange; label: string }> = [
  { id: '7days', label: '7D' },
  { id: '30days', label: '30D' },
  { id: '90days', label: '90D' },
  { id: '6months', label: '6M' },
  { id: '12months', label: '12M' },
  { id: 'all', label: 'All' },
];

const money = (value: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(Number(value || 0));
const integer = (value: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(Number(value || 0));
const pct = (value: number) => `${Number(value || 0).toFixed(1)}%`;

function sumProducts(rows: ProductPerformance[]) {
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const units = rows.reduce((sum, row) => sum + row.unitsSold, 0);
  const profit = rows.reduce((sum, row) => sum + row.grossProfit, 0);
  return { revenue, units, profit, margin: revenue > 0 ? (profit / revenue) * 100 : 0 };
}

function growth(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function Metric({ label, value, detail, tone = 'text-white' }: { label: string; value: string; detail?: string; tone?: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4"><p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p><p className={`mt-2 text-2xl font-black ${tone}`}>{value}</p>{detail && <p className="mt-1 text-[10px] text-slate-500">{detail}</p>}</div>;
}

export default function CategoryParentRollup({ entityId }: { entityId: string }) {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('30days');
  const [categories, setCategories] = useState<Category[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [report, setReport] = useState<ProductIntelligenceReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const { start, end } = ProductIntelligenceService.getDateRange(timeRange);
      const [cats, productRows, intel] = await Promise.all([
        categoryService.getAllCategories(),
        supabase.from('products').select('id,category_id,is_active,stock,low_stock_threshold,enable_stock_tracking').eq('is_deleted', false),
        ProductIntelligenceService.getProductIntelligence({ storeId: storeId || 'all', startDate: start, endDate: end }),
      ]);
      if (!active) return;
      setCategories(cats);
      setCatalog((productRows.data || []) as CatalogProduct[]);
      setReport(intel);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [entityId, storeId, timeRange]);

  const entity = categories.find(category => category.id === entityId) || null;

  const descendantIds = useMemo(() => {
    const result = new Set<string>([entityId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const category of categories) {
        if (category.parent_id && result.has(category.parent_id) && !result.has(category.id)) {
          result.add(category.id);
          changed = true;
        }
      }
    }
    return result;
  }, [categories, entityId]);

  const catalogIds = useMemo(() => new Set(catalog.filter(product => product.category_id && descendantIds.has(product.category_id)).map(product => product.id)), [catalog, descendantIds]);
  const currentProducts = useMemo(() => (report?.current.products || []).filter(product => catalogIds.has(product.id)), [report, catalogIds]);
  const previousProducts = useMemo(() => (report?.previous.products || []).filter(product => catalogIds.has(product.id)), [report, catalogIds]);
  const current = useMemo(() => sumProducts(currentProducts), [currentProducts]);
  const previous = useMemo(() => sumProducts(previousProducts), [previousProducts]);

  const activeCatalog = useMemo(() => catalog.filter(product => catalogIds.has(product.id) && product.is_active !== false), [catalog, catalogIds]);
  const stockTracked = useMemo(() => activeCatalog.filter(product => product.enable_stock_tracking !== false), [activeCatalog]);
  const stock = stockTracked.reduce((sum, product) => sum + Number(product.stock || 0), 0);
  const outOfStock = stockTracked.filter(product => Number(product.stock || 0) <= 0).length;
  const lowStock = stockTracked.filter(product => Number(product.stock || 0) > 0 && Number(product.stock || 0) <= Number(product.low_stock_threshold || 5)).length;
  const salesBreadth = activeCatalog.length ? (currentProducts.length / activeCatalog.length) * 100 : 0;
  const stockRisk = stockTracked.length ? ((outOfStock + lowStock) / stockTracked.length) * 100 : 0;

  const childRows = useMemo(() => {
    const children = categories.filter(category => category.parent_id === entityId);
    return children.map(category => {
      const childIds = new Set<string>([category.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const maybeChild of categories) {
          if (maybeChild.parent_id && childIds.has(maybeChild.parent_id) && !childIds.has(maybeChild.id)) { childIds.add(maybeChild.id); changed = true; }
        }
      }
      const ids = new Set(catalog.filter(product => product.category_id && childIds.has(product.category_id)).map(product => product.id));
      const sold = currentProducts.filter(product => ids.has(product.id));
      const metrics = sumProducts(sold);
      return { category, activeProducts: catalog.filter(product => ids.has(product.id) && product.is_active !== false).length, ...metrics };
    }).sort((a, b) => b.revenue - a.revenue || a.category.name.localeCompare(b.category.name));
  }, [categories, catalog, currentProducts, entityId]);

  const brandRows = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; units: number; profit: number }>();
    currentProducts.forEach(product => {
      const key = (product.brand_name || 'No Brand').trim().toLowerCase();
      const row = map.get(key) || { name: product.brand_name || 'No Brand', revenue: 0, units: 0, profit: 0 };
      row.revenue += product.revenue; row.units += product.unitsSold; row.profit += product.grossProfit; map.set(key, row);
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [currentProducts]);

  const topBrandShare = current.revenue > 0 ? ((brandRows[0]?.revenue || 0) / current.revenue) * 100 : 0;
  const top3Share = current.revenue > 0 ? (currentProducts.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 3).reduce((s, p) => s + p.revenue, 0) / current.revenue) * 100 : 0;
  const top5Share = current.revenue > 0 ? (currentProducts.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 5).reduce((s, p) => s + p.revenue, 0) / current.revenue) * 100 : 0;
  const concentration = current.revenue > 0 ? brandRows.reduce((sum, row) => sum + Math.pow(row.revenue / current.revenue, 2), 0) * 100 : 0;
  const sortedRevenue = currentProducts.map(product => product.revenue).sort((a, b) => a - b);
  const sortedMargin = currentProducts.map(product => product.margin).sort((a, b) => a - b);
  const median = (values: number[]) => values.length ? (values.length % 2 ? values[(values.length - 1) / 2] : (values[values.length / 2 - 1] + values[values.length / 2]) / 2) : 0;
  const revenue80Target = current.revenue * 0.8;
  let cumulative = 0; let sku80 = 0;
  for (const product of currentProducts.slice().sort((a, b) => b.revenue - a.revenue)) { cumulative += product.revenue; sku80 += 1; if (cumulative >= revenue80Target) break; }

  if (loading || !entity) return <div className="h-72 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/40" />;

  const revGrowth = growth(current.revenue, previous.revenue);
  const unitsGrowth = growth(current.units, previous.units);
  const profitGrowth = growth(current.profit, previous.profit);

  return (
    <div className="space-y-7 pb-24 fold-inner:pb-8">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/45 p-5 lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3"><Link href="/inventory/categories" className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300">←</Link><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-black text-white">{entity.name}</h1><span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[9px] font-black uppercase text-emerald-300">Rollup</span></div><p className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-slate-500">Category intelligence · includes all descendant categories</p></div></div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-3"><StoreScopeSelector value={storeId} onStoreChange={setStoreId} /><div className="flex max-w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 p-1 no-scrollbar">{ranges.map(range => <button key={range.id} onClick={() => setTimeRange(range.id)} className={`rounded-lg px-3 py-2 text-[10px] font-black ${timeRange === range.id ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>{range.label}</button>)}</div></div>
        </div>
      </section>

      <section><h2 className="mb-3 px-1 text-sm font-black uppercase tracking-[0.18em] text-white">Executive snapshot</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Metric label="Revenue" value={money(current.revenue)} tone="text-emerald-300" detail={`${currentProducts.length} selling SKUs`} /><Metric label="Units sold" value={integer(current.units)} tone="text-blue-300" detail={`${activeCatalog.length} active products in category tree`} /><Metric label="Gross profit" value={money(current.profit)} tone="text-amber-300" detail={`${pct(current.margin)} gross margin`} /><Metric label="Current stock" value={integer(stock)} tone="text-cyan-300" detail={`${lowStock} low · ${outOfStock} out of stock`} /></div></section>

      <section><h2 className="mb-3 px-1 text-sm font-black uppercase tracking-[0.18em] text-white">Performance DNA</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><Metric label="Sales breadth" value={pct(salesBreadth)} detail="Share of active SKUs generating paid sales" /><Metric label="Stock risk" value={pct(stockRisk)} tone={stockRisk > 30 ? 'text-rose-300' : 'text-emerald-300'} detail="Active tracked SKUs low or out of stock" /><Metric label="Top brand dependence" value={pct(topBrandShare)} detail="Revenue share from the largest brand" /><Metric label="Top 3 SKU concentration" value={pct(top3Share)} detail="Revenue share from three highest-revenue products" /><Metric label="Top 5 SKU concentration" value={pct(top5Share)} detail="Revenue share from five highest-revenue products" /><Metric label="Mix concentration index" value={concentration.toFixed(1)} detail="HHI-style index across brands" /><Metric label="80% revenue reached by" value={`${sku80} SKUs`} detail={`${currentProducts.length} selling SKUs total`} /><Metric label="Median selling-SKU revenue" value={money(median(sortedRevenue))} detail="Middle product by period revenue" /><Metric label="Median selling-SKU margin" value={pct(median(sortedMargin))} detail="Middle product by gross margin" /></div></section>

      <section><h2 className="mb-3 px-1 text-sm font-black uppercase tracking-[0.18em] text-white">Period-over-period movement</h2><div className="grid gap-3 md:grid-cols-3"><Metric label="Revenue" value={money(current.revenue)} detail={`Previous ${money(previous.revenue)} · ${revGrowth === null ? 'new/no baseline' : `${revGrowth >= 0 ? '+' : ''}${revGrowth.toFixed(1)}%`}`} /><Metric label="Units" value={integer(current.units)} detail={`Previous ${integer(previous.units)} · ${unitsGrowth === null ? 'new/no baseline' : `${unitsGrowth >= 0 ? '+' : ''}${unitsGrowth.toFixed(1)}%`}`} /><Metric label="Gross profit" value={money(current.profit)} detail={`Previous ${money(previous.profit)} · ${profitGrowth === null ? 'new/no baseline' : `${profitGrowth >= 0 ? '+' : ''}${profitGrowth.toFixed(1)}%`}`} /></div></section>

      <section className="grid gap-4 xl:grid-cols-2"><div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4"><h2 className="text-sm font-black uppercase tracking-widest text-white">Subcategory performance</h2><div className="mt-4 space-y-3">{childRows.map(row => <Link key={row.category.id} href={`/inventory/categories/${row.category.id}?storeId=${storeId || 'all'}&timeRange=${timeRange}`} className="block rounded-xl border border-slate-800 bg-slate-950/40 p-3 hover:border-cyan-500/30"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-200">{row.category.name}</p><p className="text-[10px] text-slate-500">{row.activeProducts} active products · {integer(row.units)} units</p></div><div className="text-right"><p className="font-black text-emerald-300">{money(row.revenue)}</p><p className="text-[10px] text-cyan-400">{pct(row.margin)}</p></div></div></Link>)}</div></div><div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4"><h2 className="text-sm font-black uppercase tracking-widest text-white">Brand contribution</h2><div className="mt-4 space-y-3">{brandRows.slice(0, 10).map(row => <div key={row.name} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"><div className="flex justify-between gap-3"><span className="font-bold text-slate-200">{row.name}</span><span className="font-black text-emerald-300">{money(row.revenue)}</span></div><div className="mt-1 text-[10px] text-slate-500">{integer(row.units)} units · {pct(current.revenue ? (row.revenue / current.revenue) * 100 : 0)} of category revenue</div></div>)}</div></div></section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4"><h2 className="text-sm font-black uppercase tracking-widest text-white">Top selling products</h2><div className="mt-4 grid gap-3 lg:grid-cols-2">{currentProducts.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 20).map(product => <Link key={product.id} href={`/inventory-management/stock/${product.id}`} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 hover:border-cyan-500/30"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-black text-cyan-200">{product.name}</p><p className="mt-1 truncate text-[10px] text-slate-500">{product.sku || 'No SKU'} · {product.brand_name || 'No Brand'} · {product.category_name || 'Uncategorized'}</p></div><p className="shrink-0 font-black text-white">{money(product.revenue)}</p></div><div className="mt-3 grid grid-cols-4 gap-2 text-center"><div><p className="text-[8px] font-black uppercase text-slate-600">Units</p><p className="text-xs font-bold text-slate-200">{integer(product.unitsSold)}</p></div><div><p className="text-[8px] font-black uppercase text-slate-600">Profit</p><p className="text-xs font-bold text-emerald-300">{money(product.grossProfit)}</p></div><div><p className="text-[8px] font-black uppercase text-slate-600">Margin</p><p className="text-xs font-bold text-cyan-300">{pct(product.margin)}</p></div><div><p className="text-[8px] font-black uppercase text-slate-600">Stock</p><p className="text-xs font-bold text-slate-200">{integer(product.stock)}</p></div></div></Link>)}</div>{!currentProducts.length && <p className="py-10 text-center text-sm text-slate-500">No paid sales for this category tree in the selected period.</p>}</section>
    </div>
  );
}

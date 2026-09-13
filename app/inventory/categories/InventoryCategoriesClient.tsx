'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import StoreScopeSelector from '@/components/StoreScopeSelector';
import { categoryService, type Category } from '@/lib/services/categoryService';
import { ProductIntelligenceService } from '@/lib/services/productIntelligenceService';
import type { ProductIntelligenceReport } from '@/lib/services/intelligenceService';
import { supabase } from '@/lib/supabase';

type TimeRange = '7days' | '30days' | '90days' | 'all';

type CategoryRow = {
  id: string;
  name: string;
  parentId: string | null;
  directProducts: number;
  activeProducts: number;
  units: number;
  revenue: number;
  grossProfit: number;
  margin: number;
  orders: number;
};

type Quality = { missingBrand: number; missingCategory: number; zeroPrice: number };

const money = (value: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(Number(value || 0));

function emptyRow(category: Category): CategoryRow {
  return {
    id: category.id,
    name: category.name,
    parentId: category.parent_id || null,
    directProducts: 0,
    activeProducts: 0,
    units: 0,
    revenue: 0,
    grossProfit: 0,
    margin: 0,
    orders: 0,
  };
}

function ProductHighlights({ report }: { report: ProductIntelligenceReport | null }) {
  const groups = useMemo(() => {
    const products = report?.current.products.filter(product => product.revenue > 0) || [];
    if (!products.length) return [];
    const avgRevenue = products.reduce((sum, product) => sum + product.revenue, 0) / products.length;
    const avgMargin = products.reduce((sum, product) => sum + product.margin, 0) / products.length;
    return [
      { title: 'Stars (high sales, high margin)', type: 'revenue', rows: products.filter(p => p.revenue > avgRevenue && p.margin > avgMargin).slice(0, 3) },
      { title: 'Volume drivers (high sales, low margin)', type: 'revenue', rows: products.filter(p => p.revenue > avgRevenue && p.margin <= avgMargin).slice(0, 3) },
      { title: 'Hidden winners (low sales, high margin)', type: 'margin', rows: products.filter(p => p.revenue <= avgRevenue && p.margin > avgMargin).slice(0, 3) },
      { title: 'Problem products (low margin)', type: 'margin', rows: products.filter(p => p.margin < 10).sort((a, b) => a.margin - b.margin).slice(0, 3) },
    ];
  }, [report]);

  if (!groups.some(group => group.rows.length)) return null;
  return (
    <section>
      <h3 className="mb-4 px-1 text-xs font-black uppercase tracking-[0.18em] text-slate-500">Performance segment highlights</h3>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {groups.map(group => (
          <div key={group.title} className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
            <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-500">{group.title}</h4>
            <div className="mt-3 space-y-2">
              {group.rows.length ? group.rows.map(product => (
                <div key={product.id} className="flex items-start justify-between gap-3 text-xs">
                  <span className="min-w-0 flex-1 truncate font-bold text-slate-100">{product.name}</span>
                  <span className="shrink-0 font-black text-emerald-300">{group.type === 'revenue' ? money(product.revenue) : `${product.margin.toFixed(0)}%`}</span>
                </div>
              )) : <p className="text-xs text-slate-600">No products in this segment.</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function InventoryCategoriesClient() {
  const [rawCategories, setRawCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Array<{ id: string; category_id: string | null; is_active: boolean | null }>>([]);
  const [report, setReport] = useState<ProductIntelligenceReport | null>(null);
  const [quality, setQuality] = useState<Quality>({ missingBrand: 0, missingCategory: 0, zeroPrice: 0 });
  const [storeId, setStoreId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('30days');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', sort_order: 0, is_active: true, parent_id: '' as string | null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = ProductIntelligenceService.getDateRange(timeRange);
      const [categories, productRows, intelligence, missingBrand, missingCategory, zeroPrice] = await Promise.all([
        categoryService.getAllCategories(),
        supabase.from('products').select('id,category_id,is_active').eq('is_deleted', false),
        ProductIntelligenceService.getProductIntelligence({ storeId: storeId || 'all', startDate: start, endDate: end }),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_deleted', false).eq('is_active', true).is('brand_id', null),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_deleted', false).eq('is_active', true).is('category_id', null),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_deleted', false).eq('is_active', true).lte('price', 0),
      ]);
      setRawCategories(categories);
      setProducts((productRows.data || []) as any);
      setReport(intelligence);
      setQuality({
        missingBrand: missingBrand.count || 0,
        missingCategory: missingCategory.count || 0,
        zeroPrice: zeroPrice.count || 0,
      });
    } finally {
      setLoading(false);
    }
  }, [storeId, timeRange]);

  useEffect(() => { void load(); }, [load]);

  const directRows = useMemo(() => {
    const sales = new Map((report?.current.categories || []).map(row => [row.id, row]));
    const rows = new Map<string, CategoryRow>();
    rawCategories.forEach(category => rows.set(category.id, emptyRow(category)));
    products.forEach(product => {
      if (!product.category_id) return;
      const row = rows.get(product.category_id);
      if (!row) return;
      row.directProducts += 1;
      if (product.is_active !== false) row.activeProducts += 1;
    });
    rows.forEach((row, id) => {
      const sold = sales.get(id);
      if (!sold) return;
      row.units = sold.units;
      row.revenue = sold.revenue;
      row.grossProfit = sold.profit;
      row.margin = sold.margin;
      row.orders = sold.orderCount;
    });
    return rows;
  }, [rawCategories, products, report]);

  const rolledRows = useMemo(() => {
    const children = new Map<string, string[]>();
    rawCategories.forEach(category => {
      if (!category.parent_id) return;
      const list = children.get(category.parent_id) || [];
      list.push(category.id);
      children.set(category.parent_id, list);
    });
    const memo = new Map<string, CategoryRow>();
    const visit = (id: string, stack = new Set<string>()): CategoryRow | null => {
      if (memo.has(id)) return memo.get(id)!;
      const base = directRows.get(id);
      if (!base) return null;
      if (stack.has(id)) return { ...base };
      const nextStack = new Set(stack); nextStack.add(id);
      const result = { ...base };
      for (const childId of children.get(id) || []) {
        const child = visit(childId, nextStack);
        if (!child) continue;
        result.directProducts += child.directProducts;
        result.activeProducts += child.activeProducts;
        result.units += child.units;
        result.revenue += child.revenue;
        result.grossProfit += child.grossProfit;
        result.orders += child.orders;
      }
      result.margin = result.revenue > 0 ? (result.grossProfit / result.revenue) * 100 : 0;
      memo.set(id, result);
      return result;
    };
    rawCategories.forEach(category => visit(category.id));
    return memo;
  }, [rawCategories, directRows]);

  const topLevel = useMemo(() => rawCategories.filter(category => !category.parent_id).map(category => rolledRows.get(category.id)).filter(Boolean) as CategoryRow[], [rawCategories, rolledRows]);
  const childrenFor = (parentId: string) => rawCategories.filter(category => category.parent_id === parentId).map(category => rolledRows.get(category.id)).filter(Boolean) as CategoryRow[];
  const qualityIssues = [
    quality.missingBrand ? `${quality.missingBrand} active products missing brand assignment` : null,
    quality.missingCategory ? `${quality.missingCategory} active products missing category assignment` : null,
    quality.zeroPrice ? `${quality.zeroPrice} active products have zero or negative price` : null,
  ].filter(Boolean) as string[];

  const openModal = (category: Category | null = null) => {
    setEditingCategory(category);
    setFormData(category ? {
      name: category.name,
      description: category.description || '',
      sort_order: category.sort_order,
      is_active: category.is_active,
      parent_id: category.parent_id || '',
    } : { name: '', description: '', sort_order: 0, is_active: true, parent_id: '' });
    setShowModal(true);
  };

  const saveCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = { ...formData, parent_id: formData.parent_id || null };
    if (editingCategory) await categoryService.updateCategory(editingCategory.id, payload);
    else await categoryService.createCategory(payload);
    setShowModal(false);
    await load();
  };

  const deleteCategory = async (id: string) => {
    if (!confirm('Delete this category? Child categories will be unparented, not deleted.')) return;
    if (await categoryService.deleteCategory(id)) await load();
  };

  return (
    <div className="space-y-6 pb-24 fold-inner:pb-8">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-white">Category intelligence</h2>
          <p className="mt-1 text-sm text-slate-400">Canonical product taxonomy with paid-sales rollups. Parent categories include all descendant categories.</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <StoreScopeSelector value={storeId} onStoreChange={setStoreId} />
          <div className="flex rounded-xl border border-slate-800 bg-slate-950/70 p-1">
            {(['7days', '30days', '90days', 'all'] as TimeRange[]).map(range => <button key={range} onClick={() => setTimeRange(range)} className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase ${timeRange === range ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>{range}</button>)}
          </div>
          <button onClick={() => openModal()} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-500">+ Add category</button>
        </div>
      </section>

      {qualityIssues.length > 0 ? (
        <section className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-5">
          <h3 className="text-sm font-black uppercase tracking-widest text-amber-300">Active catalogue integrity</h3>
          <p className="mt-1 text-xs text-amber-100/60">Only issues capable of affecting the live catalogue are shown here.</p>
          <div className="mt-3 flex flex-wrap gap-2">{qualityIssues.map(issue => <span key={issue} className="rounded-lg border border-amber-400/20 bg-slate-950/30 px-3 py-1 text-[10px] font-black uppercase text-amber-100">{issue}</span>)}</div>
        </section>
      ) : (
        <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs font-bold text-emerald-300">✓ Active catalogue mappings are clean: no missing brand/category IDs and no active zero-price products.</section>
      )}

      <ProductHighlights report={report} />

      {loading ? <div className="h-48 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50" /> : (
        <div className="space-y-4">
          {topLevel.map(parent => {
            const subs = childrenFor(parent.id);
            return (
              <section key={parent.id} className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/40">
                <div className="p-5 lg:p-6">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-2xl font-black text-blue-400">{parent.name[0]?.toUpperCase()}</div>
                      <div className="min-w-0">
                        <Link href={`/inventory/categories/${parent.id}?storeId=${storeId || 'all'}&timeRange=${timeRange}`} className="block truncate text-xl font-black uppercase tracking-tight text-white hover:text-cyan-300">{parent.name}</Link>
                        <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-slate-500">{subs.length} subcategories · {parent.activeProducts} active products across this category</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 xl:min-w-[360px]">
                      <div><p className="text-[9px] font-black uppercase text-slate-600">Revenue</p><p className="mt-1 font-black text-emerald-300">{money(parent.revenue)}</p></div>
                      <div><p className="text-[9px] font-black uppercase text-slate-600">Profit</p><p className="mt-1 font-black text-amber-300">{money(parent.grossProfit)}</p></div>
                      <div><p className="text-[9px] font-black uppercase text-slate-600">Margin</p><p className="mt-1 font-black text-cyan-300">{parent.margin.toFixed(1)}%</p></div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openModal(rawCategories.find(category => category.id === parent.id) || null)} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[10px] font-black uppercase text-slate-300">Edit</button>
                      <button onClick={() => void deleteCategory(parent.id)} className="rounded-lg border border-rose-900/30 bg-rose-950/20 px-3 py-2 text-[10px] font-black uppercase text-rose-400">Delete</button>
                    </div>
                  </div>
                </div>
                {subs.length > 0 && <div className="divide-y divide-slate-800/60 border-t border-slate-800/60 bg-slate-950/20">{subs.map(sub => (
                  <div key={sub.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center lg:px-8">
                    <div className="min-w-0">
                      <Link href={`/inventory/categories/${sub.id}?storeId=${storeId || 'all'}&timeRange=${timeRange}`} className="font-bold text-slate-200 hover:text-cyan-300">{sub.name}</Link>
                      <span className="ml-3 text-[9px] font-black uppercase text-slate-600">{sub.activeProducts} products</span>
                    </div>
                    <div className="grid grid-cols-3 gap-5 text-right text-xs"><span className="text-slate-400">{sub.units} units</span><span className="font-black text-emerald-400">{money(sub.revenue)}</span><span className="font-black text-cyan-400">{sub.margin.toFixed(0)}%</span></div>
                  </div>
                ))}</div>}
              </section>
            );
          })}
        </div>
      )}

      {showModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6"><h3 className="text-lg font-black text-white">{editingCategory ? 'Edit category' : 'Add category'}</h3><form onSubmit={saveCategory} className="mt-4 space-y-4"><input required value={formData.name} onChange={event => setFormData({ ...formData, name: event.target.value })} placeholder="Category name" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-white" /><textarea value={formData.description} onChange={event => setFormData({ ...formData, description: event.target.value })} placeholder="Description" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-white" /><select value={formData.parent_id || ''} onChange={event => setFormData({ ...formData, parent_id: event.target.value || null })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-white"><option value="">No parent</option>{rawCategories.filter(category => category.id !== editingCategory?.id).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select><div className="flex justify-end gap-2"><button type="button" onClick={() => setShowModal(false)} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300">Cancel</button><button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white">Save</button></div></form></div></div>}
    </div>
  );
}

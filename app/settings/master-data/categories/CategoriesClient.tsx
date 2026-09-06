'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { categoryService, Category } from '@/lib/services/categoryService';
import { IntelligenceService, CategoryIntelligence } from '@/lib/services/intelligenceService';
import StoreScopeSelector from '@/components/StoreScopeSelector';
import Sparkline from '@/components/Sparkline';

type TimeRange = '7days' | '30days' | '90days' | 'all';

export default function CategoriesClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [categories, setCategories] = useState<CategoryIntelligence[]>([]);
  const [rawCategories, setRawCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('30days');
  const [qualityReport, setQualityReport] = useState<{ issues: string[], counts: any } | null>(null);
  const [specialInsights, setSpecialInsights] = useState<any[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sort_order: 0,
    is_active: true,
    parent_id: '' as string | null,
  });

  useEffect(() => {
    loadCategories();
  }, [storeId, timeRange]);

  const loadCategories = async () => {
    setLoading(true);
    const { start, end } = IntelligenceService.getDateRange(timeRange);
    const options = {
      storeId: storeId || 'all',
      startDate: start,
      endDate: end
    };

    const [analyticsData, allRaw, quality, insights] = await Promise.all([
      IntelligenceService.getCategoriesIntelligence(options),
      categoryService.getAllCategories(),
      IntelligenceService.getDataQualityReport(),
      IntelligenceService.getSpecialInsights(options)
    ]);

    setCategories(analyticsData);
    setRawCategories(allRaw);
    setQualityReport(quality);
    setSpecialInsights(insights);
    setLoading(false);
  };

  const topLevelAnalytics = categories.filter(c => !rawCategories.find(r => r.id === c.id)?.parent_id);

  const getSubcategoriesAnalytics = (parentId: string) =>
    categories.filter(c => rawCategories.find(r => r.id === c.id)?.parent_id === parentId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      parent_id: formData.parent_id || null,
    };
    if (editingCategory) {
      await categoryService.updateCategory(editingCategory.id, payload);
    } else {
      await categoryService.createCategory(payload);
    }
    setShowModal(false);
    loadCategories();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this category? Subcategories will be unparented but not deleted.')) {
      const success = await categoryService.deleteCategory(id);
      if (success) loadCategories();
    }
  };

  const handleOpenModal = (category: Category | null = null) => {
    if (category) {
      setEditingCategory(category);
      setFormData({
        name: category.name,
        description: category.description || '',
        sort_order: category.sort_order,
        is_active: category.is_active,
        parent_id: category.parent_id || '',
      });
    } else {
      setEditingCategory(null);
      setFormData({
        name: '',
        description: '',
        sort_order: 0,
        is_active: true,
        parent_id: '',
      });
    }
    setShowModal(true);
  };

  const fmt = (v: number) => `£${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Category Intelligence</h2>
          <p className="text-slate-400 text-sm">Product taxonomy and performance analysis</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StoreScopeSelector value={storeId} onStoreChange={setStoreId} />
          <div className="flex bg-slate-900/50 p-1 rounded-xl border border-slate-800">
             {['7days', '30days', '90days', 'all'].map(r => (
               <button
                 key={r}
                 onClick={() => setTimeRange(r as any)}
                 className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${timeRange === r ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
               >
                 {r}
               </button>
             ))}
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-blue-900/20"
          >
            + Add Category
          </button>
        </div>
      </div>

      {/* Data Quality Warning */}
      {qualityReport && qualityReport.issues.length > 0 && (
        <div className="bg-amber-900/10 border border-amber-500/30 rounded-[2rem] p-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center text-2xl">⚠️</div>
            <div>
              <h3 className="text-lg font-black text-amber-400 uppercase tracking-tighter">Data Integrity Issues</h3>
              <p className="text-amber-400/60 text-sm font-medium">Accuracy may be impacted by missing product mappings.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {qualityReport.issues.map((issue, i) => (
              <span key={i} className="px-3 py-1 bg-amber-500/10 text-amber-300 text-[9px] font-black uppercase rounded-lg border border-amber-500/20">
                {issue}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Special Market Insights */}
      {specialInsights.length > 0 && (
        <div className="mb-10">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 px-2">Performance Segment Highlights</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
             {specialInsights.map((si, i) => (
               <div key={i} className="bg-slate-900/40 border border-slate-800 p-5 rounded-3xl relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="text-4xl">{si.type === 'star' ? '⭐' : si.type === 'volume' ? '🔥' : si.type === 'hidden' ? '💎' : '⚠️'}</span>
                 </div>
                 <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">{si.title}</h4>
                 <div className="space-y-2">
                   {si.products.slice(0, 3).map((p: any) => (
                     <div key={p.id} className="flex justify-between items-center gap-2">
                       <span className="text-xs font-bold text-white truncate flex-1">{p.name}</span>
                       <span className="text-[10px] font-black text-emerald-400">{si.type === 'star' || si.type === 'volume' ? fmt(p.revenue) : `${p.margin.toFixed(0)}%`}</span>
                     </div>
                   ))}
                 </div>
               </div>
             ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-slate-900/50 rounded-2xl animate-pulse border border-slate-800" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {topLevelAnalytics.map((parent) => {
            const subs = getSubcategoriesAnalytics(parent.id);
            return (
              <div key={parent.id} className="bg-slate-900/40 backdrop-blur-xl rounded-[2rem] border border-slate-800 overflow-hidden shadow-xl group">
                <div className="flex flex-col md:flex-row md:items-center justify-between px-6 py-6 bg-slate-800/20 gap-6">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 text-2xl font-black shadow-inner">
                       {parent.name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <Link
                        href={`/settings/master-data/categories/${parent.id}?storeId=${storeId || 'all'}&timeRange=${timeRange}`}
                        className="text-xl font-black text-white uppercase tracking-tight hover:text-blue-400 transition-colors"
                      >
                        {parent.name}
                      </Link>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{subs.length} Subcategories</span>
                        <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{parent.metrics.activeProducts} Products</span>
                      </div>
                    </div>
                  </div>

                  {/* High Level Metrics */}
                  <div className="flex gap-8 items-center">
                     {parent.trend && parent.trend.length > 1 && (
                       <div className="hidden lg:block opacity-40 group-hover:opacity-100 transition-opacity mr-4">
                         <Sparkline data={parent.trend} color="#10b981" width={100} height={30} />
                       </div>
                     )}
                     <div className="text-right">
                       <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Revenue</p>
                       <p className="text-lg font-black text-emerald-400">{fmt(parent.metrics.revenue)}</p>
                     </div>
                     <div className="text-right">
                       <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Profit</p>
                       <p className="text-lg font-black text-amber-400">{fmt(parent.metrics.grossProfit)}</p>
                     </div>
                     <div className="text-right">
                       <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Margin</p>
                       <p className="text-lg font-black text-cyan-400">{parent.metrics.margin.toFixed(1)}%</p>
                     </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenModal(rawCategories.find(r => r.id === parent.id) as any)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-700 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(parent.id)}
                      className="px-4 py-2 bg-rose-950/20 hover:bg-rose-900/30 text-rose-500/70 hover:text-rose-400 rounded-xl text-[10px] font-black uppercase tracking-widest border border-rose-900/20 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {subs.length > 0 && (
                  <div className="divide-y divide-slate-800/50 bg-slate-950/20">
                    {subs.map((sub) => (
                      <div key={sub.id} className="flex flex-col md:flex-row md:items-center justify-between px-6 py-4 pl-12 md:pl-20 hover:bg-slate-800/20 transition-colors gap-4">
                        <div className="flex items-center gap-4 flex-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500/40" />
                          <Link
                            href={`/settings/master-data/categories/${sub.id}?storeId=${storeId || 'all'}&timeRange=${timeRange}`}
                            className="text-sm font-bold text-slate-300 hover:text-blue-400 transition-colors"
                          >
                            {sub.name}
                          </Link>
                          <span className="text-[9px] text-slate-600 font-black uppercase">{sub.metrics.activeProducts} Prod</span>
                        </div>

                        <div className="flex gap-6 items-center">
                           <span className="text-xs font-bold text-slate-400">{sub.metrics.unitsSold} units</span>
                           <span className="text-xs font-black text-emerald-500/80">{fmt(sub.metrics.revenue)}</span>
                           <span className="text-[10px] font-black text-cyan-500/60 w-12 text-right">{sub.metrics.margin.toFixed(0)}%</span>
                        </div>

                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => handleOpenModal(rawCategories.find(r => r.id === sub.id) as any)}
                            className="p-2 text-slate-600 hover:text-blue-400 transition-colors"
                            title="Edit Subcategory"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md">
            <h3 className="text-lg font-bold text-white mb-4">
              {editingCategory ? 'Edit Category' : 'Add Category'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Parent Category</label>
                <select
                  value={formData.parent_id || ''}
                  onChange={e => setFormData({ ...formData, parent_id: e.target.value || null })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">None (Top-level Category)</option>
                  {topLevelAnalytics
                    .filter(c => c.id !== editingCategory?.id)
                    .map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">Select a parent to make this a subcategory</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={formData.sort_order}
                    onChange={e => setFormData({ ...formData, sort_order: parseInt(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center mt-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-300">Active</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editingCategory ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

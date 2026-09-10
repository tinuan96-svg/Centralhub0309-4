'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { brandService, Brand } from '@/lib/services/brandService';
import { IntelligenceService, BrandIntelligence } from '@/lib/services/intelligenceService';
import StoreScopeSelector from '@/components/StoreScopeSelector';
import Sparkline from '@/components/Sparkline';
import { designTokens } from '@/lib/design-system';

type TimeRange = 'today' | '7days' | '30days' | '90days' | '6months' | '12months' | 'all';

export default function BrandsClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [brands, setBrands] = useState<BrandIntelligence[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('30days');
  const [qualityReport, setQualityReport] = useState<{ issues: string[], counts: any } | null>(null);
  const [specialInsights, setSpecialInsights] = useState<any[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    website: '',
    logo_url: '',
    is_active: true
  });

  useEffect(() => {
    loadBrands();
  }, [storeId, timeRange]);

  const loadBrands = async () => {
    setLoading(true);
    const { start, end } = IntelligenceService.getDateRange(timeRange);
    const options = {
      storeId: storeId || 'all',
      startDate: start,
      endDate: end
    };

    const [data, quality, insights] = await Promise.all([
      IntelligenceService.getBrandsIntelligence(options),
      IntelligenceService.getDataQualityReport(),
      IntelligenceService.getSpecialInsights(options)
    ]);

    setBrands(data);
    setQualityReport(quality);
    setSpecialInsights(insights);
    setLoading(false);
  };

  const handleOpenModal = (brand: Brand | null = null) => {
    if (brand) {
      setEditingBrand(brand);
      setFormData({
        name: brand.name,
        description: brand.description || '',
        website: brand.website || '',
        logo_url: brand.logo_url || '',
        is_active: brand.is_active
      });
    } else {
      setEditingBrand(null);
      setFormData({
        name: '',
        description: '',
        website: '',
        logo_url: '',
        is_active: true
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBrand) {
      await brandService.updateBrand(editingBrand.id, formData);
    } else {
      await brandService.createBrand(formData);
    }
    setShowModal(false);
    loadBrands();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this brand?')) {
      const success = await brandService.deleteBrand(id);
      if (success) loadBrands();
    }
  };

  const fmt = (v: number) => `£${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Brand Intelligence</h2>
          <p className="text-slate-400 text-sm">Performance analytics across all connected stores</p>
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
            + Add Brand
          </button>
        </div>
      </div>

      {/* Data Quality Warning */}
      {qualityReport && qualityReport.issues.length > 0 && (
        <div className="bg-amber-900/10 border border-amber-500/30 rounded-[2rem] p-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center text-2xl">⚠️</div>
            <div>
              <h3 className="text-lg font-black text-amber-400 uppercase tracking-tighter">Data Integrity Issues Detected</h3>
              <p className="text-amber-400/60 text-sm font-medium">Some analytics may be incomplete due to missing data.</p>
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
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 px-2">Market Intelligence Highlights</h3>
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
                       <span className="text-[10px] font-black text-blue-400">{si.type === 'star' || si.type === 'volume' ? fmt(p.revenue) : `${p.margin.toFixed(0)}%`}</span>
                     </div>
                   ))}
                   {si.products.length === 0 && <p className="text-[10px] text-slate-600 italic">No products identified in this category.</p>}
                 </div>
               </div>
             ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-64 bg-slate-900/50 rounded-2xl animate-pulse border border-slate-800" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {brands.map((brand) => (
            <Link
              href={`/inventory/brands/${brand.id}?storeId=${storeId || 'all'}&timeRange=${timeRange}`}
              key={brand.id}
              className="bg-slate-900/50 rounded-[2rem] border border-slate-800 p-6 hover:border-blue-500/50 transition-all group relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="flex gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center text-2xl shadow-inner border border-slate-700/50">
                    {brand.logo_url ? (
                      <img src={brand.logo_url} alt={brand.name} className="w-full h-full object-contain p-2" />
                    ) : (
                      '🏷️'
                    )}
                  </div>
                  <div>
                    <h4 className="text-xl font-black text-white group-hover:text-blue-400 transition-colors leading-tight">{brand.name}</h4>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">{brand.metrics.activeProducts} / {brand.metrics.totalProducts} Products Active</p>
                  </div>
                </div>
                {brand.trend && brand.trend.length > 1 && (
                  <div className="opacity-60 group-hover:opacity-100 transition-opacity">
                    <Sparkline data={brand.trend} color="#3b82f6" width={80} height={30} />
                  </div>
                )}
              </div>

              {/* KPI Grid */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-950/40 rounded-2xl p-3 border border-slate-800/50">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mb-1">Revenue</p>
                  <p className="text-lg font-black text-emerald-400">{fmt(brand.metrics.revenue)}</p>
                </div>
                <div className="bg-slate-950/40 rounded-2xl p-3 border border-slate-800/50">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mb-1">Units Sold</p>
                  <p className="text-lg font-black text-blue-400">{brand.metrics.unitsSold}</p>
                </div>
                <div className="bg-slate-950/40 rounded-2xl p-3 border border-slate-800/50">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mb-1">Gross Profit</p>
                  <p className="text-lg font-black text-amber-400">{fmt(brand.metrics.grossProfit)}</p>
                </div>
                <div className="bg-slate-950/40 rounded-2xl p-3 border border-slate-800/50">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mb-1">Margin</p>
                  <p className="text-lg font-black text-cyan-400">{brand.metrics.margin.toFixed(1)}%</p>
                </div>
              </div>

              {/* Status & Inventory Indicators */}
              <div className="flex gap-2 mb-6">
                 {brand.metrics.outOfStockProducts > 0 && (
                   <span className="px-2 py-1 bg-rose-500/10 text-rose-400 text-[9px] font-black uppercase rounded-lg border border-rose-500/20">
                     {brand.metrics.outOfStockProducts} OOS
                   </span>
                 )}
                 {brand.metrics.lowStockProducts > 0 && (
                   <span className="px-2 py-1 bg-orange-500/10 text-orange-400 text-[9px] font-black uppercase rounded-lg border border-orange-500/20">
                     {brand.metrics.lowStockProducts} LOW
                   </span>
                 )}
                 <span className="px-2 py-1 bg-slate-800 text-slate-400 text-[9px] font-black uppercase rounded-lg ml-auto">
                   {brand.metrics.storeCount} Stores
                 </span>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-slate-800/50">
                <div className="flex gap-4">
                  <button
                    onClick={(e) => { e.preventDefault(); handleOpenModal(brand as any); }}
                    className="text-slate-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); handleDelete(brand.id); }}
                    className="text-slate-500 hover:text-rose-400 text-[10px] font-black uppercase tracking-widest transition-colors"
                  >
                    Delete
                  </button>
                </div>
                <span className="text-blue-500 text-[10px] font-black uppercase tracking-widest group-hover:translate-x-1 transition-transform">
                  Analyze →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md">
            <h3 className="text-lg font-bold text-white mb-4">
              {editingBrand ? 'Edit Brand' : 'Add Brand'}
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
                <label className="block text-sm font-medium text-slate-400 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Website URL</label>
                <input
                  type="url"
                  value={formData.website}
                  onChange={e => setFormData({ ...formData, website: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Logo URL</label>
                <input
                  type="url"
                  value={formData.logo_url}
                  onChange={e => setFormData({ ...formData, logo_url: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="https://..."
                />
              </div>
              <div className="flex items-center">
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
                  {editingBrand ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

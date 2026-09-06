'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/lib/store/useStore';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { Product } from '@/lib/types';
import BulkEditModal from '@/components/BulkEditModal';
import { formatCurrency } from '@/lib/utils/currency';
import ProductImage from '@/components/ProductImage';
import { CATEGORY_HIERARCHY } from '@/lib/constants/categories';
import Link from 'next/link';

type SortField = 'name' | 'sku' | 'price' | 'cost_price' | 'stock' | 'brand' | 'category' | 'created_at' | 'profit_margin';
type SortDirection = 'asc' | 'desc';

export default function BulkProductManagementPage({ params, searchParams }: { params: any; searchParams: any }) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [filterCat, setFilterCat] = useState('all');
  const [filterSub, setFilterSub] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterStock, setFilterStatusStock] = useState<'all' | 'out' | 'low' | 'ok'>('all');
  const [filterPriceRange, setFilterPriceRange] = useState<'all' | 'under5' | '5to20' | 'over20' | 'zero'>('all');
  const [filterIntegrity, setFilterIntegrity] = useState<'all' | 'invalid'>('all');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  // Modals
  const [bulkModal, setBulkModal] = useState<{ open: boolean; mode: 'edit' | 'delete' | 'visibility' }>({ open: false, mode: 'edit' });

  // Metadata
  const [brands, setBrands] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch products with central inventory
      const { data: prodData, error } = await supabase
        .from('products')
        .select('*, central_inventory(stock_quantity, low_stock_threshold)')
        .is('is_deleted', false);

      if (error) throw error;

      const mapped = (prodData || []).map(p => {
        const inv = p.central_inventory?.[0];
        const stock = inv?.stock_quantity ?? p.stock ?? 0;
        const threshold = inv?.low_stock_threshold ?? 10;
        const profit = (p.price || 0) - (p.cost_price || 0);
        const margin = p.price > 0 ? (profit / p.price) * 100 : 0;
        return {
          ...p,
          current_stock: stock,
          low_stock_threshold: threshold,
          profit_margin: margin
        };
      });

      setProducts(mapped);

      // 2. Extract unique brands for filter
      const uniqueBrands = Array.from(new Set(mapped.map(p => p.brand))).filter(Boolean).sort() as string[];
      setBrands(uniqueBrands);

    } catch (e) {
      console.error('Error loading bulk management data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const q = debouncedSearch.toLowerCase();
      const matchesSearch = !q ||
        p.name.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q);

      const matchesBrand = filterBrand === 'all' || p.brand === filterBrand;
      const matchesDept = filterDept === 'all' || p.department === filterDept;
      const matchesCat = filterCat === 'all' || p.category === filterCat;
      const matchesSub = filterSub === 'all' || p.subcategory === filterSub;
      const matchesStatus = filterStatus === 'all' || (filterStatus === 'active' ? p.is_active : !p.is_active);

      let matchesStock = true;
      if (filterStock === 'out') matchesStock = p.current_stock <= 0;
      else if (filterStock === 'low') matchesStock = p.current_stock > 0 && p.current_stock <= (p.low_stock_threshold || 10);
      else if (filterStock === 'ok') matchesStock = p.current_stock > (p.low_stock_threshold || 10);

      let matchesPrice = true;
      if (filterPriceRange === 'under5') matchesPrice = p.price < 5;
      else if (filterPriceRange === '5to20') matchesPrice = p.price >= 5 && p.price <= 20;
      else if (filterPriceRange === 'over20') matchesPrice = p.price > 20;
      else if (filterPriceRange === 'zero') matchesPrice = Number(p.price) <= 0;

      let matchesIntegrity = true;
      if (filterIntegrity === 'invalid') {
         matchesIntegrity =
           (Number(p.price) <= 0) ||
           (p.current_stock <= 0 && !p.allow_backorder) ||
           !p.brand?.trim() ||
           !p.sku?.trim();
      }

      return matchesSearch && matchesBrand && matchesDept && matchesCat && matchesSub && matchesStatus && matchesStock && matchesPrice && matchesIntegrity;
    }).sort((a, b) => {
      const field = sortField === 'stock' ? 'current_stock' : sortField;
      const aVal = a[field] ?? '';
      const bVal = b[field] ?? '';
      const modifier = sortDir === 'asc' ? 1 : -1;

      if (typeof aVal === 'string') return aVal.localeCompare(bVal) * modifier;
      return (aVal - bVal) * modifier;
    });
  }, [products, debouncedSearch, filterBrand, filterDept, filterCat, filterSub, filterStatus, filterStock, filterPriceRange, filterIntegrity, sortField, sortDir]);

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredProducts.length) setSelectedIds([]);
    else setSelectedIds(filteredProducts.map(p => p.id));
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const handleToggleStatus = async (productId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: !currentStatus, updated_at: new Date().toISOString() })
        .eq('id', productId);

      if (error) throw error;

      // Update local state for immediate feedback
      setProducts(prev => prev.map(p =>
        p.id === productId ? { ...p, is_active: !currentStatus } : p
      ));
    } catch (e: any) {
      alert("Failed to update status: " + e.message);
    }
  };

  const handleAutoFixInvalid = async () => {
    console.log("[BulkManager] Starting Auto-Fix for Garbage Data...");

    // Explicitly define garbage criteria:
    // 1. Price is 0 or null
    // 2. Stock is 0 or less AND backorders are NOT allowed
    // 3. Brand is missing or empty
    // 4. SKU is missing or empty
    const invalidProducts = products.filter(p => {
      const hasNoPrice = p.price === null || p.price === undefined || Number(p.price) <= 0;
      const hasNoStock = (p.current_stock === null || p.current_stock === undefined || Number(p.current_stock) <= 0) && !p.allow_backorder;
      const hasNoBrand = !p.brand || p.brand.trim() === '';
      const hasNoSku = !p.sku || p.sku.trim() === '';

      const isGarbage = hasNoPrice || hasNoStock || hasNoBrand || hasNoSku;

      return p.is_active && isGarbage;
    });

    console.log(`[BulkManager] Found ${invalidProducts.length} active garbage products out of ${products.length} total.`);

    if (invalidProducts.length === 0) {
      alert("Scan Complete: No active products match the 'Garbage Data' criteria.\n\nCriteria:\n- Price is £0.00\n- Stock is 0 (and backorders disabled)\n- Brand name missing\n- SKU missing");
      return;
    }

    const confirmMsg = `Found ${invalidProducts.length} active products with missing data:\n` +
      invalidProducts.slice(0, 5).map(p => `- ${p.name} (Price: £${p.price}, Stock: ${p.current_stock})`).join('\n') +
      (invalidProducts.length > 5 ? `\n...and ${invalidProducts.length - 5} more.` : '') +
      `\n\nSet all these to INACTIVE?`;

    if (!confirm(confirmMsg)) return;

    setLoading(true);
    try {
      const ids = invalidProducts.map(p => p.id);

      // Update in batches of 100 to avoid request limits if the list is huge
      const batchSize = 100;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const { error } = await supabase
          .from('products')
          .update({
            is_active: false,
            updated_at: new Date().toISOString(),
            admin_notes: `Auto-inactivated by Bulk Garbage Collector on ${new Date().toLocaleDateString()}`
          })
          .in('id', batch);

        if (error) throw error;
      }

      alert(`Success: ${invalidProducts.length} products have been moved to Inactive status.`);
      await loadData();
    } catch (e: any) {
      console.error("[BulkManager] Auto-fix failed:", e);
      alert("Error during update: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="ml-1 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">⇅</span>;
    return sortDir === 'asc' ? <span className="ml-1 text-cyan-400">↑</span> : <span className="ml-1 text-cyan-400">↓</span>;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1800px] mx-auto space-y-6">
      <div className="sticky top-14 md:static z-20 bg-slate-950/80 backdrop-blur-md md:bg-transparent -mx-4 px-4 py-3 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b md:border-0 border-slate-800/50">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
             <span className="text-2xl">🛠️</span> Bulk Manager
          </h1>
          <p className="text-slate-400 text-[10px] sm:text-sm uppercase font-black tracking-widest mt-0.5">Catalog Optimization</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
           <button
             onClick={handleAutoFixInvalid}
             disabled={loading}
             className="flex-1 sm:flex-none px-3 py-2 bg-rose-900/30 text-rose-400 rounded-xl text-[10px] font-black border border-rose-500/30 hover:bg-rose-600 hover:text-white transition-all uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
           >
             {loading && <div className="w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />}
             Inactivate Garbage
           </button>
           <Link href="/inventory" className="flex-1 sm:flex-none px-3 py-2 bg-slate-800 text-slate-300 rounded-xl text-[10px] font-black border border-slate-700 hover:bg-slate-700 transition-all uppercase tracking-widest text-center flex items-center justify-center">Back</Link>
        </div>
      </div>

      {/* Action Bar (Fixed when items selected) */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-slate-900 border border-cyan-500/50 shadow-[0_0_50px_rgba(6,182,212,0.2)] rounded-3xl p-3 sm:p-4 flex items-center gap-3 sm:gap-6 animate-in slide-in-from-bottom-10 w-[90vw] max-w-xl">
           <div className="pl-2 shrink-0">
              <p className="text-[8px] font-black text-cyan-400 uppercase tracking-widest">Selected</p>
              <p className="text-lg font-black text-white">{selectedIds.length}</p>
           </div>
           <div className="h-10 w-px bg-slate-800 shrink-0" />
           <div className="flex-1 flex gap-1.5 sm:gap-2">
              <button onClick={() => setBulkModal({ open: true, mode: 'edit' })} className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-black text-[9px] sm:text-xs uppercase tracking-widest transition-all">Edit</button>
              <button onClick={() => setBulkModal({ open: true, mode: 'delete' })} className="flex-1 py-2.5 bg-rose-900/30 hover:bg-rose-600 text-rose-400 hover:text-white rounded-xl font-black text-[9px] sm:text-xs uppercase tracking-widest transition-all border border-rose-500/30">Delete</button>
           </div>
           <button onClick={() => setSelectedIds([])} className="p-2 text-slate-500 hover:text-white transition-colors shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
           </button>
        </div>
      )}

      {/* Comprehensive Filter Panel */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-4 sm:space-y-6">
         <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="md:col-span-2 relative">
               <input
                 value={search}
                 onChange={e => setSearch(e.target.value)}
                 placeholder="Search by Name, SKU or Brand..."
                 className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-3.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all pl-12"
               />
               <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🔍</span>
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3.5 text-[10px] sm:text-xs font-black uppercase tracking-widest text-slate-300 outline-none">
               <option value="all">All Statuses</option>
               <option value="active">Active Only</option>
               <option value="inactive">Inactive Only</option>
            </select>
            <select value={filterStock} onChange={e => setFilterStatusStock(e.target.value as any)} className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3.5 text-[10px] sm:text-xs font-black uppercase tracking-widest text-slate-300 outline-none">
               <option value="all">Any Stock</option>
               <option value="out">Out of Stock</option>
               <option value="low">Low Stock</option>
               <option value="ok">Healthy Stock</option>
            </select>
         </div>

         <div className="flex flex-wrap gap-2 sm:gap-3">
            <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-2 text-[10px] font-black uppercase text-slate-400 outline-none">
               <option value="all">All Brands</option>
               {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={filterDept} onChange={e => { setFilterDept(e.target.value); setFilterCat('all'); setFilterSub('all'); }} className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-2 text-[10px] font-black uppercase text-slate-400 outline-none">
               <option value="all">All Depts</option>
               {CATEGORY_HIERARCHY.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
            </select>
            <button onClick={() => { setSearch(''); setFilterBrand('all'); setFilterDept('all'); setFilterCat('all'); setFilterSub('all'); setFilterStatus('all'); setFilterStatusStock('all'); setFilterPriceRange('all'); }} className="px-4 py-2 text-[10px] font-black uppercase text-rose-400 hover:text-rose-300 tracking-tighter">Clear All</button>
         </div>
      </div>

      {/* Product Table (Desktop) */}
      <div className="hidden md:block bg-slate-900/50 border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl">
         <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
               <thead className="bg-slate-800/50 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] border-b border-slate-800">
                  <tr>
                    <th className="p-5 w-12 text-center">
                       <input type="checkbox" checked={selectedIds.length === filteredProducts.length && filteredProducts.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-cyan-500" />
                    </th>
                    <th onClick={() => handleSort('name')} className="p-5 cursor-pointer hover:text-white group">Product <SortIcon field="name" /></th>
                    <th onClick={() => handleSort('sku')} className="p-5 cursor-pointer hover:text-white group">Identifiers <SortIcon field="sku" /></th>
                    <th onClick={() => handleSort('brand')} className="p-5 cursor-pointer hover:text-white group">Brand <SortIcon field="brand" /></th>
                    <th onClick={() => handleSort('category')} className="p-5 cursor-pointer hover:text-white group">Category <SortIcon field="category" /></th>
                    <th onClick={() => handleSort('price')} className="p-5 text-right cursor-pointer hover:text-white group">Price <SortIcon field="price" /></th>
                    <th onClick={() => handleSort('stock')} className="p-5 text-right cursor-pointer hover:text-white group">Stock <SortIcon field="stock" /></th>
                    <th onClick={() => handleSort('profit_margin')} className="p-5 text-right cursor-pointer hover:text-white group">Margin <SortIcon field="profit_margin" /></th>
                    <th className="p-5 text-center">Status</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-800/30">
                  {loading ? (
                    <tr><td colSpan={10} className="p-20 text-center text-slate-500 font-bold uppercase tracking-widest animate-pulse">Loading Catalog...</td></tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr><td colSpan={10} className="p-20 text-center text-slate-500 font-bold uppercase tracking-widest">No products found</td></tr>
                  ) : filteredProducts.map(p => {
                    const isSelected = selectedIds.includes(p.id);
                    return (
                      <tr key={p.id} className={`hover:bg-slate-800/30 transition-all ${isSelected ? 'bg-cyan-500/5' : ''}`}>
                        <td className="p-5 text-center">
                           <input type="checkbox" checked={isSelected} onChange={() => toggleSelectOne(p.id)} className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-cyan-500" />
                        </td>
                        <td className="p-5">
                           <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-slate-800 overflow-hidden border border-slate-700/50"><ProductImage imageUrl={p.image_url} size="thumb" alt={p.name} /></div>
                              <p className="font-bold text-slate-100 line-clamp-1 uppercase tracking-tight">{p.name}</p>
                           </div>
                        </td>
                        <td className="p-5 font-mono text-[10px] text-slate-500">{p.sku || '—'}</td>
                        <td className="p-5 text-xs font-black text-slate-500 uppercase tracking-widest">{p.brand || '—'}</td>
                        <td className="p-5">
                           <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{p.category || '—'}</p>
                           <p className="text-[10px] text-slate-600">{p.subcategory}</p>
                        </td>
                        <td className="p-5 text-right font-black text-cyan-400">{formatCurrency(p.price)}</td>
                        <td className="p-5 text-right font-black text-slate-100">{p.current_stock}</td>
                        <td className={`p-5 text-right text-xs font-black ${p.profit_margin > 20 ? 'text-emerald-500' : 'text-rose-400'}`}>{p.profit_margin.toFixed(0)}%</td>
                        <td className="p-5 text-center">
                           <button
                             onClick={() => handleToggleStatus(p.id, p.is_active)}
                             className={`inline-flex px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all active:scale-95 min-w-[75px] justify-center ${
                               p.is_active
                                 ? 'bg-emerald-500 text-white border-emerald-600 shadow-lg shadow-emerald-900/20 hover:bg-emerald-400'
                                 : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-rose-600 hover:text-white hover:border-rose-700'
                             }`}
                           >
                             {p.is_active ? 'Active' : 'Inactive'}
                           </button>
                        </td>
                      </tr>
                    );
                  })}
               </tbody>
            </table>
         </div>
      </div>

      {/* Product List (Mobile) */}
      <div className="md:hidden space-y-4">
         <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
               <thead className="bg-slate-800/50 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] border-b border-slate-800">
                  <tr>
                    <th className="p-5 w-12 text-center">
                       <input type="checkbox" checked={selectedIds.length === filteredProducts.length && filteredProducts.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-cyan-500" />
                    </th>
                    <th onClick={() => handleSort('name')} className="p-5 cursor-pointer hover:text-white group">Product <SortIcon field="name" /></th>
                    <th onClick={() => handleSort('sku')} className="p-5 cursor-pointer hover:text-white group">Identifiers <SortIcon field="sku" /></th>
                    <th onClick={() => handleSort('brand')} className="p-5 cursor-pointer hover:text-white group">Brand <SortIcon field="brand" /></th>
                    <th onClick={() => handleSort('category')} className="p-5 cursor-pointer hover:text-white group">Category <SortIcon field="category" /></th>
                    <th onClick={() => handleSort('price')} className="p-5 text-right cursor-pointer hover:text-white group">Price <SortIcon field="price" /></th>
                    <th onClick={() => handleSort('cost_price')} className="p-5 text-right cursor-pointer hover:text-white group">Cost <SortIcon field="cost_price" /></th>
                    <th onClick={() => handleSort('stock')} className="p-5 text-right cursor-pointer hover:text-white group">Stock <SortIcon field="stock" /></th>
                    <th onClick={() => handleSort('profit_margin')} className="p-5 text-right cursor-pointer hover:text-white group">Margin <SortIcon field="profit_margin" /></th>
                    <th className="p-5 text-center">Status</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-800/30">
                  {loading ? (
                    <tr><td colSpan={10} className="p-20 text-center text-slate-500 font-bold uppercase tracking-widest animate-pulse">Loading Catalog...</td></tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr><td colSpan={10} className="p-20 text-center text-slate-500 font-bold uppercase tracking-widest">No products found matching filters</td></tr>
                  ) : filteredProducts.map(p => {
                    const isSelected = selectedIds.includes(p.id);
                    return (
                      <tr key={p.id} className={`hover:bg-slate-800/30 transition-all ${isSelected ? 'bg-cyan-500/5' : ''}`}>
                        <td className="p-5 text-center">
                           <input type="checkbox" checked={isSelected} onChange={() => toggleSelectOne(p.id)} className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-cyan-500" />
                        </td>
                        <td className="p-5">
                           <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-slate-800 overflow-hidden border border-slate-700/50"><ProductImage imageUrl={p.image_url} size="thumb" alt={p.name} /></div>
                              <p className="font-bold text-slate-100 line-clamp-1">{p.name}</p>
                           </div>
                        </td>
                        <td className="p-5 font-mono text-[10px] text-slate-500">{p.sku || '—'}</td>
                        <td className="p-5 text-xs font-bold text-slate-400">{p.brand || '—'}</td>
                        <td className="p-5">
                           <p className="text-xs text-slate-300 font-medium">{p.category || '—'}</p>
                           <p className="text-[10px] text-slate-600">{p.subcategory}</p>
                        </td>
                        <td className="p-5 text-right font-black text-cyan-400">{formatCurrency(p.price)}</td>
                        <td className="p-5 text-right text-xs text-slate-500">{formatCurrency(p.cost_price || 0)}</td>
                        <td className="p-5 text-right font-bold text-slate-100">{p.current_stock}</td>
                        <td className={`p-5 text-right text-xs font-black ${p.profit_margin > 20 ? 'text-emerald-500' : 'text-rose-400'}`}>{p.profit_margin.toFixed(0)}%</td>
                        <td className="p-5 text-center">
                           <button
                             onClick={() => handleToggleStatus(p.id, p.is_active)}
                             className={`inline-flex px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all active:scale-95 min-w-[75px] justify-center ${
                               p.is_active
                                 ? 'bg-emerald-500 text-white border-emerald-600 shadow-lg shadow-emerald-900/20 hover:bg-emerald-400'
                                 : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-rose-600 hover:text-white hover:border-rose-700'
                             }`}
                           >
                             {p.is_active ? 'Active' : 'Inactive'}
                           </button>
                        </td>
                      </tr>
                    );
                  })}
               </tbody>
            </table>
         </div>
      </div>

      {/* Product List (Mobile) */}
      <div className="lg:hidden space-y-4">
        {loading ? (
           <div className="p-20 text-center text-slate-500 font-bold uppercase tracking-widest animate-pulse">Loading Catalog...</div>
        ) : filteredProducts.length === 0 ? (
           <div className="p-20 text-center text-slate-500 font-bold uppercase tracking-widest">No products found</div>
        ) : (
           filteredProducts.map(p => {
             const isSelected = selectedIds.includes(p.id);
             return (
               <div key={p.id} className={`bg-slate-900/50 border rounded-2xl p-4 transition-all ${isSelected ? 'border-cyan-500/50 bg-cyan-500/5 shadow-lg shadow-cyan-900/10' : 'border-slate-800'}`}>
                 <div className="flex gap-4">
                   <div className="flex flex-col items-center gap-3">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelectOne(p.id)} className="w-5 h-5 rounded border-slate-700 bg-slate-950 text-cyan-500" />
                      <div className="w-14 h-14 rounded-xl bg-slate-800 overflow-hidden border border-slate-700/50"><ProductImage imageUrl={p.image_url} size="thumb" alt={p.name} /></div>
                   </div>
                   <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <h3 className="font-bold text-slate-100 text-sm line-clamp-2">{p.name}</h3>
                        <button
                          onClick={() => handleToggleStatus(p.id, p.is_active)}
                          className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border transition-all ${
                            p.is_active ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {p.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                         <span className="text-[10px] font-mono text-slate-500 uppercase">{p.sku || 'NO SKU'}</span>
                         <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{p.brand || 'No Brand'}</span>
                      </div>
                      <div className="mt-2 text-[10px] text-slate-400 font-medium">
                        {p.category} {p.subcategory && `· ${p.subcategory}`}
                      </div>
                   </div>
                 </div>

                 <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-slate-800/50">
                    <div>
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Price</p>
                      <p className="text-sm font-black text-cyan-400">{formatCurrency(p.price)}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Cost</p>
                      <p className="text-xs font-bold text-slate-300">{formatCurrency(p.cost_price || 0)}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Stock</p>
                      <p className="text-sm font-black text-slate-100">{p.current_stock}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Margin</p>
                      <p className={`text-xs font-black ${p.profit_margin > 20 ? 'text-emerald-500' : 'text-rose-400'}`}>{p.profit_margin.toFixed(0)}%</p>
                    </div>
                 </div>
               </div>
             );
           })
        )}
      </div>

      <BulkEditModal
        isOpen={bulkModal.open}
        mode={bulkModal.mode}
        onClose={() => setBulkModal({ ...bulkModal, open: false })}
        selectedProductIds={selectedIds}
        onSuccess={() => {
          setSelectedIds([]);
          loadData();
        }}
      />
    </div>
  );
}

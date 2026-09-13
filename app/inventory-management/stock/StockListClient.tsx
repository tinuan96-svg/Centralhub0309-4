'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { supabase } from '@/lib/supabase';
import { InventoryManagementService, MovementType } from '@/lib/services/inventory/inventoryManagementService';
import ProductImage from '@/components/ProductImage';
import { formatCurrency } from '@/lib/utils/currency';
import ComprehensiveProductForm from '@/components/ComprehensiveProductForm';
import ProductImportModal from '@/components/ProductImportModal';

type StockFilter = 'all' | 'low' | 'out';

export default function StockListClient({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterBrand, setFilterBrand] = useState('all');
  const [sortField, setSortField] = useState<string>('name');
  const [sortOrder, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [adjModal, setAdjModal] = useState<{ isOpen: boolean; product: any | null }>({ isOpen: false, product: null });
  const [adjData, setAdjData] = useState({ amount: 0, type: 'MANUAL_ADJUSTMENT' as MovementType, reason: '', mode: 'add' as 'add' | 'replace' });
  const [isSaving, setIsSaving] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | undefined>();
  const [showImportModal, setShowImportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadStock = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const [prodResult, invResult] = await Promise.all([
        supabase
          .from('products')
          .select('*')
          .eq('is_active', true)
          .or('is_deleted.is.null,is_deleted.eq.false')
          .order('name'),
        supabase.from('central_inventory').select('product_id, stock_quantity, low_stock_threshold'),
      ]);
      if (prodResult.error) throw prodResult.error;
      if (invResult.error) throw invResult.error;

      const stockByProduct: Record<string, number> = {};
      const thresholdByProduct: Record<string, number> = {};
      (invResult.data || []).forEach((row: any) => {
        stockByProduct[row.product_id] = Number(row.stock_quantity ?? 0);
        thresholdByProduct[row.product_id] = Number(row.low_stock_threshold ?? 5);
      });

      setProducts((prodResult.data || []).map((product: any) => ({
        ...product,
        stock: stockByProduct[product.id] ?? Number(product.stock || 0),
        low_stock_threshold: thresholdByProduct[product.id] ?? Number(product.low_stock_threshold || 5),
      })));
      setLastUpdated(new Date());
    } catch (error: any) {
      console.error('[StockList] load failed:', error?.message || error);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('filter');
    if (requested === 'low' || requested === 'out') setFilter(requested);
    loadStock(true);

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const queueRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => loadStock(false), 300);
    };
    const channel = supabase
      .channel('inventory-stock-list-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, queueRefresh)
      .subscribe();
    const fallback = setInterval(() => loadStock(false), 30000);

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [loadStock]);

  const categories = useMemo(() => Array.from(new Set(products.map(product => product.category).filter(Boolean))) as string[], [products]);
  const brands = useMemo(() => Array.from(new Set(products.map(product => product.brand).filter(Boolean))) as string[], [products]);

  const handleSort = (field: string) => {
    if (sortField === field) setSortDirection(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('asc'); }
  };

  const filtered = useMemo(() => products
    .filter(product => {
      const q = search.trim().toLowerCase();
      const name = String(product.name || '').toLowerCase();
      const sku = String(product.sku || '').toLowerCase();
      const gtin = String(product.gtin || product.barcode || '').toLowerCase();
      const stock = Number(product.stock || 0);
      const threshold = Number(product.low_stock_threshold || 5);
      const matchesSearch = !q || name.includes(q) || sku.includes(q) || gtin.includes(q);
      const matchesStock = filter === 'all' || (filter === 'out' && stock <= 0) || (filter === 'low' && stock > 0 && stock <= threshold);
      const matchesCategory = filterCategory === 'all' || product.category === filterCategory;
      const matchesBrand = filterBrand === 'all' || product.brand === filterBrand;
      return matchesSearch && matchesStock && matchesCategory && matchesBrand;
    })
    .sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];
      if (sortField === 'available') { aValue = Number(a.stock || 0); bValue = Number(b.stock || 0); }
      if (sortField === 'value') { aValue = Number(a.stock || 0) * Number(a.cost_price || 0); bValue = Number(b.stock || 0) * Number(b.cost_price || 0); }
      if (aValue === bValue) return 0;
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;
      const direction = sortOrder === 'asc' ? 1 : -1;
      return aValue < bValue ? -direction : direction;
    }), [products, search, filter, filterCategory, filterBrand, sortField, sortOrder]);

  const handleAdjust = async () => {
    if (!adjModal.product || isSaving) return;
    setIsSaving(true);
    try {
      const current = Number(adjModal.product.stock || 0);
      const finalChange = adjData.mode === 'replace' ? adjData.amount - current : adjData.amount;
      await InventoryManagementService.adjustStock({
        productId: adjModal.product.id,
        changeAmount: finalChange,
        type: adjData.type,
        reason: adjData.reason,
      });
      await loadStock(false);
      setAdjModal({ isOpen: false, product: null });
      setAdjData({ amount: 0, type: 'MANUAL_ADJUSTMENT', reason: '', mode: 'add' });
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditClick = (productId: string) => { setEditingProductId(productId); setShowEditForm(true); };
  const handleEditSave = async () => { await loadStock(false); setShowEditForm(false); setEditingProductId(undefined); };

  const handleExportCSV = () => {
    setIsExporting(true);
    try {
      const csv = Papa.unparse(filtered.map(product => ({
        name: product.name || '', sku: product.sku || '', gtin: product.gtin || product.barcode || '',
        brand: product.brand || '', category: product.category || '', price: product.price || 0,
        cost_price: product.cost_price || 0, stock: product.stock || 0, unit: product.unit || '',
        pack_size: product.pack_size || 1, pack_unit: product.pack_unit || '',
        warehouse_location: product.warehouse_location || '', low_stock_threshold: product.low_stock_threshold || 5,
        reorder_level: product.reorder_level || 10, expiry_date: product.expiry_date || '', is_active: 'true',
        description: product.description || '', image_url: product.image_url || '',
      })));
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `active_inventory_${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      alert(`Failed to export CSV: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const clearFilters = () => { setSearch(''); setFilter('all'); setFilterCategory('all'); setFilterBrand('all'); };
  const statusFor = (product: any) => {
    const stock = Number(product.stock || 0);
    const threshold = Number(product.low_stock_threshold || 5);
    const reorder = Number(product.reorder_level || 10);
    if (stock <= 0) return 'OUT';
    if (stock <= threshold) return 'LOW';
    if (stock <= reorder) return 'REORDER';
    return 'HEALTHY';
  };
  const statusClass = (status: string) => status === 'OUT'
    ? 'bg-rose-500 text-white border-rose-600'
    : status === 'LOW'
      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      : status === 'REORDER'
        ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

  if (showEditForm) {
    return <div className="p-4 fold-inner:p-6 max-w-[1400px] mx-auto">
      <div className="mb-6 flex items-center gap-4">
        <button onClick={() => { setShowEditForm(false); setEditingProductId(undefined); }} className="w-10 h-10 rounded-xl bg-slate-800 text-slate-300">←</button>
        <h1 className="text-xl font-bold text-slate-100">Edit Product Catalog Details</h1>
      </div>
      <ComprehensiveProductForm productId={editingProductId} onSave={handleEditSave} onCancel={() => { setShowEditForm(false); setEditingProductId(undefined); }} />
    </div>;
  }

  if (loading) return <div className="p-8 text-center text-slate-400">Loading active stock registry...</div>;

  return <main className="mx-auto max-w-[1900px] min-w-0 space-y-5 p-4 pb-24 fold-inner:p-5 fold-inner:pb-8 lg:p-6">
    <header className="flex flex-col gap-3 fold-inner:flex-row fold-inner:items-center fold-inner:justify-between">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Stock Inventory Registry</h1>
        <p className="text-xs text-slate-500 mt-1">Showing {filtered.length} of {products.length} active products · canonical CentralHub stock{lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={handleExportCSV} disabled={isExporting} className="px-4 py-2 bg-slate-800 text-slate-300 text-sm rounded-lg border border-slate-700 disabled:opacity-50">{isExporting ? 'Exporting...' : 'Export CSV'}</button>
        <Link href="/inventory-management/stock/bulk" className="px-4 py-2 bg-slate-800 text-cyan-400 text-sm rounded-lg border border-cyan-500/30 font-semibold">Bulk Manual Entry</Link>
        <button onClick={() => setShowImportModal(true)} className="px-4 py-2 bg-cyan-600 text-white text-sm rounded-lg font-semibold">Bulk Import</button>
      </div>
    </header>

    <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 space-y-4 shadow-xl">
      <div className="flex flex-col fold-inner:flex-row gap-3">
        <div className="relative flex-1 min-w-0"><input type="text" placeholder="Search SKU, barcode or product..." value={search} onChange={event => setSearch(event.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white" /><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span></div>
        <div className="grid grid-cols-3 gap-2 fold-inner:flex">
          {(['all', 'low', 'out'] as StockFilter[]).map(value => <button key={value} onClick={() => setFilter(value)} className={`px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-wider border ${filter === value ? 'bg-cyan-600/10 text-cyan-400 border-cyan-500/30' : 'bg-slate-800 text-slate-500 border-transparent'}`}>{value}</button>)}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <select value={filterCategory} onChange={event => setFilterCategory(event.target.value)} className="min-w-[180px] flex-1 fold-inner:flex-none px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold uppercase text-slate-300"><option value="all">All Categories</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select>
        <select value={filterBrand} onChange={event => setFilterBrand(event.target.value)} className="min-w-[180px] flex-1 fold-inner:flex-none px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold uppercase text-slate-300"><option value="all">All Brands</option>{brands.map(brand => <option key={brand} value={brand}>{brand}</option>)}</select>
        {(search || filter !== 'all' || filterCategory !== 'all' || filterBrand !== 'all') && <button onClick={clearFilters} className="px-4 py-2 text-xs font-black text-rose-400 uppercase">Clear All</button>}
      </div>
    </section>

    <section className="hidden fold-inner:block bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[960px]">
        <thead className="bg-slate-800/50 border-b border-slate-700/50"><tr>
          <th onClick={() => handleSort('name')} className="px-4 py-4 text-left text-[10px] uppercase tracking-widest text-slate-400 cursor-pointer">Product</th>
          <th className="px-4 py-4 text-left text-[10px] uppercase tracking-widest text-slate-400">Identifiers</th>
          <th className="px-4 py-4 text-right text-[10px] uppercase tracking-widest text-slate-400">Costs & Margins</th>
          <th onClick={() => handleSort('stock')} className="px-4 py-4 text-right text-[10px] uppercase tracking-widest text-slate-400 cursor-pointer">Physical Stock</th>
          <th className="px-4 py-4 text-left text-[10px] uppercase tracking-widest text-slate-400">Location</th>
          <th className="px-4 py-4 text-center text-[10px] uppercase tracking-widest text-slate-400">Status</th>
          <th className="px-4 py-4 text-center text-[10px] uppercase tracking-widest text-slate-400">Actions</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-800/50">{filtered.map(product => {
          const stock = Number(product.stock || 0); const status = statusFor(product);
          const profit = Number(product.price || 0) - Number(product.cost_price || 0); const margin = Number(product.price || 0) > 0 ? profit / Number(product.price) * 100 : 0;
          return <tr key={product.id} className="hover:bg-slate-800/30">
            <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-slate-800 overflow-hidden"><ProductImage imageUrl={product.image_url} size="thumb" alt={product.name} /></div><div><p className="font-bold text-slate-200">{product.name}</p><p className="text-[10px] text-slate-500 uppercase">{product.brand || 'No Brand'}</p></div></div></td>
            <td className="px-4 py-3 font-mono text-[10px] text-slate-500"><p className="text-slate-300 font-bold">SKU: {product.sku || '—'}</p><p>EAN: {product.gtin || product.barcode || '—'}</p></td>
            <td className="px-4 py-3 text-right"><p className="text-xs font-mono text-slate-400">Cost: {formatCurrency(product.cost_price || 0)}</p><p className="text-xs font-bold text-cyan-400">Sell: {formatCurrency(product.price || 0)}</p><span className={`text-[9px] font-black ${margin > 20 ? 'text-emerald-500' : 'text-rose-400'}`}>{margin.toFixed(0)}% MARGIN</span></td>
            <td className={`px-4 py-3 text-right font-black font-mono text-lg ${status === 'OUT' ? 'text-rose-400' : status === 'LOW' ? 'text-amber-400' : 'text-slate-300'}`}>{stock}</td>
            <td className="px-4 py-3 text-[10px] uppercase text-slate-400"><p className="text-slate-200">{product.warehouse_location || product.location_code || '—'}</p><p className="text-slate-600">MAIN</p></td>
            <td className="px-4 py-3 text-center"><span className={`inline-flex px-2 py-1 rounded-md text-[8px] font-black uppercase border ${statusClass(status)}`}>{status}</span></td>
            <td className="px-4 py-3"><div className="flex justify-center gap-2"><button onClick={() => setAdjModal({ isOpen: true, product })} className="p-2 bg-slate-800 text-slate-300 rounded-lg" title="Adjust">＋</button><button onClick={() => handleEditClick(product.id)} className="p-2 bg-cyan-600/10 text-cyan-400 rounded-lg" title="Edit">✎</button><Link href={`/inventory-management/stock/${product.id}`} className="p-2 bg-slate-800 text-slate-300 rounded-lg" title="Ledger">→</Link></div></td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>

    <section className="fold-inner:hidden space-y-3">{filtered.map(product => {
      const status = statusFor(product); const stock = Number(product.stock || 0);
      return <article key={product.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="flex gap-3"><div className="w-14 h-14 rounded-xl bg-slate-800 overflow-hidden"><ProductImage imageUrl={product.image_url} alt={product.name} size="thumb" /></div><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><h3 className="font-bold text-slate-100 truncate">{product.name}</h3><span className={`shrink-0 inline-flex px-2 py-1 rounded text-[8px] font-black border ${statusClass(status)}`}>{status}</span></div><p className="text-[10px] text-slate-500 uppercase">{product.brand || 'No Brand'} · {product.sku || 'No SKU'}</p></div></div>
        <div className="grid grid-cols-3 gap-3 border-t border-slate-800/50 pt-3"><div><p className="text-[9px] text-slate-500 uppercase">Physical</p><p className="font-black text-lg">{stock}</p></div><div><p className="text-[9px] text-slate-500 uppercase">Sell</p><p className="font-bold text-cyan-400">{formatCurrency(product.price || 0)}</p></div><div><p className="text-[9px] text-slate-500 uppercase">Location</p><p className="text-xs font-bold text-slate-300 truncate">{product.warehouse_location || product.location_code || '—'}</p></div></div>
        <div className="flex justify-between"><div className="flex gap-2"><button onClick={() => setAdjModal({ isOpen: true, product })} className="px-3 py-2 bg-slate-800 rounded-lg text-[9px] font-black uppercase">Adjust</button><button onClick={() => handleEditClick(product.id)} className="px-3 py-2 bg-slate-800 text-cyan-400 rounded-lg text-[9px] font-black uppercase">Edit</button></div><Link href={`/inventory-management/stock/${product.id}`} className="text-[10px] text-slate-400">View ledger →</Link></div>
      </article>;
    })}{filtered.length === 0 && <div className="py-16 text-center text-slate-500">No active products match these filters.</div>}</section>

    {adjModal.isOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"><div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-md shadow-2xl">
      <div className="mb-5 flex justify-between gap-3"><div><h2 className="text-lg font-bold text-white uppercase">Stock Adjustment</h2><p className="text-sm text-slate-400">{adjModal.product?.name}</p></div><span className="px-3 py-1 bg-slate-800 rounded-full text-xs font-mono text-cyan-400 h-fit">Stock: {adjModal.product?.stock || 0}</span></div>
      <div className="space-y-4">
        <div className="flex bg-slate-800 p-1.5 rounded-2xl"><button onClick={() => setAdjData(data => ({ ...data, mode: 'add' }))} className={`flex-1 py-2 text-[10px] font-black rounded-xl ${adjData.mode === 'add' ? 'bg-cyan-600 text-white' : 'text-slate-500'}`}>+/- CHANGE</button><button onClick={() => setAdjData(data => ({ ...data, mode: 'replace' }))} className={`flex-1 py-2 text-[10px] font-black rounded-xl ${adjData.mode === 'replace' ? 'bg-amber-600 text-white' : 'text-slate-500'}`}>REPLACE TOTAL</button></div>
        <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-2">{adjData.mode === 'replace' ? 'New Physical Count' : 'Change Quantity'}</label><input type="number" value={adjData.amount} onChange={event => setAdjData(data => ({ ...data, amount: parseInt(event.target.value) || 0 }))} className="w-full px-5 py-4 bg-slate-800 border border-slate-700 rounded-2xl text-white text-3xl font-bold" /></div>
        <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-2">Reason</label><select value={adjData.type} onChange={event => setAdjData(data => ({ ...data, type: event.target.value as MovementType }))} className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white"><option value="MANUAL_ADJUSTMENT">Manual Adjustment</option><option value="PURCHASE">Stock Purchase</option><option value="RETURN">Customer Return</option><option value="DAMAGE">Damaged / Written Off</option><option value="EXPIRED">Expired</option></select></div>
        <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-2">Audit Notes</label><textarea value={adjData.reason} onChange={event => setAdjData(data => ({ ...data, reason: event.target.value }))} className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white h-20" placeholder="Explain the stock change..." /></div>
      </div>
      <div className="mt-6 flex gap-3"><button onClick={handleAdjust} disabled={isSaving || (adjData.amount === 0 && adjData.mode === 'add') || !adjData.reason.trim()} className="flex-[2] py-3 bg-cyan-600 disabled:opacity-50 text-white rounded-xl font-black text-sm">{isSaving ? 'UPDATING...' : 'APPLY CHANGE'}</button><button onClick={() => setAdjModal({ isOpen: false, product: null })} className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl">Cancel</button></div>
    </div></div>}

    <ProductImportModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} onImportComplete={() => loadStock(false)} />
  </main>;
}

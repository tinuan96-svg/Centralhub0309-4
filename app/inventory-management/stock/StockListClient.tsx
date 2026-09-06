'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { InventoryManagementService, MovementType } from '@/lib/services/inventory/inventoryManagementService';
import ProductImage from '@/components/ProductImage';
import { formatCurrency } from '@/lib/utils/currency';
import Link from 'next/link';
import Papa from 'papaparse';
import ComprehensiveProductForm from '@/components/ComprehensiveProductForm';
import ProductImportModal from '@/components/ProductImportModal';

export default function StockListClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterBrand, setFilterBrand] = useState('all');
  const [sortField, setSortField] = useState<string>('name');
  const [sortOrder, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [adjModal, setAdjModal] = useState<{ isOpen: boolean; product: any | null }>({ isOpen: false, product: null });
  const [adjData, setAdjData] = useState({ amount: 0, type: 'MANUAL_ADJUSTMENT' as MovementType, reason: '', mode: 'add' as 'add' | 'replace' });
  const [isSaving, setIsSaving] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | undefined>();
  const [reservedMap, setReservedMap] = useState<Record<string, number>>({});
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [showImportModal, setShowImportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const loadStock = useCallback(async () => {
    setLoading(true);
    try {
      const [prodResult, invResult] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('central_inventory').select('product_id, stock_quantity, low_stock_threshold'),
      ]);
      if (prodResult.error) throw prodResult.error;
      const sMap: Record<string, number> = {};
      const tMap: Record<string, number> = {};
      (invResult.data || []).forEach((row: any) => {
        sMap[row.product_id] = row.stock_quantity !== null ? Number(row.stock_quantity) : 0;
        tMap[row.product_id] = row.low_stock_threshold !== null ? Number(row.low_stock_threshold) : 5;
      });
      const merged = (prodResult.data || []).map((p: any) => ({
        ...p,
        stock: sMap[p.id] !== undefined ? sMap[p.id] : Number(p.stock || 0),
        low_stock_threshold: tMap[p.id] !== undefined ? tMap[p.id] : 5,
      }));
      setProducts(merged);
    } catch (e: any) { console.error('loadStock error:', e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadStock(); }, [loadStock]);

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort();
  const brands = Array.from(new Set(products.map(p => p.brand).filter(Boolean))).sort();

  const handleSort = (field: string) => {
    if (sortField === field) { setSortDirection(sortOrder === 'asc' ? 'desc' : 'asc'); }
    else { setSortField(field); setSortDirection('asc'); }
  };

  const filtered = products
    .filter(p => {
      const q = search.toLowerCase();
      const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.gtin || '').toLowerCase().includes(q);
      const stock = Number(p.stock || 0);
      const available = stock; // Reserved system removed
      const threshold = Number(p.low_stock_threshold || 5);
      const matchFilter = filter === 'all' || (filter === 'out' && available <= 0) || (filter === 'low' && available > 0 && available <= threshold);
      const matchCategory = filterCategory === 'all' || p.category === filterCategory;
      const matchBrand = filterBrand === 'all' || p.brand === filterBrand;
      return matchSearch && matchFilter && matchCategory && matchBrand;
    })
    .sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];
      if (sortField === 'available') { aVal = (a.stock || 0); bVal = (b.stock || 0); }
      else if (sortField === 'value') { aVal = (a.stock || 0) * (a.cost_price || 0); bVal = (b.stock || 0) * (b.cost_price || 0); }
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const modifier = sortOrder === 'asc' ? 1 : -1;
      return aVal < bVal ? -1 * modifier : 1 * modifier;
    });

  const handleAdjust = async () => {
    if (!adjModal.product || isSaving) return;
    setIsSaving(true);
    try {
      const finalChange = adjData.mode === 'replace' ? adjData.amount - (adjModal.product.stock || 0) : adjData.amount;
      await InventoryManagementService.adjustStock({ productId: adjModal.product.id, changeAmount: finalChange, type: adjData.type, reason: adjData.reason });
      await loadStock();
      setAdjModal({ isOpen: false, product: null });
      setAdjData({ amount: 0, type: 'MANUAL_ADJUSTMENT', reason: '', mode: 'add' });
    } catch (e: any) { alert(e.message); }
    finally { setIsSaving(false); }
  };

  const handleEditClick = (productId: string) => { setEditingProductId(productId); setShowEditForm(true); };
  const handleEditSave = async () => { await loadStock(); setShowEditForm(false); setEditingProductId(undefined); };

  const handleExportCSV = () => {
    setIsExporting(true);
    try {
      const csvData = filtered.map(p => ({
        name: p.name || '',
        sku: p.sku || '',
        gtin: p.gtin || p.barcode || '',
        brand: p.brand || '',
        category: p.category || '',
        price: p.price || 0,
        cost_price: p.cost_price || 0,
        stock: p.stock || 0,
        unit: p.unit || '',
        pack_size: p.pack_size || 1,
        pack_unit: p.pack_unit || '',
        warehouse_location: p.warehouse_location || '',
        low_stock_threshold: p.low_stock_threshold || 5,
        reorder_level: p.reorder_level || 10,
        expiry_date: p.expiry_date || '',
        is_active: p.is_active !== false ? 'true' : 'false',
        description: p.description || '',
        image_url: p.image_url || '',
      }));
      const csv = Papa.unparse(csvData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `products_export_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error('Export error:', e.message);
      alert('Failed to export CSV: ' + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <span className="ml-1 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">⇅</span>;
    return sortOrder === 'asc' ? <span className="ml-1 text-cyan-400">↑</span> : <span className="ml-1 text-cyan-400">↓</span>;
  };

  if (showEditForm) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <div className="mb-6 flex items-center gap-4">
          <button onClick={() => { setShowEditForm(false); setEditingProductId(undefined); }} className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-all">←</button>
          <h1 className="text-xl font-bold text-slate-100">Edit Product Catalog Details</h1>
        </div>
        <ComprehensiveProductForm productId={editingProductId} onSave={handleEditSave} onCancel={() => { setShowEditForm(false); setEditingProductId(undefined); }} />
      </div>
    );
  }

  if (loading) return <div className="p-8 text-center text-slate-400">Loading Enterprise Stock List...</div>;

  return (
    <div className="p-6 max-w-[1900px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Stock Inventory Registry</h1>
          <p className="text-xs text-slate-500 mt-1">Showing {filtered.length} products with real-time multi-store stock levels</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportCSV} disabled={isExporting} className="px-4 py-2 bg-slate-800 text-slate-300 text-sm rounded-lg hover:bg-slate-700 transition-all border border-slate-700 disabled:opacity-50">{isExporting ? 'Exporting...' : 'Export CSV'}</button>
          <Link href="/inventory-management/stock/bulk" className="px-4 py-2 bg-slate-800 text-cyan-400 text-sm rounded-lg hover:bg-slate-700 transition-all border border-cyan-500/30 font-semibold">Bulk Manual Entry</Link>
          <button onClick={() => setShowImportModal(true)} className="px-4 py-2 bg-cyan-600 text-white text-sm rounded-lg hover:bg-cyan-500 transition-all shadow-lg shadow-cyan-900/20 font-semibold">Bulk Import</button>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 space-y-4 shadow-xl">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <input type="text" placeholder="Search SKU, Barcode, Product..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">🔍</span>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            {['all', 'low', 'out'].map(f => (
              <button key={f} onClick={() => setFilter(f as any)} className={`flex-1 md:flex-none px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border ${filter === f ? 'bg-cyan-600/10 text-cyan-400 border-cyan-500/30 shadow-lg' : 'bg-slate-800 text-slate-500 border-transparent hover:border-slate-700'}`}>{f}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold uppercase text-slate-300 focus:outline-none min-w-[200px]">
            <option value="all">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} className="px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold uppercase text-slate-300 focus:outline-none min-w-[200px]">
            <option value="all">All Brands</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          {(search || filter !== 'all' || filterCategory !== 'all' || filterBrand !== 'all') && (
            <button onClick={() => { setSearch(''); setFilter('all'); setFilterCategory('all'); setFilterBrand('all'); }} className="px-4 py-2 text-xs font-black text-rose-400 uppercase tracking-widest hover:text-rose-300 transition-colors">Clear All</button>
          )}
        </div>
      </div>

      <div className="hidden fold-inner:block bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/50 border-b border-slate-700/50">
              <tr>
                <th onClick={() => handleSort('name')} className="group px-4 py-4 text-left font-bold text-slate-400 uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors"><div className="flex items-center">Product <SortIcon field="name" /></div></th>
                <th onClick={() => handleSort('sku')} className="group px-4 py-4 text-left font-bold text-slate-400 uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors"><div className="flex items-center">Identifiers <SortIcon field="sku" /></div></th>
                <th className="px-4 py-4 text-right font-bold text-slate-400 uppercase tracking-widest text-[10px]">Costs & Margins</th>
                <th onClick={() => handleSort('stock')} className="group px-4 py-4 text-right font-bold text-slate-400 uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors"><div className="flex items-center justify-end">Physical Stock <SortIcon field="stock" /></div></th>
                <th className="px-4 py-4 text-left font-bold text-slate-400 uppercase tracking-widest text-[10px]">Location</th>
                <th className="px-4 py-4 text-center font-bold text-slate-400 uppercase tracking-widest text-[10px]">Status</th>
                <th className="px-4 py-4 text-center font-bold text-slate-400 uppercase tracking-widest text-[10px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filtered.map(p => {
                const stock = Number(p.stock || 0);
                const available = stock; // Reserved system removed
                const threshold = Number(p.low_stock_threshold || 5);
                const isOut = available <= 0;
                const isLow = !isOut && available <= threshold;
                const isReorder = !isOut && !isLow && available <= Number(p.reorder_level || 10);
                const profit = Number(p.price || 0) - Number(p.cost_price || 0);
                const margin = p.price > 0 ? (profit / p.price) * 100 : 0;
                return (
                  <tr key={p.id} className={`hover:bg-slate-800/30 transition-colors border-l-4 ${isOut ? 'border-l-rose-600 bg-rose-500/5' : isLow ? 'border-l-amber-500 bg-amber-500/5' : isReorder ? 'border-l-orange-400 bg-orange-500/5' : 'border-l-emerald-500/50'}`}>
                    <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-slate-800 overflow-hidden flex-shrink-0 border border-slate-700/50"><ProductImage imageUrl={p.image_url} size="thumb" alt={p.name} /></div><div><p className="font-bold text-slate-200 line-clamp-1">{p.name}</p><p className="text-[10px] text-slate-500 uppercase font-black tracking-tight">{p.brand || 'No Brand'}</p></div></div></td>
                    <td className="px-4 py-3 font-mono text-[10px] text-slate-500 space-y-0.5"><p className="text-slate-300 font-bold">SKU: {p.sku || '—'}</p><p>EAN: {p.gtin || p.barcode || '—'}</p></td>
                    <td className="px-4 py-3 text-right"><p className="text-xs font-mono text-slate-400">Cost: {formatCurrency(p.cost_price || 0)}</p><p className="text-xs font-bold text-cyan-400">Sell: {formatCurrency(p.price || 0)}</p><span className={`text-[9px] font-black uppercase ${margin > 20 ? 'text-emerald-500' : 'text-rose-400'}`}>{margin.toFixed(0)}% Margin</span></td>
                    <td className={`px-4 py-3 text-right font-black font-mono text-lg ${isOut ? 'text-rose-400' : isLow ? 'text-amber-400' : 'text-slate-300'}`}>{stock}</td>
                    <td className="px-4 py-3 text-[10px] text-slate-400 font-bold uppercase"><p className="text-slate-200">{p.warehouse_location || '—'}</p><p className="text-slate-600">WH-MAIN</p></td>
                    <td className="px-4 py-3 text-center"><span className={`inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${isOut ? 'bg-rose-500 text-white border-rose-600 shadow-[0_0_10px_rgba(244,63,94,0.3)]' : isLow ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : isReorder ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>{isOut ? 'OUT' : isLow ? 'LOW' : isReorder ? 'REORDER' : 'HEALTHY'}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => setAdjModal({ isOpen: true, product: p })} className="p-1.5 bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700 hover:text-white transition-all shadow-sm" title="Quick Adjust"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg></button>
                        <button onClick={() => handleEditClick(p.id)} className="p-1.5 bg-cyan-600/10 text-cyan-400 rounded-lg hover:bg-cyan-600/20 transition-all border border-cyan-500/20" title="Edit Catalog"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                        <Link href={`/inventory-management/stock/${p.id}`} className="p-1.5 bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700 hover:text-white transition-all" title="View Ledger"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card view */}
      <div className="fold-inner:hidden space-y-4">
        {filtered.map(p => {
          const stock = Number(p.stock || 0);
          const available = stock;
          const threshold = Number(p.low_stock_threshold || 5);
          const isOut = available <= 0;
          const isLow = !isOut && available <= threshold;
          const isReorder = !isOut && !isLow && available <= Number(p.reorder_level || 10);
          const profit = Number(p.price || 0) - Number(p.cost_price || 0);
          const margin = p.price > 0 ? (profit / p.price) * 100 : 0;

          return (
            <div key={p.id} className={`bg-slate-900/50 border border-slate-800 rounded-2xl p-4 space-y-4 border-l-4 ${isOut ? 'border-l-rose-600' : isLow ? 'border-l-amber-500' : isReorder ? 'border-l-orange-400' : 'border-l-emerald-500/50'}`}>
              <div className="flex gap-4">
                <div className="w-16 h-16 rounded-xl bg-slate-800 overflow-hidden border border-slate-700/50 flex-shrink-0 shadow-lg">
                  <ProductImage imageUrl={p.image_url} alt={p.name} size="thumb" />
                </div>
                <div className="flex-1 min-w-0">
                   <div className="flex justify-between items-start gap-2">
                      <h3 className="font-bold text-slate-100 text-sm truncate">{p.name}</h3>
                      <span className={`inline-flex px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${isOut ? 'bg-rose-500 text-white border-rose-600' : isLow ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : isReorder ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                        {isOut ? 'OUT' : isLow ? 'LOW' : isReorder ? 'REORDER' : 'OK'}
                      </span>
                   </div>
                   <p className="text-[10px] text-slate-500 uppercase font-black tracking-tight mt-1">{p.brand || 'No Brand'}</p>
                   <p className="text-[10px] font-mono text-slate-400 mt-0.5">SKU: {p.sku || '—'}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-800/50">
                <div className="space-y-0.5">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Physical</p>
                  <p className={`text-lg font-black font-mono ${isOut ? 'text-rose-400' : isLow ? 'text-amber-400' : 'text-slate-200'}`}>{stock}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Sell Price</p>
                  <p className="text-sm font-bold text-cyan-400">{formatCurrency(p.price || 0)}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Location</p>
                  <p className="text-[10px] font-bold text-slate-300 uppercase truncate">{p.warehouse_location || '—'}</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <div className="flex gap-1.5">
                  <button onClick={() => setAdjModal({ isOpen: true, product: p })} className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-700">Adjust</button>
                  <button onClick={() => handleEditClick(p.id)} className="px-3 py-1.5 bg-slate-800 text-cyan-400 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-700">Edit</button>
                </div>
                <Link href={`/inventory-management/stock/${p.id}`} className="text-[10px] font-bold text-slate-500 hover:text-white uppercase tracking-tighter">View Ledger →</Link>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="py-20 text-center text-slate-500">No products match filters</div>}
      </div>

      {adjModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-md shadow-2xl">
            <div className="mb-6 flex justify-between items-start"><div><h2 className="text-lg font-bold text-white uppercase tracking-tight">Stock Adjustment</h2><p className="text-sm text-slate-400 mt-1">{adjModal.product?.name}</p></div><span className="px-3 py-1 bg-slate-800 rounded-full text-xs font-mono text-cyan-400 border border-slate-700">Stock: {adjModal.product?.stock || 0}</span></div>
            <div className="space-y-4">
              <div className="flex bg-slate-800 p-1.5 rounded-2xl mb-4"><button onClick={() => setAdjData(d => ({ ...d, mode: 'add' }))} className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all uppercase tracking-widest ${adjData.mode === 'add' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-200'}`}>+/- CHANGE</button><button onClick={() => setAdjData(d => ({ ...d, mode: 'replace' }))} className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all uppercase tracking-widest ${adjData.mode === 'replace' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-200'}`}>REPLACE TOTAL</button></div>
              <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{adjData.mode === 'replace' ? 'New Physical Count' : 'Change Quantity'}</label>{adjData.mode === 'add' && (<div className="flex gap-2 mb-4"><button onClick={() => setAdjData(d => ({ ...d, amount: 10 }))} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-xl text-xs font-bold border border-slate-700 transition-all">+10</button><button onClick={() => setAdjData(d => ({ ...d, amount: -5 }))} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded-xl text-xs font-bold border border-slate-700 transition-all">-5</button><button onClick={() => setAdjData(d => ({ ...d, amount: 0 }))} className="px-4 py-2 bg-slate-800 text-slate-500 rounded-xl text-xs font-bold border border-slate-700 transition-all">CLR</button></div>)}<input type="number" value={adjData.amount} onChange={e => setAdjData(d => ({ ...d, amount: parseInt(e.target.value) || 0 }))} className="w-full px-5 py-4 bg-slate-800 border border-slate-700 rounded-2xl text-white text-3xl font-bold focus:outline-none focus:ring-2 focus:ring-cyan-500/50" placeholder="0" /></div>
              <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Adjustment Reason</label><select value={adjData.type} onChange={e => setAdjData(d => ({ ...d, type: e.target.value as any }))} className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"><option value="MANUAL_ADJUSTMENT">Manual Adjustment</option><option value="PURCHASE">Stock Purchase (Receive)</option><option value="RETURN">Customer Return (+)</option><option value="DAMAGE">Damaged / Written Off (-)</option><option value="EXPIRED">Expired (-)</option></select></div>
              <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Audit Notes</label><textarea value={adjData.reason} onChange={e => setAdjData(d => ({ ...d, reason: e.target.value }))} className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 h-20" placeholder="Mandatory: Explain this change..." /></div>
            </div>
            <div className="mt-8 flex gap-3"><button onClick={handleAdjust} disabled={isSaving || (adjData.amount === 0 && adjData.mode === 'add') || !adjData.reason.trim()} className="flex-[2] py-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-cyan-900/20">{isSaving ? 'UPDATING LEDGER...' : 'APPLY CHANGE'}</button><button onClick={() => setAdjModal({ isOpen: false, product: null })} className="flex-1 py-4 bg-slate-800 text-slate-400 rounded-2xl font-bold hover:bg-slate-700 transition-all text-sm">CANCEL</button></div>
          </div>
        </div>
      )}
      <ProductImportModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} onImportComplete={loadStock} />
    </div>
  );
}

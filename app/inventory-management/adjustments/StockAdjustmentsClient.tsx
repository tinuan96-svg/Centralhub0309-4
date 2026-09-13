'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { InventoryManagementService, MovementType } from '@/lib/services/inventory/inventoryManagementService';
import ProductImage from '@/components/ProductImage';

const adjustmentTypes = new Set(['MANUAL_ADJUSTMENT', 'ADJUST', 'DAMAGE', 'EXPIRED', 'PURCHASE', 'RETURN']);

export default function StockAdjustmentsClient({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [adjModal, setAdjModal] = useState<{ isOpen: boolean; product: any | null }>({ isOpen: false, product: null });
  const [adjData, setAdjData] = useState({ amount: 0, type: 'MANUAL_ADJUSTMENT' as MovementType, reason: '', mode: 'add' as 'add' | 'replace' });
  const [isSaving, setIsSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const loadAdjustments = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const movements = await InventoryManagementService.getMovements({ limit: 300 });
      setAdjustments(movements.filter((movement: any) => adjustmentTypes.has(movement.action_type)));
    } catch (error) {
      console.error('[StockAdjustments] load failed:', error);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdjustments(true);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase.channel('stock-adjustments-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_movements' }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => loadAdjustments(false), 250);
      })
      .subscribe();
    const fallback = setInterval(() => loadAdjustments(false), 30000);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [loadAdjustments]);

  const searchProducts = async (query: string) => {
    setProductSearch(query);
    if (query.trim().length < 2) { setProductResults([]); return; }
    setSearching(true);
    const pattern = `%${query.trim()}%`;
    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, stock, image_url')
      .eq('is_active', true)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .or(`name.ilike.${pattern},sku.ilike.${pattern},gtin.ilike.${pattern}`)
      .limit(12);
    if (error) console.error('[StockAdjustments] product search failed:', error.message);
    setProductResults(data || []);
    setSearching(false);
  };

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
      await loadAdjustments(false);
      setAdjModal({ isOpen: false, product: null });
      setAdjData({ amount: 0, type: 'MANUAL_ADJUSTMENT', reason: '', mode: 'add' });
      setProductSearch('');
      setProductResults([]);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredAdjustments = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return adjustments;
    return adjustments.filter(movement =>
      String(movement.product_name || '').toLowerCase().includes(query) ||
      String(movement.sku || '').toLowerCase().includes(query) ||
      String(movement.notes || '').toLowerCase().includes(query)
    );
  }, [adjustments, search]);

  if (loading) return <div className="p-8 text-center text-slate-400">Loading stock adjustments...</div>;

  return <main className="mx-auto max-w-[1600px] min-w-0 space-y-5 p-4 pb-24 fold-inner:p-5 fold-inner:pb-8 lg:p-6">
    <header className="flex flex-col gap-3 fold-inner:flex-row fold-inner:items-center fold-inner:justify-between">
      <div><h1 className="text-xl font-bold text-slate-100 uppercase tracking-tight">Stock Adjustments</h1><p className="text-sm text-slate-500 mt-1">Manual corrections, receipts, returns and inventory write-offs</p></div>
      <button onClick={() => setAdjModal({ isOpen: true, product: null })} className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold text-sm uppercase tracking-widest">+ New Adjustment</button>
    </header>

    <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
      <div className="relative"><input type="text" placeholder="Search by product, SKU, or notes..." value={search} onChange={event => setSearch(event.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white" /><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span></div>
    </section>

    <section className="hidden fold-inner:block bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-800/50 border-b border-slate-700/50"><tr>
        <th className="px-4 py-4 text-left text-[9px] font-bold uppercase tracking-widest text-slate-400">Timestamp</th><th className="px-4 py-4 text-left text-[9px] font-bold uppercase tracking-widest text-slate-400">Product</th><th className="px-4 py-4 text-center text-[9px] font-bold uppercase tracking-widest text-slate-400">Type</th><th className="px-4 py-4 text-right text-[9px] font-bold uppercase tracking-widest text-slate-400">Prev</th><th className="px-4 py-4 text-center text-[9px] font-bold uppercase tracking-widest text-slate-400">Change</th><th className="px-4 py-4 text-right text-[9px] font-bold uppercase tracking-widest text-slate-400">New</th><th className="px-4 py-4 text-left text-[9px] font-bold uppercase tracking-widest text-slate-400">Notes</th>
      </tr></thead><tbody className="divide-y divide-slate-800/50">{filteredAdjustments.map(movement => <tr key={movement.id} className="hover:bg-slate-800/20">
        <td className="px-4 py-4 whitespace-nowrap"><p className="text-slate-200 text-xs font-mono">{new Date(movement.created_at).toLocaleDateString('en-GB')}</p><p className="text-[10px] text-slate-500 font-mono">{new Date(movement.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p></td>
        <td className="px-4 py-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-slate-800 overflow-hidden"><ProductImage imageUrl={movement.image_url} size="thumb" alt={movement.product_name || 'Product'} /></div><div><p className="font-bold text-slate-200">{movement.product_name || 'Unknown Product'}</p><p className="text-[10px] text-slate-500 font-mono uppercase">{movement.sku || '—'}</p></div></div></td>
        <td className="px-4 py-4 text-center"><span className={`inline-flex px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${Number(movement.change_amount) >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>{String(movement.action_type || 'ADJUST').replaceAll('_', ' ')}</span></td>
        <td className="px-4 py-4 text-right text-slate-500 font-mono font-bold">{movement.old_stock}</td><td className={`px-4 py-4 text-center font-black font-mono text-base ${Number(movement.change_amount) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{Number(movement.change_amount) > 0 ? '+' : ''}{movement.change_amount}</td><td className="px-4 py-4 text-right text-slate-100 font-black font-mono text-base">{movement.new_stock}</td><td className="px-4 py-4 max-w-xs text-slate-300 text-xs">{movement.notes || '—'}</td>
      </tr>)}{filteredAdjustments.length === 0 && <tr><td colSpan={7} className="px-4 py-20 text-center text-slate-500">No adjustment entries match this view.</td></tr>}</tbody></table></div>
    </section>

    <section className="fold-inner:hidden space-y-3">{filteredAdjustments.map(movement => <article key={movement.id} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
      <div className="flex gap-3"><div className="w-12 h-12 rounded-lg bg-slate-800 overflow-hidden"><ProductImage imageUrl={movement.image_url} size="thumb" alt={movement.product_name || 'Product'} /></div><div className="min-w-0 flex-1"><p className="font-bold text-slate-100 truncate">{movement.product_name || 'Unknown Product'}</p><p className="text-[10px] text-slate-500">{movement.sku || '—'} · {new Date(movement.created_at).toLocaleString('en-GB')}</p></div><span className={`font-black ${Number(movement.change_amount) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{Number(movement.change_amount) > 0 ? '+' : ''}{movement.change_amount}</span></div>
      <div className="grid grid-cols-3 gap-3 border-t border-slate-800/50 pt-3 text-center"><div><p className="text-[9px] uppercase text-slate-500">Previous</p><p className="font-bold">{movement.old_stock}</p></div><div><p className="text-[9px] uppercase text-slate-500">Type</p><p className="text-[10px] font-bold text-cyan-300">{String(movement.action_type).replaceAll('_', ' ')}</p></div><div><p className="text-[9px] uppercase text-slate-500">New</p><p className="font-bold">{movement.new_stock}</p></div></div><p className="text-xs text-slate-400">{movement.notes || 'No audit note'}</p>
    </article>)}{filteredAdjustments.length === 0 && <div className="py-16 text-center text-slate-500">No adjustments recorded.</div>}</section>

    {adjModal.isOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"><div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-md shadow-2xl">
      <div className="mb-6 flex justify-between gap-3"><div><h2 className="text-lg font-bold text-white uppercase">Stock Adjustment</h2><p className="text-sm text-slate-400">{adjModal.product ? adjModal.product.name : 'Select an active product'}</p></div>{adjModal.product && <span className="px-3 py-1 h-fit bg-slate-800 rounded-full text-xs font-mono text-cyan-400">Stock: {adjModal.product.stock || 0}</span>}</div>
      {!adjModal.product ? <div className="space-y-4"><div className="relative"><input type="text" placeholder="Search product name, SKU or barcode..." value={productSearch} onChange={event => searchProducts(event.target.value)} className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white" />{searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">Searching...</span>}</div><div className="space-y-2 max-h-72 overflow-y-auto">{productResults.map(product => <button key={product.id} onClick={() => setAdjModal({ isOpen: true, product })} className="w-full flex items-center gap-3 p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-left"><div className="w-10 h-10 rounded-lg bg-slate-700 overflow-hidden"><ProductImage imageUrl={product.image_url} size="thumb" alt={product.name} /></div><div className="flex-1 min-w-0"><p className="text-sm font-bold text-slate-200 truncate">{product.name}</p><p className="text-[10px] text-slate-500 font-mono">{product.sku || '—'}</p></div><span className="text-xs font-mono text-cyan-400">{product.stock || 0}</span></button>)}{productSearch.length >= 2 && !searching && productResults.length === 0 && <p className="text-center text-slate-500 text-sm py-4">No active products found</p>}</div></div> : <div className="space-y-4">
        <div className="flex bg-slate-800 p-1.5 rounded-2xl"><button onClick={() => setAdjData(data => ({ ...data, mode: 'add' }))} className={`flex-1 py-2 text-[10px] font-black rounded-xl ${adjData.mode === 'add' ? 'bg-cyan-600 text-white' : 'text-slate-500'}`}>+/- CHANGE</button><button onClick={() => setAdjData(data => ({ ...data, mode: 'replace' }))} className={`flex-1 py-2 text-[10px] font-black rounded-xl ${adjData.mode === 'replace' ? 'bg-amber-600 text-white' : 'text-slate-500'}`}>REPLACE TOTAL</button></div>
        <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-2">{adjData.mode === 'replace' ? 'New Physical Count' : 'Change Quantity'}</label><input type="number" value={adjData.amount} onChange={event => setAdjData(data => ({ ...data, amount: parseInt(event.target.value) || 0 }))} className="w-full px-5 py-4 bg-slate-800 border border-slate-700 rounded-2xl text-white text-3xl font-bold" /></div>
        <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-2">Adjustment Reason</label><select value={adjData.type} onChange={event => setAdjData(data => ({ ...data, type: event.target.value as MovementType }))} className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white"><option value="MANUAL_ADJUSTMENT">Manual Adjustment</option><option value="PURCHASE">Stock Purchase / Receipt</option><option value="RETURN">Customer Return</option><option value="DAMAGE">Damaged / Written Off</option><option value="EXPIRED">Expired</option></select></div>
        <div><label className="block text-[10px] font-black text-slate-500 uppercase mb-2">Audit Notes</label><textarea value={adjData.reason} onChange={event => setAdjData(data => ({ ...data, reason: event.target.value }))} className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white h-20" placeholder="Explain this stock change..." /></div>
      </div>}
      <div className="mt-7 flex gap-3">{adjModal.product && <button onClick={handleAdjust} disabled={isSaving || (adjData.mode === 'add' && adjData.amount === 0) || !adjData.reason.trim()} className="flex-[2] py-3 bg-cyan-600 disabled:opacity-50 text-white rounded-xl font-black text-sm">{isSaving ? 'UPDATING...' : 'APPLY CHANGE'}</button>}<button onClick={() => { setAdjModal({ isOpen: false, product: null }); setProductSearch(''); setProductResults([]); }} className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl">Cancel</button></div>
    </div></div>}
  </main>;
}

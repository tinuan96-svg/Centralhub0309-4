'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { InventoryManagementService, MovementType } from '@/lib/services/inventory/inventoryManagementService';
import ProductImage from '@/components/ProductImage';
import Link from 'next/link';

export default function StockAdjustmentsClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [adjModal, setAdjModal] = useState<{ isOpen: boolean; product: any | null }>({ isOpen: false, product: null });
  const [adjData, setAdjData] = useState({ amount: 0, type: 'MANUAL_ADJUSTMENT' as MovementType, reason: '', mode: 'add' as 'add' | 'replace' });
  const [isSaving, setIsSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const loadAdjustments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await InventoryManagementService.getMovements({ limit: 100 });
      const filtered = data.filter((m: any) =>
        ['MANUAL_ADJUSTMENT', 'DAMAGE', 'EXPIRED', 'PURCHASE', 'RETURN'].includes(m.action_type)
      );
      setAdjustments(filtered);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAdjustments(); }, [loadAdjustments]);

  const searchProducts = async (q: string) => {
    setProductSearch(q);
    if (q.trim().length < 2) { setProductResults([]); return; }
    setSearching(true);
    const { data } = await supabase.from('products').select('id, name, sku, stock, image_url').ilike('name', `%${q}%`).limit(8);
    setProductResults(data || []);
    setSearching(false);
  };

  const handleAdjust = async () => {
    if (!adjModal.product || isSaving) return;
    setIsSaving(true);
    try {
      const finalChange = adjData.mode === 'replace' ? adjData.amount - (adjModal.product.stock || 0) : adjData.amount;
      await InventoryManagementService.adjustStock({
        productId: adjModal.product.id,
        changeAmount: finalChange,
        type: adjData.type,
        reason: adjData.reason,
      });
      await loadAdjustments();
      setAdjModal({ isOpen: false, product: null });
      setAdjData({ amount: 0, type: 'MANUAL_ADJUSTMENT', reason: '', mode: 'add' });
      setProductSearch('');
      setProductResults([]);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredAdjustments = adjustments.filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return m.products?.name?.toLowerCase().includes(q) || m.products?.sku?.toLowerCase().includes(q) || m.notes?.toLowerCase().includes(q);
  });

  if (loading) return <div className="p-8 text-center text-slate-400">Loading Stock Adjustments...</div>;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100 uppercase tracking-tight">Stock Adjustments</h1>
          <p className="text-sm text-slate-500 mt-1">Manual inventory corrections and quantity overrides</p>
        </div>
        <button
          onClick={() => setAdjModal({ isOpen: true, product: null })}
          className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold text-sm uppercase tracking-widest transition-all shadow-lg shadow-cyan-900/20"
        >
          + New Adjustment
        </button>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search by product, SKU, or notes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/50 border-b border-slate-700/50">
              <tr>
                <th className="px-4 py-4 text-left font-bold text-slate-400 uppercase tracking-widest text-[9px]">Timestamp</th>
                <th className="px-4 py-4 text-left font-bold text-slate-400 uppercase tracking-widest text-[9px]">Product</th>
                <th className="px-4 py-4 text-center font-bold text-slate-400 uppercase tracking-widest text-[9px]">Type</th>
                <th className="px-4 py-4 text-right font-bold text-slate-400 uppercase tracking-widest text-[9px]">Prev</th>
                <th className="px-4 py-4 text-center font-bold text-slate-400 uppercase tracking-widest text-[9px]">Change</th>
                <th className="px-4 py-4 text-right font-bold text-slate-400 uppercase tracking-widest text-[9px]">New</th>
                <th className="px-4 py-4 text-left font-bold text-slate-400 uppercase tracking-widest text-[9px]">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredAdjustments.map(m => (
                <tr key={m.id} className="hover:bg-slate-800/20 transition-colors group">
                  <td className="px-4 py-4 whitespace-nowrap">
                    <p className="text-slate-200 text-xs font-mono">{new Date(m.created_at).toLocaleDateString('en-GB')}</p>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">{new Date(m.created_at).toLocaleTimeString('en-GB')}</p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-800 overflow-hidden flex-shrink-0 border border-slate-700/30">
                        <ProductImage imageUrl={m.products?.image_url} size="thumb" alt={m.products?.name || 'Product'} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-200">{m.products?.name || 'Unknown'}</p>
                        <p className="text-[10px] text-slate-500 font-mono uppercase">{m.products?.sku || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`inline-flex px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                      m.change_amount > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}>
                      {m.action_type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right text-slate-500 font-mono font-bold">{m.old_stock}</td>
                  <td className={`px-4 py-4 text-center font-black font-mono text-base ${m.change_amount > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {m.change_amount > 0 ? '+' : ''}{m.change_amount}
                  </td>
                  <td className="px-4 py-4 text-right text-slate-100 font-black font-mono text-base">{m.new_stock}</td>
                  <td className="px-4 py-4 max-w-xs">
                    <p className="text-slate-300 text-xs font-medium leading-snug">{m.notes || '—'}</p>
                  </td>
                </tr>
              ))}
              {filteredAdjustments.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-24 text-center text-slate-600 italic">
                    <span className="text-4xl mb-4 block opacity-20">🔄</span>
                    No adjustments recorded yet. Click the New Adjustment button to make your first stock correction.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {adjModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-md shadow-2xl">
            <div className="mb-6 flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold text-white uppercase tracking-tight">Stock Adjustment</h2>
                <p className="text-sm text-slate-400 mt-1">
                  {adjModal.product ? adjModal.product.name : 'Select a product below'}
                </p>
              </div>
              {adjModal.product && (
                <span className="px-3 py-1 bg-slate-800 rounded-full text-xs font-mono text-cyan-400 border border-slate-700">
                  Stock: {adjModal.product.stock || 0}
                </span>
              )}
            </div>

            {!adjModal.product ? (
              <div className="space-y-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search products by name..."
                    value={productSearch}
                    onChange={e => searchProducts(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                  {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">Searching...</span>}
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {productResults.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setAdjModal({ isOpen: true, product: p })}
                      className="w-full flex items-center gap-3 p-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-lg bg-slate-700 overflow-hidden flex-shrink-0">
                        <ProductImage imageUrl={p.image_url} size="thumb" alt={p.name} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-200">{p.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{p.sku || '—'}</p>
                      </div>
                      <span className="text-xs font-mono text-cyan-400">Stock: {p.stock || 0}</span>
                    </button>
                  ))}
                  {productSearch.length >= 2 && productResults.length === 0 && !searching && (
                    <p className="text-center text-slate-500 text-sm py-4">No products found</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex bg-slate-800 p-1.5 rounded-2xl mb-4">
                  <button onClick={() => setAdjData(d => ({ ...d, mode: 'add' }))} className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all uppercase tracking-widest ${adjData.mode === 'add' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-200'}`}>+/- CHANGE</button>
                  <button onClick={() => setAdjData(d => ({ ...d, mode: 'replace' }))} className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all uppercase tracking-widest ${adjData.mode === 'replace' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-200'}`}>REPLACE TOTAL</button>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{adjData.mode === 'replace' ? 'New Physical Count' : 'Change Quantity'}</label>
                  {adjData.mode === 'add' && (
                    <div className="flex gap-2 mb-4">
                      <button onClick={() => setAdjData(d => ({ ...d, amount: 10 }))} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-xl text-xs font-bold border border-slate-700 transition-all">+10</button>
                      <button onClick={() => setAdjData(d => ({ ...d, amount: -5 }))} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded-xl text-xs font-bold border border-slate-700 transition-all">-5</button>
                      <button onClick={() => setAdjData(d => ({ ...d, amount: 0 }))} className="px-4 py-2 bg-slate-800 text-slate-500 rounded-xl text-xs font-bold border border-slate-700 transition-all">CLR</button>
                    </div>
                  )}
                  <input type="number" value={adjData.amount} onChange={e => setAdjData(d => ({ ...d, amount: parseInt(e.target.value) || 0 }))} className="w-full px-5 py-4 bg-slate-800 border border-slate-700 rounded-2xl text-white text-3xl font-bold focus:outline-none focus:ring-2 focus:ring-cyan-500/50" placeholder="0" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Adjustment Reason</label>
                  <select value={adjData.type} onChange={e => setAdjData(d => ({ ...d, type: e.target.value as any }))} className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50">
                    <option value="MANUAL_ADJUSTMENT">Manual Adjustment</option>
                    <option value="PURCHASE">Stock Purchase (Receive)</option>
                    <option value="RETURN">Customer Return (+)</option>
                    <option value="DAMAGE">Damaged / Written Off (-)</option>
                    <option value="EXPIRED">Expired (-)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Audit Notes</label>
                  <textarea value={adjData.reason} onChange={e => setAdjData(d => ({ ...d, reason: e.target.value }))} className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 h-20" placeholder="Mandatory: Explain this change..." />
                </div>
              </div>
            )}

            <div className="mt-8 flex gap-3">
              {adjModal.product && (
                <button onClick={handleAdjust} disabled={isSaving || (adjData.amount === 0 && adjData.mode === 'add') || !adjData.reason.trim()} className="flex-[2] py-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-cyan-900/20">
                  {isSaving ? 'UPDATING LEDGER...' : 'APPLY CHANGE'}
                </button>
              )}
              <button onClick={() => { setAdjModal({ isOpen: false, product: null }); setProductSearch(''); setProductResults([]); }} className="flex-1 py-4 bg-slate-800 text-slate-400 rounded-2xl font-bold hover:bg-slate-700 transition-all text-sm">CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

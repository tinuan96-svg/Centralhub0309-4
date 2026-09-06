'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface BulkEditModalProps { isOpen: boolean; onClose: () => void; selectedProductIds: string[]; onSuccess: () => void; mode: 'edit' | 'delete' | 'visibility'; }

export default function BulkEditModal({ isOpen, onClose, selectedProductIds, onSuccess, mode }: BulkEditModalProps) {
  const [loading, setLoading] = useState(false); const [price, setPrice] = useState(''); const [cost, setCost] = useState(''); const [stock, setStock] = useState(''); const [active, setActive] = useState('true');
  if (!isOpen) return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!selectedProductIds.length) return; setLoading(true);
    try {
      if (mode === 'delete') {
        const { error } = await supabase.from('products').update({ is_deleted: true, deleted_at: new Date().toISOString() }).in('id', selectedProductIds); if (error) throw error;
      } else if (mode === 'visibility') {
        const { error } = await supabase.from('products').update({ is_active: active === 'true' }).in('id', selectedProductIds); if (error) throw error;
      } else {
        const updates: Record<string, unknown> = {}; if (price !== '') updates.price = Number(price); if (cost !== '') updates.cost_price = Number(cost);
        if (Object.keys(updates).length) { const { error } = await supabase.from('products').update(updates).in('id', selectedProductIds); if (error) throw error; }
        if (stock !== '') { const { error } = await supabase.from('central_inventory').update({ stock_quantity: Number(stock), updated_at: new Date().toISOString() }).in('product_id', selectedProductIds); if (error) throw error; }
      }
      onSuccess(); onClose();
    } catch (err: any) { console.error('Bulk operation failed:', err); alert(err?.message || 'Bulk operation failed.'); } finally { setLoading(false); }
  };
  const title = mode === 'delete' ? 'Bulk Delete' : mode === 'visibility' ? 'Bulk Visibility' : 'Bulk Edit Catalog';
  return <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"><form onSubmit={submit} className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden"><header className="px-6 py-5 border-b border-slate-800 flex items-center justify-between"><div><h2 className="text-xl font-black text-white uppercase">{title}</h2><p className="text-[10px] text-slate-500 uppercase font-bold mt-1">{selectedProductIds.length} products selected</p></div><button type="button" onClick={onClose} className="text-slate-400 hover:text-white text-2xl">×</button></header><div className="p-6 space-y-5">{mode === 'delete' ? <p className="text-sm text-rose-300">This will soft-delete the selected products.</p> : mode === 'visibility' ? <label className="block text-xs text-slate-400">Visibility<select value={active} onChange={e=>setActive(e.target.value)} className="mt-2 w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white"><option value="true">Active / visible</option><option value="false">Inactive / hidden</option></select></label> : <div className="grid grid-cols-2 gap-3"><label className="text-xs text-slate-400">Price<input type="number" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} className="mt-2 w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white" placeholder="No change"/></label><label className="text-xs text-slate-400">Cost<input type="number" step="0.01" value={cost} onChange={e=>setCost(e.target.value)} className="mt-2 w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white" placeholder="No change"/></label><label className="text-xs text-slate-400 col-span-2">Stock<input type="number" value={stock} onChange={e=>setStock(e.target.value)} className="mt-2 w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white" placeholder="No change"/></label></div>}</div><footer className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3"><button type="button" onClick={onClose} disabled={loading} className="px-5 py-2.5 bg-slate-800 text-white rounded-xl">Cancel</button><button type="submit" disabled={loading} className={`px-5 py-2.5 rounded-xl font-bold text-white ${mode==='delete'?'bg-rose-600':'bg-cyan-600'}`}>{loading?'Saving…':mode==='delete'?'Delete':mode==='visibility'?'Apply':'Apply Changes'}</button></footer></form></div>;
}

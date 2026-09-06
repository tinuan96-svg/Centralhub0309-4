'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Store { id: string; name: string; slug?: string | null; }
interface Product { id: string; name: string; sku: string | null; brand: string | null; category: string | null; stock: number | null; is_active: boolean | null; }
interface Override { store_id: string; product_id: string; is_visible: boolean; }

export default function StoreVisibilityPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [storeId, setStoreId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [storesRes, productsRes, visibilityRes] = await Promise.all([
      supabase.from('stores').select('id,name,slug').order('name'),
      supabase.from('products').select('id,name,sku,brand,category,stock,is_active').eq('is_deleted', false).order('name').limit(2000),
      supabase.from('store_product_visibility').select('store_id,product_id,is_visible'),
    ]);
    const firstError = storesRes.error || productsRes.error || visibilityRes.error;
    if (firstError) setError(firstError.message);
    const nextStores = (storesRes.data || []) as Store[];
    setStores(nextStores);
    setProducts((productsRes.data || []) as Product[]);
    setOverrides((visibilityRes.data || []) as Override[]);
    setStoreId(current => current || nextStores[0]?.id || '');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedStore = stores.find(s => s.id === storeId);
  const visibilityMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const row of overrides) if (row.store_id === storeId) map.set(row.product_id, row.is_visible);
    return map;
  }, [overrides, storeId]);

  const visibleFor = (productId: string) => visibilityMap.get(productId) ?? true;
  const filtered = products.filter(p => {
    const haystack = `${p.name} ${p.sku || ''} ${p.brand || ''} ${p.category || ''}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  const hiddenCount = products.filter(p => !visibleFor(p.id)).length;

  const setVisibility = async (product: Product, isVisible: boolean) => {
    if (!storeId) return;
    setSaving(product.id);
    setError('');
    const { error: upsertError } = await supabase.from('store_product_visibility').upsert({
      store_id: storeId,
      product_id: product.id,
      is_visible: isVisible,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'store_id,product_id' });
    if (upsertError) {
      setError(upsertError.message);
    } else {
      setOverrides(prev => {
        const without = prev.filter(r => !(r.store_id === storeId && r.product_id === product.id));
        return [...without, { store_id: storeId, product_id: product.id, is_visible: isVisible }];
      });
    }
    setSaving(null);
  };

  const bulkSet = async (isVisible: boolean) => {
    if (!storeId || filtered.length === 0) return;
    setSaving('__bulk__');
    setError('');
    const rows = filtered.map(p => ({ store_id: storeId, product_id: p.id, is_visible: isVisible, updated_at: new Date().toISOString() }));
    const { error: bulkError } = await supabase.from('store_product_visibility').upsert(rows, { onConflict: 'store_id,product_id' });
    if (bulkError) setError(bulkError.message);
    else await load();
    setSaving(null);
  };

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-slate-100">Store Product Visibility</h1>
        <p className="text-sm text-slate-400 mt-1">Store-specific storefront control using the current visibility override layer. Products remain visible by default unless an explicit override hides them.</p>
      </div>
      {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</div>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Products" value={products.length} /><Stat label="Visible" value={Math.max(0, products.length - hiddenCount)} /><Stat label="Hidden" value={hiddenCount} /><Stat label="Overrides" value={visibilityMap.size} />
      </div>
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 md:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <select value={storeId} onChange={e => setStoreId(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 min-w-64">{stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search product, SKU, brand or category…" className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100" />
          <button disabled={saving !== null} onClick={() => bulkSet(true)} className="px-4 py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 disabled:opacity-50">Show filtered</button>
          <button disabled={saving !== null} onClick={() => bulkSet(false)} className="px-4 py-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 disabled:opacity-50">Hide filtered</button>
        </div>
        <p className="text-xs text-slate-500">Editing: <span className="text-slate-300 font-semibold">{selectedStore?.name || 'Select a store'}</span> · {filtered.length} matching products</p>
      </div>
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
        {loading ? <div className="p-10 text-center text-slate-400">Loading current storefront visibility…</div> : <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm">
          <thead className="bg-slate-800/60 text-[10px] uppercase tracking-widest text-slate-400"><tr><th className="text-left px-5 py-4">Product</th><th className="text-left px-5 py-4">Category</th><th className="text-right px-5 py-4">Stock</th><th className="text-center px-5 py-4">Storefront</th></tr></thead>
          <tbody className="divide-y divide-slate-800/70">{filtered.map(product => { const visible = visibleFor(product.id); return <tr key={product.id} className="hover:bg-slate-800/25">
            <td className="px-5 py-4"><p className="font-semibold text-slate-100">{product.name}</p><p className="text-xs text-slate-500">{product.sku || 'No SKU'}{product.brand ? ` · ${product.brand}` : ''}</p></td>
            <td className="px-5 py-4 text-slate-400">{product.category || '—'}</td><td className="px-5 py-4 text-right text-slate-300">{product.stock ?? 0}</td>
            <td className="px-5 py-4 text-center"><button disabled={saving !== null || !storeId} onClick={() => setVisibility(product, !visible)} className={`min-w-28 px-3 py-2 rounded-xl border font-bold text-xs ${visible ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/15 border-rose-500/30 text-rose-300'} disabled:opacity-50`}>{saving === product.id ? 'Saving…' : visible ? 'VISIBLE' : 'HIDDEN'}</button></td>
          </tr>; })}</tbody>
        </table></div>}
      </div>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: number }) { return <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4"><p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{label}</p><p className="text-2xl font-black text-slate-100 mt-1">{value.toLocaleString()}</p></div>; }

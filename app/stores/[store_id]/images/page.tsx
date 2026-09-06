'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ProductImage from '@/components/ProductImage';

type StoreRow = { id: string; name: string; slug: string };
type MappingRow = { id: string; product_id: string; image_override: string | null; is_active: boolean | null };
type ProductRow = { id: string; name: string; sku: string | null; image_url: string | null; image_main: string | null };
type ImageRow = MappingRow & { product?: ProductRow };

export default function StoreImagesPage() {
  const params = useParams();
  const storeId = String(params.store_id || '');
  const [store, setStore] = useState<StoreRow | null>(null);
  const [rows, setRows] = useState<ImageRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError('');
    const [storeRes, mappingRes] = await Promise.all([
      supabase.from('stores').select('id,name,slug').eq('id', storeId).maybeSingle(),
      supabase.from('store_products').select('id,product_id,image_override,is_active').eq('store_id', storeId).order('created_at', { ascending: true }),
    ]);

    if (storeRes.error || mappingRes.error) {
      setError(storeRes.error?.message || mappingRes.error?.message || 'Could not load store images.');
      setLoading(false);
      return;
    }

    const mappings = (mappingRes.data || []) as MappingRow[];
    const productIds = mappings.map(row => row.product_id).filter(Boolean);
    let products: ProductRow[] = [];
    if (productIds.length) {
      const { data, error: productError } = await supabase.from('products').select('id,name,sku,image_url,image_main').in('id', productIds);
      if (productError) {
        setError(productError.message);
        setLoading(false);
        return;
      }
      products = (data || []) as ProductRow[];
    }

    const productMap = new Map(products.map(product => [product.id, product]));
    const merged = mappings.map(mapping => ({ ...mapping, product: productMap.get(mapping.product_id) }));
    setStore(storeRes.data as StoreRow | null);
    setRows(merged);
    setDrafts(Object.fromEntries(merged.map(row => [row.id, row.image_override || ''])));
    setLoading(false);
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(row => `${row.product?.name || ''} ${row.product?.sku || ''}`.toLowerCase().includes(q));
  }, [rows, search]);

  const save = async (row: ImageRow) => {
    setSavingId(row.id);
    setMessage('');
    setError('');
    const value = (drafts[row.id] || '').trim();
    if (value && !/^https?:\/\//i.test(value)) {
      setError('Image overrides must use a full http:// or https:// URL. Leave the field blank to use the CentralHub master image.');
      setSavingId(null);
      return;
    }
    const { error: updateError } = await supabase.from('store_products').update({ image_override: value || null, updated_at: new Date().toISOString() }).eq('id', row.id).eq('store_id', storeId);
    if (updateError) setError(updateError.message);
    else {
      setMessage(`${row.product?.name || 'Product'} image setting saved for ${store?.name || 'this store'}.`);
      await load();
    }
    setSavingId(null);
  };

  if (loading) return <div className="p-8 text-slate-400">Loading store image settings…</div>;

  return <div className="p-4 md:p-8 max-w-[1500px] mx-auto space-y-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-400">Store-specific catalogue</div>
        <h1 className="mt-1 text-2xl md:text-3xl font-black text-white">{store?.name || 'Store'} Images</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">Override a product image for this store only. Leave the override blank to inherit the CentralHub master image. Product identity, stock and master data are not changed here.</p>
      </div>
      <div className="flex gap-2">
        <Link href={`/stores/${storeId}`} className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200">Back to store</Link>
        <button type="button" onClick={load} className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200">Refresh</button>
      </div>
    </div>

    {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}
    {message && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{message}</div>}

    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search product or SKU…" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500" />
    </div>

    <div className="space-y-3">
      {filtered.map(row => {
        const master = row.product?.image_main || row.product?.image_url || '';
        const draft = drafts[row.id] ?? '';
        const preview = draft.trim() || master;
        return <article key={row.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:p-5">
          <div className="grid gap-4 lg:grid-cols-[80px_1fr_1.4fr_auto] lg:items-center">
            <div className="h-20 w-20 overflow-hidden rounded-xl bg-slate-950 border border-slate-800">
              <ProductImage imageUrl={preview || null} size="thumb" alt={row.product?.name || 'Product'} />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-slate-100 truncate">{row.product?.name || 'Unknown product'}</div>
              <div className="mt-1 text-[10px] font-mono text-slate-500">{row.product?.sku || row.product_id}</div>
              <div className="mt-2 text-[10px] uppercase tracking-widest text-slate-600">{draft.trim() ? 'Store override' : 'Master image inherited'}</div>
            </div>
            <label className="block min-w-0">
              <span className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Store image URL</span>
              <input value={draft} onChange={event => setDrafts(current => ({ ...current, [row.id]: event.target.value }))} placeholder={master || 'https://…'} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500" />
              <span className="mt-1 block text-[10px] text-slate-600">Blank = use CentralHub master image</span>
            </label>
            <button type="button" onClick={() => save(row)} disabled={savingId === row.id} className="rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">{savingId === row.id ? 'Saving…' : 'Save'}</button>
          </div>
        </article>;
      })}
      {!filtered.length && <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-10 text-center text-sm text-slate-500">No mapped products match this search.</div>}
    </div>
  </div>;
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Store { id: string; name: string; slug?: string | null; }
interface Product {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  category: string | null;
  stock: number | null;
  is_active: boolean | null;
  approval_status: string | null;
  is_published: boolean | null;
  is_archived: boolean | null;
  is_deleted?: boolean | null;
  main_category?: string | null;
  image_main?: string | null;
  image_url?: string | null;
  image_medium?: string | null;
  image_thumbnail?: string | null;
  description?: string | null;
  rich_description?: string | null;
  short_description?: string | null;
  seo_title?: string | null;
  seo_meta_title?: string | null;
  seo_meta_description?: string | null;
  expiry_date?: string | null;
  expiry_blocked?: boolean | null;
  audit_hold_status?: string | null;
  price?: number | null;
  allow_backorder?: boolean | null;
  backorder?: boolean | null;
}
interface Override { store_id: string; product_id: string; is_visible: boolean; }

function centralEligibility(product: Product) {
  if (product.is_archived === true) return { live: false, reason: 'Archived centrally' };
  if (product.approval_status !== 'approved') return { live: false, reason: 'Awaiting central approval' };
  if (product.is_published !== true) return { live: false, reason: 'Not published centrally' };
  if (product.is_active === false) return { live: false, reason: 'Inactive centrally' };
  return { live: true, reason: 'Central product is live' };
}

// Tasty Kerala is an independent storefront: opt-IN assignment plus complete CentralHub
// approval, category/image/description/SEO, pricing and expiry checks are mandatory.
function tastyEligibility(product: Product) {
  const base = centralEligibility(product);
  if (!base.live) return base;
  if (product.is_deleted) return { live: false, reason: 'Deleted centrally' };
  if (product.is_active !== true) return { live: false, reason: 'Not active centrally' };
  if (product.expiry_blocked || (product.expiry_date && new Date(product.expiry_date + 'T00:00:00Z').getTime() <= Date.now() + 20 * 86400000)) {
    return { live: false, reason: 'Blocked by the 20-day expiry rule' };
  }
  if (product.audit_hold_status && !['none', 'released', 'clear'].includes(product.audit_hold_status.toLowerCase())) {
    return { live: false, reason: 'Inventory audit hold' };
  }
  if (!String(product.main_category || product.category || '').trim()) return { live: false, reason: 'Category required' };
  if (![product.image_main, product.image_url, product.image_medium, product.image_thumbnail].some(s => /^https:\/\//i.test(String(s || '')))) {
    return { live: false, reason: 'HTTPS product image required' };
  }
  if (![product.description, product.rich_description, product.short_description].some(s => String(s || '').trim())) {
    return { live: false, reason: 'Description required' };
  }
  if (!Number.isFinite(Number(product.price)) || Number(product.price) <= 0) return { live: false, reason: 'Valid price required' };
  if (Number(product.stock ?? 0) <= 0 && !product.allow_backorder && !product.backorder) return { live: false, reason: 'Sellable stock or authorised backorder required' };
  return base;
}

export default function StoreVisibilityPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [storeId, setStoreId] = useState('');
  const [query, setQuery] = useState('');
  const [tastyReadinessFilter, setTastyReadinessFilter] = useState<'all' | 'ready' | 'seo' | 'assigned'>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [storesRes, productsRes, visibilityRes] = await Promise.all([
      supabase.from('stores').select('id,name,slug').order('name'),
      supabase
        .from('products')
        .select('id,name,sku,brand,category,main_category,stock,price,is_active,approval_status,is_published,is_archived,is_deleted,image_main,image_url,image_medium,image_thumbnail,description,rich_description,short_description,seo_title,seo_meta_title,seo_meta_description,expiry_date,expiry_blocked,audit_hold_status,allow_backorder,backorder')
        .eq('is_deleted', false)
        .order('name')
        .limit(2000),
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

  // Store products inherit CentralHub publication by default; an explicit visibility row can hide or re-enable a product.
  const isTastyKerala = selectedStore?.slug?.toLowerCase() === 'tastykerala';
  const allowedFor = useCallback((productId: string) => visibilityMap.get(productId) ?? true, [visibilityMap]);
  const eligibilityFor = useCallback((product: Product) => isTastyKerala ? tastyEligibility(product) : centralEligibility(product), [isTastyKerala]);
  const effectiveVisibleFor = useCallback((product: Product) => eligibilityFor(product).live && allowedFor(product.id), [allowedFor, eligibilityFor]);

  const filtered = products.filter(p => {
    if (isTastyKerala) {
      if (tastyReadinessFilter === 'ready' && !tastyEligibility(p).live) return false;
      if (tastyReadinessFilter === 'seo' && (String(p.seo_meta_title || p.seo_title || '').trim() && String(p.seo_meta_description || '').trim())) return false;
      if (tastyReadinessFilter === 'assigned' && !allowedFor(p.id)) return false;
    }
    const haystack = `${p.name} ${p.sku || ''} ${p.brand || ''} ${p.category || ''}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const centralLiveCount = products.filter(p => eligibilityFor(p).live).length;
  const visibleCount = products.filter(effectiveVisibleFor).length;
  const hiddenHereCount = products.filter(p => eligibilityFor(p).live && !allowedFor(p.id)).length;
  const notLiveCount = products.length - centralLiveCount;
  const tastyMissingSeoCount = isTastyKerala ? products.filter(p => p.approval_status === 'approved' && p.is_published === true && p.is_active === true && !p.is_archived && !p.is_deleted && (!String(p.seo_meta_title || p.seo_title || '').trim() || !String(p.seo_meta_description || '').trim())).length : 0;
  const tastyOptedInCount = isTastyKerala ? products.filter(p => allowedFor(p.id)).length : 0;

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

  const statusFor = (product: Product) => {
    const central = eligibilityFor(product);
    const allowed = allowedFor(product.id);
    if (!central.live) return { label: 'NOT LIVE', tone: 'amber', detail: central.reason, allowed };
    if (!allowed) return { label: 'HIDDEN', tone: 'rose', detail: 'Hidden for this store', allowed };
    return { label: 'VISIBLE', tone: 'emerald', detail: 'Live on this store when sync is current', allowed };
  };

  return (
    <div className="p-4 fold-inner:p-5 lg:p-6 pb-24 fold-inner:pb-8 max-w-[1500px] mx-auto space-y-5 min-w-0">
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-slate-100">Store Product Visibility</h1>
        <p className="text-sm text-slate-400 mt-1">Effective storefront visibility requires central approval, publication and active status plus the store-specific allow/hide override.</p>
      </div>
      {isTastyKerala && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-100">
        Tasty Kerala (keralagroceries.com) is separate from KeralaGrocery (keralagrocery.com). Eligible CentralHub products sync automatically every five minutes. Store visibility overrides can still hide individual products; approval, publication, image/description, sellable stock, audit-hold and 20-day expiry safeguards remain enforced. Checkout remains disabled until its own merchant account and launch checks are approved.
      </div>}
      {isTastyKerala && <div className="rounded-2xl border border-cyan-500/25 bg-slate-900/70 p-4 space-y-3">
        <h2 className="text-sm font-black text-slate-100">Tasty Kerala catalogue launch readiness</h2>
        <p className="text-xs text-slate-400">These counts are based on currently loaded CentralHub products. Eligible products flow automatically to keralagroceries.com; visibility overrides can hide specific products. This page never changes CentralHub approval.</p>
        <div className="grid grid-cols-2 fold-inner:grid-cols-4 gap-2">
          <Stat label="Eligible to sync" value={centralLiveCount}/>
          <Stat label="Missing SEO" value={tastyMissingSeoCount}/>
          <Stat label="Allowed here" value={tastyOptedInCount}/>
          <Stat label="Eligible & allowed" value={visibleCount}/>
        </div>
        <div className="flex gap-2 flex-wrap items-center text-xs">
          <label htmlFor="tasty-readiness-filter" className="text-slate-400">Show</label>
          <select id="tasty-readiness-filter" value={tastyReadinessFilter} onChange={e => setTastyReadinessFilter(e.target.value as typeof tastyReadinessFilter)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100">
            <option value="all">All products</option><option value="ready">Eligible to sync</option><option value="seo">SEO metadata missing</option><option value="assigned">Assigned to Tasty Kerala</option>
          </select>
          <span className="text-amber-200">Review product details before launch; SEO can be improved without blocking catalogue sync. Checkout remains disabled.</span>
        </div>
      </div>}
      {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</div>}

      <div className="grid grid-cols-2 fold-inner:grid-cols-4 gap-3">
        <Stat label="Products" value={products.length} />
        <Stat label="Storefront live" value={visibleCount} />
        <Stat label="Hidden here" value={hiddenHereCount} />
        <Stat label="Not live centrally" value={notLiveCount} />
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 md:p-5 space-y-4">
        <div className="flex flex-col fold-inner:flex-row gap-3 fold-inner:items-center min-w-0">
          <select value={storeId} onChange={e => setStoreId(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 fold-inner:min-w-56 min-w-0">
            {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search product, SKU, brand or category…" className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100" />
          <div className="flex gap-2 shrink-0">
            <button disabled={saving !== null} onClick={() => bulkSet(true)} className="flex-1 fold-inner:flex-none px-3 py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 disabled:opacity-50 text-xs font-bold">Allow filtered</button>
            <button disabled={saving !== null} onClick={() => bulkSet(false)} className="flex-1 fold-inner:flex-none px-3 py-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 disabled:opacity-50 text-xs font-bold">Hide filtered</button>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Editing: <span className="text-slate-300 font-semibold">{selectedStore?.name || 'Select a store'}</span> · {filtered.length} matching products · {centralLiveCount} centrally live · {visibilityMap.size} explicit store overrides
        </p>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden min-w-0">
        {loading ? <div className="p-10 text-center text-slate-400">Loading current storefront visibility…</div> : <>
          <div className="fold-inner:hidden divide-y divide-slate-800/70">
            {filtered.map(product => {
              const status = statusFor(product);
              const stockClass = (product.stock ?? 0) <= 0 ? 'text-rose-300' : 'text-slate-300';
              return <div key={product.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-100 truncate">{product.name}</p>
                    <p className="text-xs text-slate-500 truncate">{product.sku || 'No SKU'}{product.brand ? ` · ${product.brand}` : ''}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-bold ${stockClass}`}>{product.stock ?? 0}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 text-xs text-slate-500">
                    <span>{product.category || 'No category'}</span>
                    <span className="mx-2">·</span>
                    <span>{status.detail}</span>
                  </div>
                  <VisibilityButton product={product} status={status} saving={saving} storeId={storeId} onToggle={setVisibility} />
                </div>
              </div>;
            })}
          </div>

          <div className="hidden fold-inner:block w-full overflow-hidden">
            <table className="w-full table-fixed text-sm">
              <colgroup><col className="w-[42%]" /><col className="w-[24%]" /><col className="w-[10%]" /><col className="w-[24%]" /></colgroup>
              <thead className="bg-slate-800/60 text-[10px] uppercase tracking-widest text-slate-400">
                <tr><th className="text-left px-4 py-4">Product</th><th className="text-left px-3 py-4">Category</th><th className="text-right px-3 py-4">Stock</th><th className="text-center px-3 py-4">Storefront</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">{filtered.map(product => {
                const status = statusFor(product);
                return <tr key={product.id} className="hover:bg-slate-800/25">
                  <td className="px-4 py-4 min-w-0"><p className="font-semibold text-slate-100 truncate">{product.name}</p><p className="text-xs text-slate-500 truncate">{product.sku || 'No SKU'}{product.brand ? ` · ${product.brand}` : ''}</p></td>
                  <td className="px-3 py-4 text-slate-400 truncate" title={product.category || '—'}>{product.category || '—'}</td>
                  <td className={`px-3 py-4 text-right font-semibold ${(product.stock ?? 0) <= 0 ? 'text-rose-300' : 'text-slate-300'}`}>{product.stock ?? 0}</td>
                  <td className="px-3 py-4 text-center min-w-0">
                    <VisibilityButton product={product} status={status} saving={saving} storeId={storeId} onToggle={setVisibility} />
                    <p className="mt-1 text-[9px] text-slate-600 truncate" title={status.detail}>{status.detail}</p>
                  </td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </>}
      </div>
    </div>
  );
}

function VisibilityButton({ product, status, saving, storeId, onToggle }: {
  product: Product;
  status: { label: string; tone: string; detail: string; allowed: boolean };
  saving: string | null;
  storeId: string;
  onToggle: (product: Product, isVisible: boolean) => Promise<void>;
}) {
  const tone = status.tone === 'emerald'
    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
    : status.tone === 'rose'
      ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
      : 'bg-amber-500/10 border-amber-500/25 text-amber-300';
  return <button
    disabled={saving !== null || !storeId}
    onClick={() => onToggle(product, !status.allowed)}
    title={`${status.detail}. ${status.allowed ? 'Tap to hide for this store.' : 'Tap to allow for this store.'}`}
    className={`shrink-0 min-w-24 px-2.5 py-2 rounded-xl border font-bold text-[10px] ${tone} disabled:opacity-50`}
  >
    {saving === product.id ? 'SAVING…' : status.label}
  </button>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 min-w-0"><p className="text-[9px] fold-inner:text-[10px] uppercase tracking-wider text-slate-500 font-bold truncate">{label}</p><p className="text-xl fold-inner:text-2xl font-black text-slate-100 mt-1">{value.toLocaleString()}</p></div>;
}

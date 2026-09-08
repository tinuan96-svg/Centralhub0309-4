'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import ProductEditModal from '@/components/ProductEditModal';
import ProductViewPanel from '@/components/ProductViewPanel';
import DeleteConfirmationModal from '@/components/DeleteConfirmationModal';
import InventoryActivityLog from '@/components/InventoryActivityLog';
import { formatCurrency } from '@/lib/utils/currency';
import ProductImage from '@/components/ProductImage';
import { ProductService } from '@/lib/services/productService';

interface InventoryProduct {
  id: string; name: string; sku: string | null; product_type: string | null; brand: string | null;
  department: string | null; category: string | null; subcategory: string | null; price: number;
  cost_price: number | null; stock_quantity: number; low_stock_threshold: number; is_active: boolean;
  image_url: string | null; gallery_images: string[] | null; enable_stock_tracking: boolean;
  backorder: boolean; allow_backorder: boolean;
}

export default function InventoryClient() {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'low' | 'out'>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [viewingProductId, setViewingProductId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const pageSize = 50;

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, count, error } = await supabase
        .from('products')
        .select('id,name,sku,product_type,brand,department,category,subcategory,price,cost_price,is_active,image_url,gallery_images,enable_stock_tracking,backorder,allow_backorder,is_deleted,central_inventory(stock_quantity,low_stock_threshold)', { count: 'exact' })
        .order('name')
        .range(from, to);
      if (error) throw error;
      setProducts((data || []).map((p: any) => ({
        id: p.id, name: p.name, sku: p.sku, product_type: p.product_type, brand: p.brand,
        department: p.department, category: p.category, subcategory: p.subcategory,
        price: Number(p.price || 0), cost_price: p.cost_price == null ? null : Number(p.cost_price),
        stock_quantity: Number(p.central_inventory?.[0]?.stock_quantity ?? p.stock ?? 0),
        low_stock_threshold: Number(p.central_inventory?.[0]?.low_stock_threshold ?? 5),
        is_active: p.is_active !== false && !p.is_deleted, image_url: p.image_url,
        gallery_images: p.gallery_images, enable_stock_tracking: p.enable_stock_tracking !== false,
        backorder: p.backorder === true, allow_backorder: p.allow_backorder === true,
      })));
      setTotal(count || 0);
    } catch (error) {
      console.error('Error loading central inventory:', error);
      setProducts([]); setTotal(0);
    } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const filtered = useMemo(() => products.filter(p => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q);
    const matchesStatus = status === 'all' || (status === 'active' && p.is_active) || (status === 'low' && p.is_active && p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold) || (status === 'out' && p.is_active && p.stock_quantity <= 0);
    return matchesSearch && matchesStatus;
  }), [products, search, status]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const softDelete = async () => {
    if (!deleteTarget) return;
    await ProductService.updateProduct(deleteTarget.id, { is_deleted: true, is_active: false });
    setDeleteTarget(null); await loadProducts();
  };

  return <div className="p-6 max-w-[1800px] mx-auto space-y-6">
    <div><h1 className="text-2xl font-bold text-white">Central Inventory</h1><p className="text-sm text-slate-400 mt-1">Canonical products and inventory. Store databases receive product changes through the database-level sync.</p></div>
    <div className="flex gap-3 flex-wrap"><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search products, SKU or brand..." className="flex-1 min-w-[260px] px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white" /><select value={status} onChange={e => { setStatus(e.target.value as any); setPage(1); }} className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white"><option value="all">All products</option><option value="active">Active</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></div>
    <div className="ch-card bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {loading ? <div className="p-12 text-center text-slate-400">Loading central inventory…</div> : filtered.length === 0 ? <div className="p-12 text-center text-slate-400">No products found.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-800/70 text-slate-400 uppercase text-[11px] tracking-wider"><tr><th className="px-4 py-3 text-left">Product</th><th className="px-4 py-3 text-left">Category</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3 text-right">Cost</th><th className="px-4 py-3 text-right">Central stock</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-800">{filtered.map(p => { const stockClass = p.stock_quantity <= 0 ? 'text-red-400' : p.stock_quantity <= p.low_stock_threshold ? 'text-amber-400' : 'text-emerald-400'; return <tr key={p.id} className="hover:bg-slate-800/40"><td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-slate-800 overflow-hidden"><ProductImage imageUrl={p.image_url} galleryImages={p.gallery_images} alt={p.name} className="w-full h-full object-cover" /></div><div><button onClick={() => setViewingProductId(p.id)} className="text-left font-medium text-white hover:text-cyan-400">{p.name}</button><div className="text-xs text-slate-500">{p.sku || 'No SKU'} · {p.brand || 'No brand'}</div></div></div></td><td className="px-4 py-3 text-slate-400">{p.category || p.department || '—'}{p.subcategory ? ` / ${p.subcategory}` : ''}</td><td className="px-4 py-3 text-right text-white">{formatCurrency(p.price)}</td><td className="px-4 py-3 text-right text-slate-400">{p.cost_price == null ? '—' : formatCurrency(p.cost_price)}</td><td className={`px-4 py-3 text-right font-bold ${stockClass}`}>{p.enable_stock_tracking ? p.stock_quantity : '—'}</td><td className="px-4 py-3">{!p.is_active ? <span className="text-slate-500">Inactive</span> : p.stock_quantity <= 0 ? <span className="text-red-400">Out</span> : p.stock_quantity <= p.low_stock_threshold ? <span className="text-amber-400">Low</span> : <span className="text-emerald-400">OK</span>}</td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-2"><button onClick={() => setEditingProduct(p)} className="px-2 py-1 text-xs rounded bg-slate-800 text-cyan-400 hover:bg-slate-700">Edit</button><button onClick={() => setDeleteTarget({ id: p.id, name: p.name })} className="px-2 py-1 text-xs rounded bg-slate-800 text-red-400 hover:bg-slate-700">Delete</button></div></td></tr>; })}</tbody></table></div>}
    </div>
    <div className="flex items-center justify-between text-sm text-slate-400"><span>{total} central products</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded bg-slate-800 disabled:opacity-40">Previous</button><span>Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded bg-slate-800 disabled:opacity-40">Next</button></div></div>
    <InventoryActivityLog />
    {editingProduct && <ProductEditModal product={editingProduct} onClose={() => setEditingProduct(null)} onSave={async () => { setEditingProduct(null); await loadProducts(); }} />}
    <ProductViewPanel productId={viewingProductId} onClose={() => setViewingProductId(null)} onEdit={id => { setViewingProductId(null); const p = products.find(x => x.id === id); if (p) setEditingProduct(p); }} />
    {deleteTarget && <DeleteConfirmationModal isOpen={true} title="Delete Product" message={`Delete ${deleteTarget.name}? This will mark the central product inactive.`} onConfirm={softDelete} onCancel={() => setDeleteTarget(null)} />}
  </div>;
}

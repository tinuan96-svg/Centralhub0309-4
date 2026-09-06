'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { InventoryManagementService } from '@/lib/services/inventory/inventoryManagementService';
import ProductImage from '@/components/ProductImage';
import { formatCurrency } from '@/lib/utils/currency';
import Link from 'next/link';

export default function StockLedgerClient({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;

  const [product, setProduct] = useState<any>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<any>(null);

  const loadData = useCallback(async () => {
    if (!productId || productId === '__placeholder') return;
    setLoading(true);
    try {
      const [prodRes, invRes, moveRes] = await Promise.all([
        supabase.from('products').select('*').eq('id', productId).maybeSingle(),
        supabase.from('central_inventory').select('*').eq('product_id', productId).maybeSingle(),
        InventoryManagementService.getMovements({ productId, limit: 100 })
      ]);

      if (prodRes.data) {
        setProduct(prodRes.data);
      }
      setInventory(invRes.data);
      setMovements(moveRes);
    } catch (e) {
      console.error('Error loading ledger data:', e);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading && productId !== '__placeholder') {
    return <div className="p-8 text-center text-slate-400">Loading Audit Trail for Product...</div>;
  }

  if (!product && productId !== '__placeholder') {
    return (
      <div className="p-12 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Product Not Found</h1>
        <button onClick={() => router.back()} className="px-6 py-2 bg-slate-800 text-white rounded-lg">Go Back</button>
      </div>
    );
  }

  if (productId === '__placeholder') {
    return <div className="p-8 text-center text-slate-400">Placeholder for Static Export</div>;
  }

  const physical = inventory?.stock_quantity ?? product.stock ?? 0;
  const reserved = inventory?.reserved_quantity ?? 0;
  const available = physical - reserved;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header / Breadcrumb */}
      <div className="flex items-center gap-4 mb-2">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-all border border-slate-700"
        >
          ←
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-100 uppercase tracking-tight">Stock Ledger (Audit Trail)</h1>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
            <Link href="/inventory-management/stock" className="hover:text-cyan-400">Registry</Link>
            <span className="mx-2 text-slate-700">/</span>
            <span className="text-cyan-400">{product.name}</span>
          </p>
        </div>
      </div>

      {/* Product Summary Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-3xl p-6 flex gap-6 shadow-xl">
           <div className="w-32 h-32 rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden flex-shrink-0">
              <ProductImage imageUrl={product.image_url} alt={product.name} />
           </div>
           <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start">
                 <div>
                    <h2 className="text-2xl font-black text-white leading-tight mb-1">{product.name}</h2>
                    <p className="text-slate-500 font-mono text-sm uppercase tracking-tighter">SKU: {product.sku || '—'} | Barcode: {product.gtin || product.barcode || '—'}</p>
                 </div>
                 <span className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {product.brand || 'No Brand'}
                 </span>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-6">
                 <div className="bg-slate-800/40 p-3 rounded-2xl border border-slate-700/50">
                    <p className="text-[9px] text-slate-500 uppercase font-black mb-1">Selling Price</p>
                    <p className="text-lg font-black text-amber-400">{formatCurrency(product.price)}</p>
                 </div>
                 <div className="bg-slate-800/40 p-3 rounded-2xl border border-slate-700/50">
                    <p className="text-[9px] text-slate-500 uppercase font-black mb-1">Cost Price</p>
                    <p className="text-lg font-black text-rose-400">{formatCurrency(product.cost_price || 0)}</p>
                 </div>
                 <div className="bg-slate-800/40 p-3 rounded-2xl border border-slate-700/50">
                    <p className="text-[9px] text-slate-500 uppercase font-black mb-1">Category</p>
                    <p className="text-sm font-black text-slate-200 truncate">{product.category || 'Uncategorized'}</p>
                 </div>
              </div>
           </div>
        </div>

        {/* Real-time metrics */}
        <div className="bg-slate-900 border border-cyan-500/20 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
           <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl -mr-16 -mt-16"></div>
           <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Current Stock Balance</h3>

           <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-slate-800">
                 <span className="text-sm font-bold text-slate-400">Total Physical Stock</span>
                 <span className="text-xl font-black text-white font-mono">{physical}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-slate-800">
                 <span className="text-sm font-bold text-slate-400">Reserved for Orders</span>
                 <span className="text-xl font-black text-amber-500/80 font-mono">{reserved}</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                 <span className="text-sm font-black text-cyan-500 uppercase tracking-wider">Net Available</span>
                 <span className="text-4xl font-black text-cyan-400 font-mono">{available}</span>
              </div>
           </div>
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
           <h3 className="text-sm font-black text-white uppercase tracking-widest">Transaction History</h3>
           <button onClick={loadData} className="text-xs font-bold text-cyan-500 hover:text-cyan-400 transition-colors uppercase tracking-widest">Refresh Logs</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/30">
              <tr>
                <th className="px-6 py-4 text-left font-bold text-slate-500 uppercase tracking-widest text-[10px]">Timestamp</th>
                <th className="px-6 py-4 text-center font-bold text-slate-500 uppercase tracking-widest text-[10px]">Movement Type</th>
                <th className="px-6 py-4 text-right font-bold text-slate-500 uppercase tracking-widest text-[10px]">Prev</th>
                <th className="px-6 py-4 text-center font-bold text-slate-500 uppercase tracking-widest text-[10px]">Change</th>
                <th className="px-6 py-4 text-right font-bold text-slate-500 uppercase tracking-widest text-[10px]">Balance</th>
                <th className="px-6 py-4 text-left font-bold text-slate-500 uppercase tracking-widest text-[10px]">Notes & References</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {movements.length === 0 ? (
                <tr>
                   <td colSpan={6} className="px-6 py-20 text-center text-slate-600 italic">No ledger entries found for this product.</td>
                </tr>
              ) : movements.map(m => (
                <tr key={m.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="text-slate-200 text-xs font-mono">{new Date(m.created_at).toLocaleDateString('en-GB')}</p>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">{new Date(m.created_at).toLocaleTimeString('en-GB')}</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                      (m.change_amount || 0) < 0
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}>
                      {m.action_type || 'UNKNOWN'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-slate-500 font-mono">{m.old_stock}</td>
                  <td className={`px-6 py-4 text-center font-black font-mono text-base ${
                    m.change_amount > 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {m.change_amount > 0 ? '▲' : '▼'} {Math.abs(m.change_amount)}
                  </td>
                  <td className="px-6 py-4 text-right text-slate-100 font-black font-mono text-base">{m.new_stock}</td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                       <p className="text-slate-300 text-xs font-medium leading-snug">{m.notes}</p>
                       {m.order_number && (
                          <span className="inline-flex items-center px-1.5 py-0.5 bg-cyan-500/10 text-cyan-500 text-[8px] font-black rounded uppercase border border-cyan-500/20">Order: {m.order_number}</span>
                       )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

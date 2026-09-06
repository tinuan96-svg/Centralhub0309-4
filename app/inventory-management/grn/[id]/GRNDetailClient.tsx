'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils/currency';
import ProductImage from '@/components/ProductImage';

export default function GRNDetailClient({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [invoice, setInvoice] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!id || id === '__placeholder' || id === 'new') return;
    setLoading(true);
    try {
      const [invRes, itemsRes] = await Promise.all([
        supabase.from('supplier_invoices').select('*, suppliers(name)').eq('id', id).single(),
        supabase.from('supplier_invoice_items').select('*, products(image_url, gtin, sku)').eq('invoice_id', id)
      ]);

      if (invRes.error) throw invRes.error;
      setInvoice(invRes.data);
      setItems(itemsRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading && id !== '__placeholder') return <div className="p-12 text-center text-slate-500">Loading delivery details...</div>;
  if (id === '__placeholder') return <div className="p-12 text-center text-slate-500">Placeholder</div>;
  if (!invoice) return <div className="p-12 text-center text-white">Delivery record not found.</div>;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-2">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-all border border-slate-700"
        >
          ←
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-100 uppercase tracking-tight">Delivery Verification Details</h1>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
             Invoice {invoice.invoice_number} from {invoice.suppliers?.name}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
         <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Invoice Total</p>
            <p className="text-2xl font-black text-white">{formatCurrency(invoice.total_amount)}</p>
         </div>
         <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Items Received</p>
            <p className="text-2xl font-black text-cyan-400">{items.reduce((sum, it) => sum + it.quantity, 0)}</p>
         </div>
         <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Status</p>
            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded text-[10px] font-black uppercase border border-emerald-500/20">{invoice.status}</span>
         </div>
         <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Received On</p>
            <p className="text-sm font-bold text-slate-300">{new Date(invoice.created_at).toLocaleString('en-GB')}</p>
         </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
         <table className="w-full text-sm text-left">
            <thead className="bg-slate-800/50 text-slate-400 uppercase text-[10px] font-black tracking-widest">
               <tr>
                  <th className="px-6 py-4">Product</th>
                  <th className="px-6 py-4 text-center">Qty</th>
                  <th className="px-6 py-4 text-right">Agreed Price</th>
                  <th className="px-6 py-4 text-right">Invoiced Price</th>
                  <th className="px-6 py-4 text-right">Total</th>
                  <th className="px-6 py-4 text-center">Verification</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
               {items.map(item => (
                  <tr key={item.id} className={`hover:bg-slate-800/20 transition-colors ${item.discrepancy_found ? 'bg-rose-500/5' : ''}`}>
                     <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-lg bg-slate-800 overflow-hidden flex-shrink-0">
                              <ProductImage imageUrl={item.products?.image_url} alt={item.product_name} />
                           </div>
                           <div>
                              <p className="font-bold text-slate-200">{item.product_name}</p>
                              <p className="text-[10px] text-slate-500 font-mono">SKU: {item.supplier_sku || item.products?.sku}</p>
                           </div>
                        </div>
                     </td>
                     <td className="px-6 py-4 text-center font-bold text-slate-300">{item.quantity}</td>
                     <td className="px-6 py-4 text-right font-mono text-slate-500">{formatCurrency(item.agreed_price)}</td>
                     <td className={`px-6 py-4 text-right font-black font-mono ${item.discrepancy_found ? 'text-rose-400' : 'text-slate-300'}`}>
                        {formatCurrency(item.invoiced_price)}
                     </td>
                     <td className="px-6 py-4 text-right font-black text-cyan-400 font-mono">{formatCurrency(item.invoiced_price * item.quantity)}</td>
                     <td className="px-6 py-4 text-center">
                        {item.discrepancy_found ? (
                           <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 rounded text-[8px] font-black uppercase border border-rose-500/20">Price Warning</span>
                        ) : (
                           <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded text-[8px] font-black uppercase border border-emerald-500/20">Verified</span>
                        )}
                     </td>
                  </tr>
               ))}
            </tbody>
         </table>
      </div>
    </div>
  );
}

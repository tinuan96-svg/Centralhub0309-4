'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils/currency';
import ProductImage from '@/components/ProductImage';

export default function PODraftReviewClient({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [draft, setDraft] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('po_drafts')
        .select('*, suppliers(name, contact_email, contact_phone)')
        .eq('id', id)
        .single();

      if (error) throw error;
      setDraft(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStatusUpdate = async (status: 'approved' | 'rejected') => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('po_drafts')
        .update({
          status,
          approved_at: status === 'approved' ? new Date().toISOString() : null
        })
        .eq('id', id);

      if (error) throw error;
      router.push('/procurement');
    } catch (e: any) {
      alert('Error updating status: ' + e.message);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <div className="p-12 text-center text-slate-500">Loading draft details...</div>;
  if (!draft) return <div className="p-12 text-center text-white">Draft not found.</div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-700 hover:text-white">←</button>
            <div>
                <h1 className="text-xl font-bold text-white uppercase tracking-tight">Review Purchase Draft</h1>
                <p className="text-xs text-slate-500 font-black uppercase tracking-widest mt-1">Ref: {draft.id.slice(0, 8)} • {draft.suppliers?.name}</p>
            </div>
        </div>
        <div className="flex gap-3">
           <button
             onClick={() => handleStatusUpdate('rejected')}
             disabled={processing || draft.status !== 'draft'}
             className="px-6 py-2.5 bg-rose-600/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-black uppercase hover:bg-rose-600/30 transition-all disabled:opacity-50"
           >
             Reject Draft
           </button>
           <button
             onClick={() => handleStatusUpdate('approved')}
             disabled={processing || draft.status !== 'draft'}
             className="px-8 py-2.5 bg-cyan-600 text-white rounded-xl text-xs font-black uppercase hover:bg-cyan-500 transition-all shadow-lg shadow-cyan-900/20 disabled:opacity-50"
           >
             Approve & Send
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recommended Line Items</h3>
                </div>
                <div className="divide-y divide-slate-800">
                    {(draft.draft_items || []).map((item: any, idx: number) => (
                        <div key={idx} className="p-6 flex gap-4">
                            <div className="w-12 h-12 rounded-xl bg-slate-800 overflow-hidden flex-shrink-0">
                                <ProductImage imageUrl={item.product_image} alt={item.product_name} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h4 className="font-bold text-slate-200">{item.product_name}</h4>
                                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">{item.sku}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-black text-white">{item.units_total}</p>
                                        <p className="text-[8px] text-slate-500 uppercase font-black">Total Units</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-4 mt-4">
                                    <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-800">
                                        <p className="text-[8px] text-slate-500 uppercase font-black mb-1">Pack Size</p>
                                        <p className="text-xs font-bold text-slate-300">{item.pack_size}</p>
                                    </div>
                                    <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-800">
                                        <p className="text-[8px] text-slate-500 uppercase font-black mb-1">Packs</p>
                                        <p className="text-xs font-bold text-slate-300">{item.packs}</p>
                                    </div>
                                    <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-800">
                                        <p className="text-[8px] text-slate-500 uppercase font-black mb-1">Cost/Pack</p>
                                        <p className="text-xs font-bold text-emerald-400">{formatCurrency(item.cost_per_pack)}</p>
                                    </div>
                                </div>
                                {item.evidence?.reasoning && (
                                    <div className="mt-3 p-2 bg-cyan-500/5 rounded-lg border border-cyan-500/10">
                                        <p className="text-[10px] text-cyan-400/80 italic">&quot;{item.evidence.reasoning}&quot;</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
         </div>

         <div className="space-y-6">
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Draft Summary</h3>
                <div className="space-y-4">
                    <div className="flex justify-between items-center pb-4 border-b border-slate-800">
                        <span className="text-xs text-slate-400 font-bold">Total Amount</span>
                        <span className="text-2xl font-black text-cyan-400">{formatCurrency(draft.total_amount)}</span>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Trigger Reason</p>
                        <p className="text-xs text-slate-300 italic">{draft.trigger_reason}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Supplier Contact</p>
                        <p className="text-xs text-slate-300">{draft.suppliers?.contact_email || 'N/A'}</p>
                        <p className="text-xs text-slate-300">{draft.suppliers?.contact_phone || 'N/A'}</p>
                    </div>
                </div>
            </div>

            <div className="bg-slate-900 border border-cyan-500/20 rounded-3xl p-6">
                <h3 className="text-[10px] font-black text-cyan-500 uppercase tracking-widest mb-4">Approval Logic</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    Approving this draft will mark it as ready for purchase. The system will then allow this to be converted into a live Supplier Invoice upon receipt of goods.
                </p>
                <div className="flex items-center gap-3 text-xs text-emerald-400 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Verified against current stock
                </div>
            </div>
         </div>
      </div>
    </div>
  );
}

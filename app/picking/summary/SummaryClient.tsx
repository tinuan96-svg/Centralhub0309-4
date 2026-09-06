'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PickingService } from '@/lib/services/pickingService';
import { OrderWithItems } from '@/lib/types';
import { supabase } from '@/lib/supabase';

export default function SummaryClient({ params: _params, searchParams: _searchParams }: { params: any; searchParams: any }) {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';
  const router = useRouter();
  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadOrder = useCallback(async () => {
    if (!id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('id', id)
      .single();

    if (error || !data) {
      setIsLoading(false);
      return;
    }
    setOrder(data);
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    loadOrder();
  }, [id, loadOrder]);

  const [moving, setMoving] = useState(false);

  const handleMoveToPacking = async () => {
    if (moving) return;
    setMoving(true);
    const { success } = await PickingService.moveToPacking(id);
    if (success) {
      router.push('/picking');
    }
    setMoving(false);
  };

  const handleReadyToShip = async () => {
    if (moving) return;
    setMoving(true);
    const { success } = await PickingService.markReadyToShip(id);
    if (success) {
      router.push('/picking');
    }
    setMoving(false);
  };

  if (isLoading || !order) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const rawItems = Array.isArray(order.items) ? order.items : [];
  const pickedItems = rawItems.filter((i: any) => i.picked_quantity > 0);
  const skippedItems = rawItems.filter((i: any) => i.skip_reason);
  const oosItems = rawItems.filter((i: any) => i.skip_reason === 'Out of Stock');

  const durationStr = order.picking_duration
    ? `${Math.floor(Number(order.picking_duration) / 60)}m ${Number(order.picking_duration) % 60}s`
    : 'N/A';

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="p-12 text-center">
          <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-900/40">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-4xl font-black text-white mb-2">Picking Completed</h1>
          <p className="text-xl text-slate-400 font-mono">{order.order_number}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 px-8 pb-8">
          <div className="bg-slate-800/50 rounded-3xl p-6 border border-slate-700/30">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Products Picked</p>
            <p className="text-3xl font-black text-white">{pickedItems.length} / {rawItems.length}</p>
          </div>
          <div className="bg-slate-800/50 rounded-3xl p-6 border border-slate-700/30">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Time Taken</p>
            <p className="text-3xl font-black text-cyan-400">{durationStr}</p>
          </div>
          <div className="bg-slate-800/50 rounded-3xl p-6 border border-slate-700/30">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Skipped Items</p>
            <p className="text-3xl font-black text-amber-500">{skippedItems.length}</p>
          </div>
          <div className="bg-slate-800/50 rounded-3xl p-6 border border-slate-700/30">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Out of Stock</p>
            <p className="text-3xl font-black text-red-500">{oosItems.length}</p>
          </div>
        </div>

        {skippedItems.length > 0 && (
          <div className="px-8 pb-8">
             <div className="bg-slate-800/20 border border-slate-800 rounded-3xl p-6">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Issues to Review</h3>
                <div className="space-y-3">
                  {skippedItems.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center bg-slate-800/40 p-3 rounded-xl">
                      <div>
                        <p className="text-xs font-bold text-white">{item.name || item.product_name || 'Unknown Product'}</p>
                        <p className="text-[10px] text-slate-500">{item.skip_reason}</p>
                      </div>
                      <span className="text-[10px] font-bold text-red-400 bg-red-400/10 px-2 py-0.5 rounded uppercase">
                        {item.skip_reason}
                      </span>
                    </div>
                  ))}
                </div>
             </div>
          </div>
        )}

        <div className="p-8 bg-slate-900/50 border-t border-slate-800 flex gap-4">
          <button
            onClick={() => router.push('/picking')}
            className="flex-1 py-5 rounded-3xl bg-slate-800 text-white font-bold text-lg hover:bg-slate-700 transition-colors"
          >
            BACK TO QUEUE
          </button>
          <button
            onClick={handleMoveToPacking}
            disabled={moving}
            className="flex-1 py-5 rounded-3xl bg-cyan-600 text-white font-bold text-lg hover:bg-cyan-500 shadow-xl shadow-cyan-900/40 transition-all active:scale-95 disabled:opacity-50"
          >
            MOVE TO PACKING
          </button>
          <button
            onClick={handleReadyToShip}
            disabled={moving}
            className="flex-1 py-5 rounded-3xl bg-emerald-600 text-white font-bold text-lg hover:bg-emerald-500 shadow-xl shadow-emerald-900/40 transition-all active:scale-95 disabled:opacity-50"
          >
            READY TO SHIP
          </button>
        </div>
      </div>
    </div>
  );
}

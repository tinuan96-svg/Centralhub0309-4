'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import StoreBadge from '@/components/StoreBadge';
import { useRouter } from 'next/navigation';
import StoreScopeSelector from '@/components/StoreScopeSelector';

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  order_status: string;
  created_at: string;
  item_count: number;
  store_id: string;
}

export default function PackingQueueClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('orders')
        .select('id, order_number, customer_name, order_status, created_at, store_id, items')
        .in('order_status', ['picked', 'packing'])
        .eq('payment_status', 'paid');

      if (selectedStoreId) {
        query = query.eq('store_id', selectedStoreId);
      }

      const { data, error } = await query
        .order('created_at', { ascending: true });

      if (error) throw error;

      const formatted = (data || []).map(o => ({
        id: o.id,
        order_number: o.order_number,
        customer_name: o.customer_name,
        order_status: o.order_status,
        created_at: o.created_at,
        store_id: o.store_id,
        item_count: Array.isArray(o.items) ? o.items.length : 0
      }));

      setOrders(formatted);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const channelId = Math.random().toString(36).substring(2, 11);
    const channel = supabase.channel(`packing_queue_${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchOrders, selectedStoreId]);

  return (
    <div className="p-4 space-y-6 max-w-4xl mx-auto pb-32">
       <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl">
         <StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} />
       </div>
       <header>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">Packing Verification</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Scan products to pack</p>
       </header>

       {loading && orders.length === 0 ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-32 bg-slate-800/50 rounded-2xl animate-pulse" />)}
          </div>
       ) : orders.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/50 rounded-3xl border border-slate-800 border-dashed">
            <p className="text-slate-500 font-bold">No orders ready for packing.</p>
            <p className="text-[10px] text-slate-600 uppercase mt-2">Finish picking first</p>
          </div>
       ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800/50 border-b border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="p-4">Store</th>
                    <th className="p-4">Order No</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Items</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {orders.map(order => (
                    <tr key={order.id} className="hover:bg-slate-800/30 transition-colors cursor-pointer" onClick={() => router.push(`/packing/${order.id}`)}>
                      <td className="p-4"><StoreBadge store={{ id: order.store_id, name: '', slug: '' }} size="sm" /></td>
                      <td className="p-4 font-mono font-bold text-blue-400">#{order.order_number}</td>
                      <td className="p-4 font-bold text-slate-200">{order.customer_name}</td>
                      <td className="p-4 text-slate-400">{order.item_count} Items</td>
                      <td className="p-4 text-slate-500 text-xs">{new Date(order.created_at).toLocaleDateString('en-GB')}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          order.order_status === 'packing' ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {order.order_status}
                        </span>
                      </td>
                      <td className="p-4 text-right text-cyan-400 font-bold text-xs">Verify →</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden grid gap-4">
              {orders.map(order => (
                <div
                  key={order.id}
                  onClick={() => router.push(`/packing/${order.id}`)}
                  className="bg-slate-900/40 border border-slate-800 p-5 rounded-2xl active:scale-[0.98] transition-all flex justify-between items-center select-none touch-manipulation"
                >
                  <div className="space-y-1">
                     <div className="flex items-center gap-2">
                        <StoreBadge store={{ id: order.store_id, name: '', slug: '' }} size="sm" />
                        <span className="font-mono text-xs text-blue-400 font-bold">#{order.order_number}</span>
                     </div>
                     <h3 className="text-lg font-black text-white">{order.customer_name}</h3>
                     <div className="flex items-center gap-3 text-[10px] text-slate-500 font-bold uppercase">
                        <span>{order.item_count} Items</span>
                        <span>•</span>
                        <span>{new Date(order.created_at).toLocaleDateString('en-GB')}</span>
                     </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                     <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                       order.order_status === 'packing' ? 'bg-orange-500 text-white shadow-lg shadow-orange-900/40' : 'bg-slate-800 text-slate-400'
                     }`}>
                        {order.order_status}
                     </span>
                     <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
                        ➡️
                     </div>
                  </div>
                </div>
              ))}
            </div>
          </>
       )}
    </div>
  );
}

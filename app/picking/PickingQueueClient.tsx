'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { designTokens } from '@/lib/design-system';
import { PickingService } from '@/lib/services/pickingService';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import StoreScopeSelector from '@/components/StoreScopeSelector';

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  order_status: string;
  created_at: string;
  item_count: number;
  warehouse_status: string;
  locations: string[];
}

export default function PickingQueueClient({ params, searchParams }: { params: any; searchParams: any }) {
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchOrders = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      // Fetch orders with items stored as JSONB array on the orders table
      // Filter: Only Paid/Confirmed orders that are ready for picking
      let query = supabase
        .from('orders')
        .select(`
          id,
          order_number,
          customer_name,
          order_status,
          payment_status,
          created_at,
          warehouse_status,
          items
        `)
        .in('order_status', ['paid', 'confirmed', 'picking']);

      if (selectedStoreId) {
        query = query.eq('store_id', selectedStoreId);
      }

      const { data: orderData, error: orderError } = await query
        .order('created_at', { ascending: true });

      if (orderError) throw orderError;

      if (!orderData || orderData.length === 0) {
        setOrders([]);
        return;
      }

      // Fetch items from order_items table as fallback when JSONB items is empty
      let ordersWithItems = orderData;
      const ordersMissingItems = orderData.filter((o: any) => !Array.isArray(o.items) || o.items.length === 0);

      if (ordersMissingItems.length > 0) {
        const orderIds = ordersMissingItems.map((o: any) => o.id);
        const { data: orderItemsData, error: orderItemsError } = await supabase
          .from('order_items')
          .select('order_id, product_id, name, image, quantity, price, subtotal, brand, weight, unit')
          .in('order_id', orderIds);

        if (!orderItemsError && orderItemsData) {
          const itemsByOrder = new Map<string, any[]>();
          orderItemsData.forEach((item: any) => {
            if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
            itemsByOrder.get(item.order_id)!.push({
              product_id: item.product_id,
              name: item.name,
              image: item.image,
              quantity: item.quantity,
              price: item.price,
              subtotal: item.subtotal,
              brand: item.brand,
              weight: item.weight,
              unit: item.unit,
            });
          });
          ordersWithItems = orderData.map((o: any) => ({
            ...o,
            items: (Array.isArray(o.items) && o.items.length > 0) ? o.items : (itemsByOrder.get(o.id) || []),
          }));
        }
      }

      // Collect product IDs from all orders' items to fetch warehouse locations
      const allProductIds = new Set<string>();
      ordersWithItems.forEach((o: any) => {
        const items = Array.isArray(o.items) ? o.items : [];
        items.forEach((item: any) => {
          if (item.product_id) allProductIds.add(item.product_id);
        });
      });

      let productLocationMap = new Map<string, string>();
      if (allProductIds.size > 0) {
        const { data: products, error: productError } = await supabase
          .from('products')
          .select('id, warehouse_location')
          .in('id', Array.from(allProductIds));

        if (!productError && products) {
          products.forEach((p: any) => {
            if (p.warehouse_location) {
              productLocationMap.set(p.id, p.warehouse_location);
            }
          });
        }
      }

      const formattedOrders = ordersWithItems
        .map((o: any) => {
          const items = Array.isArray(o.items) ? o.items : [];
          const locations = new Set<string>();
          items.forEach((item: any) => {
            if (item.product_id) {
              const loc = productLocationMap.get(item.product_id);
              if (loc) locations.add(loc);
            }
          });
          return {
            ...o,
            item_count: items.length,
            locations: Array.from(locations),
          };
        })
        .filter((o: any) => {
          if (o.item_count === 0) return false;
          const items = Array.isArray(o.items) ? o.items : [];
          const allDone = items.every((item: any) =>
            (item.picked_quantity != null && item.picked_quantity >= (item.quantity || 1)) ||
            (item.skip_reason != null && item.skip_reason !== '')
          );
          return !allDone;
        });

      // Self-healing: if any order has all items picked/skipped but is still in 'picking' status,
      // it means completePicking failed or was interrupted. Auto-complete it now.
      const stuckOrders = ordersWithItems.filter((o: any) => {
        const items = Array.isArray(o.items) ? o.items : [];
        if (items.length === 0) return false;
        const allDone = items.every((item: any) =>
          (item.picked_quantity != null && item.picked_quantity >= (item.quantity || 1)) ||
          (item.skip_reason != null && item.skip_reason !== '')
        );
        return allDone && (o.order_status === 'picking' || o.order_status === 'confirmed');
      });

      if (stuckOrders.length > 0) {
        const ids = stuckOrders.map((o: any) => o.id);
        supabase.from('orders').update({
          order_status: 'packing',
          warehouse_status: 'packing',
          picking_completed_at: new Date().toISOString(),
          locked_by: null,
          locked_at: null,
          updated_at: new Date().toISOString(),
        })
        .in('id', ids)
        .then(({ error }) => {
          if (error) console.error('Self-healing completePicking error:', error);
        });
      }

      setOrders(formattedOrders);
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;

    console.log('PickingQueue: Initializing realtime channel...');
    fetchOrders(true);

    const channelId = Math.random().toString(36).substring(2, 11);
    const channel = supabase.channel(`picking_queue_${channelId}`);

    channel
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders'
      }, () => {
        console.log('PickingQueue: Orders changed, refreshing...');
        fetchOrders();
      })
      .subscribe((status) => {
        console.log(`PickingQueue: Channel status is ${status}`);
      });

    return () => {
      console.log('PickingQueue: Cleaning up realtime channel...');
      supabase.removeChannel(channel);
    };
  }, [fetchOrders, mounted, selectedStoreId]);

  async function startPicking(orderId: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const result = await PickingService.startPicking(orderId, user?.id || '');
      if (!result.success) {
        console.error('Error starting picking:', result.error);
        return;
      }
      router.push(`/picking/active?id=${orderId}`);
    } catch (err) {
      console.error('Error starting picking:', err);
    }
  }

  // Prevent hydration mismatch by not rendering the time until mounted
  const formatTime = (dateStr: string) => {
    if (!mounted) return '--:--';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 mb-4">
        <StoreScopeSelector value={selectedStoreId} onStoreChange={setSelectedStoreId} />
      </div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg sm:text-xl font-bold text-white">Pending Orders</h2>
        <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded text-sm font-medium">
          {orders.length} Orders
        </span>
      </div>

      {loading ? (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-400">No orders waiting for picking.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="ch-card hidden md:block bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800/50 border-b border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="p-4">Order No</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Items</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Locations</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {orders.map(order => (
                  <tr key={order.id} className="hover:bg-slate-800/30 transition-colors cursor-pointer" onClick={() => startPicking(order.id)}>
                    <td className="p-4 font-mono font-bold text-blue-400">#{order.order_number}</td>
                    <td className="p-4 font-bold text-slate-200">{order.customer_name}</td>
                    <td className="p-4 text-slate-400">{order.item_count} Items</td>
                    <td className="p-4 text-slate-500 text-xs">{formatTime(order.created_at)}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {order.locations.slice(0, 3).map(loc => (
                          <span key={loc} className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-[8px] font-bold">{loc}</span>
                        ))}
                        {order.locations.length > 3 && <span className="text-[8px] text-slate-600">+{order.locations.length - 3}</span>}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        order.order_status === 'picking' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {order.order_status}
                      </span>
                    </td>
                    <td className="p-4 text-right text-cyan-400 font-bold text-xs">Start Pick →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden grid gap-3 sm:gap-4">
            {orders.map((order) => (
              <div
                key={order.id}
                onClick={() => startPicking(order.id)}
                className={`p-4 rounded-xl border transition-all active:scale-[0.98] cursor-pointer ${
                  order.warehouse_status === 'picking'
                    ? 'bg-blue-900/20 border-blue-500/50'
                    : 'bg-slate-800/50 border-slate-700/50'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                      #{order.order_number}
                    </span>
                    <h3 className="text-lg font-bold text-white mt-0.5">{order.customer_name}</h3>
                  </div>
                  <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                    order.order_status === 'picking'
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-700 text-slate-300'
                  }`}>
                    {order.order_status}
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:gap-4 text-sm text-slate-400 mt-4">
                  <div className="flex items-center gap-1.5">
                    <span>📦</span>
                    <span>{order.item_count} Items</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span>🕒</span>
                    <span>{formatTime(order.created_at)}</span>
                  </div>
                </div>

                {order.locations.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-700/50">
                    <p className="text-xs text-slate-500 font-bold uppercase mb-2">Pick Locations</p>
                    <div className="flex flex-wrap gap-1.5">
                      {order.locations.map(loc => (
                        <span key={loc} className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-lg text-xs font-mono font-bold">
                          {loc}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {order.order_status === 'picking' && (
                  <div className="mt-4 pt-4 border-t border-blue-500/20 flex items-center gap-2 text-blue-400 text-sm">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                    Currently being picked
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

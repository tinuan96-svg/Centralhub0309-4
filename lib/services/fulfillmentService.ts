import { supabase } from '@/lib/supabase';

export type FulfillmentStatus =
  | 'pending_payment'
  | 'paid'
  | 'confirmed'
  | 'picking'
  | 'picked'
  | 'packing'
  | 'packed'
  | 'ready_to_ship'
  | 'shipment_booked'
  | 'collected'
  | 'shipped'
  | 'at_local_depot'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'delivery_attempted'
  | 'ready_for_collection'
  | 'delivery_rescheduled'
  | 'returned'
  | 'failed';

export interface FulfillmentOrder {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  company_name: string | null;
  delivery_address: string;
  delivery_city: string;
  delivery_postcode: string;
  total: number;
  fulfillment_status: FulfillmentStatus;
  packed_at: string | null;
  ready_to_ship_at: string | null;
  fulfillment_notes: string | null;
  created_at: string;
  order_status: string;
  store_id: string;
  total_weight_kg: number;
  shipment?: {
    id: string;
    shipment_number: string;
    tracking_number: string;
    label_url: string;
    status: string;
    carrier: string;
    service_type: string;
    shipping_cost: number;
    error_message?: string | null;
  };
}

export class FulfillmentService {
  static async getOrdersByFulfillmentStatus(
    status?: FulfillmentStatus | FulfillmentStatus[]
  ): Promise<FulfillmentOrder[]> {
    try {
      let query = supabase
        .from('orders')
        .select(`
          id,
          order_number,
          customer_name,
          customer_email,
          customer_phone,
          company_name,
          delivery_address,
          delivery_city,
          delivery_postcode,
          total,
          fulfillment_status,
          packed_at,
          ready_to_ship_at,
          fulfillment_notes,
          created_at,
          order_status,
          store_id,
          order_items (
            quantity,
            products ( weight_kg, weight_grams )
          ),
          shipments (
            id,
            shipment_number,
            tracking_number,
            label_url,
            status,
            carrier,
            service_type,
            shipping_cost
          )
        `)
        .eq('payment_status', 'paid')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (status) {
        if (Array.isArray(status)) {
          query = query.in('fulfillment_status', status);
          console.log('Querying paid orders with fulfillment_status IN:', status);
        } else {
          query = query.eq('fulfillment_status', status);
          console.log('Querying paid orders with fulfillment_status:', status);
        }
      } else {
        console.log('Querying all paid orders (no fulfillment status filter)');
      }

      const { data, error } = await query.limit(500);

      if (error) {
        console.error('Supabase query error:', error);
        throw error;
      }

      console.log(`Found ${data?.length || 0} paid orders`);

      return (data || []).map(order => {
        const total_weight_kg = (order.order_items || []).reduce((sum: number, item: any) => {
          const product = item.products;
          if (!product) return sum;
          const itemWeightKg = product.weight_kg != null
            ? Number(product.weight_kg)
            : product.weight_grams != null
              ? Number(product.weight_grams) / 1000
              : 0;
          return sum + itemWeightKg * item.quantity;
        }, 0);

        return {
          ...order,
          total_weight_kg: total_weight_kg > 0 ? Math.round(total_weight_kg * 100) / 100 : 0.5,
          shipment: order.shipments && order.shipments.length > 0 ? order.shipments[0] : undefined,
        };
      });
    } catch (error) {
      console.error('Error fetching orders by fulfillment status:', error);
      return [];
    }
  }

  static async updateFulfillmentStatus(
    orderId: string,
    status: FulfillmentStatus,
    notes?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.rpc('update_order_fulfillment_status', {
        p_order_id: orderId,
        p_status: status,
        p_notes: notes || null,
      });

      if (error) throw error;

      await this.syncStatusToStore(orderId, status);
      await this.createAuditEntry(orderId, status, notes);

      return { success: true };
    } catch (error: any) {
      console.error('Error updating fulfillment status:', error);
      return { success: false, error: error.message };
    }
  }

  static async bulkUpdateFulfillmentStatus(
    orderIds: string[],
    status: FulfillmentStatus,
    notes?: string
  ): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('bulk_update_fulfillment_status', {
        p_order_ids: orderIds,
        p_status: status,
        p_notes: notes || null,
      });

      if (error) throw error;

      await Promise.all(orderIds.map(id => this.syncStatusToStore(id, status)));
      await Promise.all(orderIds.map(id => this.createAuditEntry(id, status, notes)));

      return { success: true, count: data || 0 };
    } catch (error: any) {
      console.error('Error bulk updating fulfillment status:', error);
      return { success: false, count: 0, error: error.message };
    }
  }

  static async markAsPacked(orderIds: string[]): Promise<{ success: boolean; count: number }> {
    return this.bulkUpdateFulfillmentStatus(orderIds, 'packed');
  }

  static async markAsReadyToShip(orderIds: string[]): Promise<{ success: boolean; count: number }> {
    return this.bulkUpdateFulfillmentStatus(orderIds, 'ready_to_ship');
  }

  static async markAsShipped(orderIds: string[]): Promise<{ success: boolean; count: number }> {
    return this.bulkUpdateFulfillmentStatus(orderIds, 'shipped');
  }

  static async getOrdersReadyForShipping(): Promise<FulfillmentOrder[]> {
    try {
      // Shipping and shipment history is an operational/financial surface: only payment-received orders belong here.
      // Include delivered/completed rows so the page can provide a real Delivered filter/history instead of losing them upstream.
      let query = supabase
        .from('orders')
        .select(`
          *,
          order_items (
            quantity
          ),
          shipments (
            *
          )
        `)
        .eq('payment_status', 'paid')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      const shippingStatuses = '("packed","ready_to_ship","shipment_booked","collected","shipped","at_local_depot","out_for_delivery","delivery_attempted","delivery_rescheduled","delivered","completed")';
      query = query.or(`order_status.in.${shippingStatuses},fulfillment_status.in.${shippingStatuses}`);

      const { data, error } = await query.limit(1000);
      if (error) throw error;

      return (data || [])
        .map(order => {
          const total_weight_kg = (order as any).total_weight_kg || 0.5;
          return {
            ...order,
            fulfillment_status: order.fulfillment_status || order.order_status,
            total_weight_kg: total_weight_kg > 0 ? Math.round(total_weight_kg * 100) / 100 : 0.5,
            shipment: order.shipments && order.shipments.length > 0 ? order.shipments[0] : undefined,
          };
        })
        .filter(order => {
          const orderStatus = order.order_status?.toLowerCase();
          const shipmentStatus = order.shipment?.status?.toLowerCase();
          const excludedOrder = ['cancelled', 'refunded'].includes(orderStatus);
          const excludedShipment = ['cancelled', 'returned'].includes(shipmentStatus);
          return !excludedOrder && !excludedShipment;
        });
    } catch (e) {
      console.error('Error in getOrdersReadyForShipping:', e);
      return [];
    }
  }

  static async getOrdersPendingPacking(): Promise<FulfillmentOrder[]> {
    return this.getOrdersByFulfillmentStatus(['confirmed', 'picking', 'packing', 'paid']);
  }

  static async getFulfillmentStats(storeId?: string): Promise<{
    pending_payment: number;
    paid: number;
    confirmed: number;
    picking: number;
    packing: number;
    ready_to_ship: number;
    shipped: number;
    delivered: number;
    failed_shipments: number;
    avg_picking_time: string;
    avg_packing_time: string;
  }> {
    try {
      // Fulfilment KPIs must represent payment-received business only.
      let query = supabase
        .from('orders')
        .select('*')
        .eq('payment_status', 'paid')
        .eq('is_deleted', false);

      if (storeId && storeId !== 'all') {
        query = query.eq('store_id', storeId);
      }

      const { data: allOrders, error: ordersError } = await query.limit(5000);

      if (ordersError) throw ordersError;

      let shipmentQuery = supabase
        .from('shipments')
        .select('status, order_id')
        .eq('status', 'failed');

      const { data: failedShipments } = await shipmentQuery;
      const paidOrderIds = new Set((allOrders || []).map(o => o.id));
      const filteredFailedCount = (failedShipments || []).filter(s => paidOrderIds.has(s.order_id)).length;

      const stats = {
        pending_payment: 0,
        paid: 0,
        confirmed: 0,
        picking: 0,
        packing: 0,
        ready_to_ship: 0,
        shipped: 0,
        delivered: 0,
        failed_shipments: filteredFailedCount,
        avg_picking_time: '0m',
        avg_packing_time: '0m'
      };

      let totalPickingSeconds = 0;
      let pickingCount = 0;

      (allOrders || []).forEach(order => {
        const statusVal = (order.order_status || order.fulfillment_status || order.warehouse_status || '').toLowerCase();

        if (['completed', 'delivered'].includes(statusVal)) {
          stats.delivered++;
        } else if (['shipped', 'shipment_booked', 'collected', 'at_local_depot', 'out_for_delivery', 'delivery_attempted', 'delivery_rescheduled'].includes(statusVal)) {
          stats.shipped++;
        } else if (['ready_to_ship', 'packed'].includes(statusVal)) {
          stats.ready_to_ship++;
        } else if (['packing', 'picked', 'ready_for_packing'].includes(statusVal)) {
          stats.packing++;
        } else if (['picking'].includes(statusVal)) {
          stats.picking++;
        } else if (['confirmed', 'paid'].includes(statusVal)) {
          if (statusVal === 'paid' && order.order_status === 'pending_payment') stats.paid++;
          else stats.confirmed++;
        }

        const duration = order.picking_duration;
        if (duration) {
          totalPickingSeconds += Number(duration);
          pickingCount++;
        }
      });

      if (pickingCount > 0) {
        const avg = Math.round(totalPickingSeconds / pickingCount);
        stats.avg_picking_time = `${Math.floor(avg / 60)}m ${avg % 60}s`;
      }

      return stats;
    } catch (error) {
      console.error('Error fetching fulfillment stats:', error);
      return {
        pending_payment: 0,
        paid: 0,
        confirmed: 0,
        picking: 0,
        packing: 0,
        ready_to_ship: 0,
        shipped: 0,
        delivered: 0,
        failed_shipments: 0,
        avg_picking_time: '0m',
        avg_packing_time: '0m'
      };
    }
  }

  static getStatusColor(status: FulfillmentStatus): string {
    switch (status) {
      case 'pending_payment':
        return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
      case 'paid':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'confirmed':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'picking':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'picked':
        return 'bg-teal-500/10 text-teal-400 border-teal-500/30';
      case 'packing':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
      case 'packed':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'ready_to_ship':
        return 'bg-teal-500/10 text-teal-400 border-teal-500/30';
      case 'shipment_booked':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
      case 'collected':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'shipped':
        return 'bg-violet-500/10 text-violet-400 border-violet-500/30';
      case 'at_local_depot':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
      case 'out_for_delivery':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
      case 'delivered':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'completed':
        return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'cancelled':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      case 'refunded':
        return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
      case 'delivery_attempted':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'ready_for_collection':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'delivery_rescheduled':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'returned':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'failed':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  }

  static getStatusLabel(status: FulfillmentStatus): string {
    const labels: Record<string, string> = {
      pending_payment: 'Pending Payment',
      shipment_booked: 'Shipment Created',
      at_local_depot: 'At Local Depot',
      ready_for_collection: 'Ready for Collection',
      delivery_attempted: 'Delivery Attempted',
      delivery_rescheduled: 'Delivery Rescheduled',
    };

    if (labels[status]) return labels[status];

    return status.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  private static async syncStatusToStore(orderId: string, status: FulfillmentStatus): Promise<void> {
    try {
      const { data: order } = await supabase
        .from('orders')
        .select('order_number, store_id, stores(slug)')
        .eq('id', orderId)
        .single();

      if (!order || !order.stores) return;

      const storeSlug = (order.stores as any).slug;
      if (!storeSlug) return;

      await supabase.from('shipment_sync_queue').insert({
        event_type: 'STATUS_UPDATE',
        store_id: order.store_id,
        order_number: order.order_number,
        payload: { order_status: status, sync_updated_at: new Date().toISOString() },
        status: 'pending'
      });
    } catch (err) {
      console.error(`Failed to queue sync for order ${orderId}:`, err);
    }
  }

  private static async createAuditEntry(orderId: string, status: FulfillmentStatus, notes?: string): Promise<void> {
    try {
      await supabase.from('order_status_history').insert([{
        order_id: orderId,
        old_status: null,
        new_status: status,
        notes: notes || `Status updated to ${status}`,
        created_at: new Date().toISOString()
      }]);
    } catch (err) {
      console.error(`Failed to create audit entry for order ${orderId}:`, err);
    }
  }
}
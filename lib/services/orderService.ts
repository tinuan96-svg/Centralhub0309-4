import { supabase } from '../supabase';
import { syncOrders } from './orderSyncClient';
import { CommunicationService } from './comm/CommunicationService';
import {
  OrderWithItems,
  OrderStatus,
  PaymentStatus,
  OrderStatusHistory,
} from '../types';

import { ReconciliationService } from './banking/reconciliationService';

const PAYMENT_REQUIRED_STATUSES = new Set<OrderStatus>([
  'confirmed',
  'picking',
  'picked',
  'packing',
  'packed',
  'ready_to_ship',
  'shipment_booked',
  'collected',
  'shipped',
  'at_local_depot',
  'out_for_delivery',
  'delivered',
  'completed',
  'delivery_attempted',
  'ready_for_collection',
  'delivery_rescheduled',
]);

export class OrderService {
  /**
   * Generate the permanent store-specific number for an existing imported order.
   * CentralHub may confirm an order that already came from a storefront, but it
   * never creates a new customer order here.
   */
  private static async generatePermanentOrderNumber(storeId: string): Promise<string> {
    const { data: store } = await supabase
      .from('stores')
      .select('name')
      .eq('id', storeId)
      .maybeSingle();

    let prefix = 'ORD';
    if (store) {
      if (store.name.toLowerCase().includes('kerala')) prefix = 'KG';
      else if (store.name.toLowerCase().includes('pocket')) prefix = 'PG';
    }

    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('payment_status', 'paid')
      .like('order_number', `${prefix}%`);

    return `${prefix}${2501 + (count || 0)}`;
  }

  /**
   * Confirm payment and assign permanent order number. Only use after the payment
   * is genuinely verified from the payment provider or bank evidence.
   */
  static async confirmPayment(
    orderId: string,
    paymentReference?: string
  ): Promise<{ success: boolean; orderNumber: string | null; error: string | null }> {
    try {
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (fetchError || !order) {
        return { success: false, orderNumber: null, error: 'Order not found' };
      }

      if (order.payment_status === 'paid' && !order.order_number.startsWith('TEMP-')) {
        return { success: true, orderNumber: order.order_number, error: null };
      }

      if (!order.store_id) {
        return { success: false, orderNumber: null, error: 'Order has no store associated' };
      }

      const permanentOrderNumber = await this.generatePermanentOrderNumber(order.store_id);

      const { data: updatedRows, error: updateError } = await supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          order_status: 'confirmed',
          fulfillment_status: 'confirmed',
          order_number: permanentOrderNumber,
          payment_reference: paymentReference || order.payment_reference,
          inventory_sync_status: 'synced',
          inventory_synced_at: new Date().toISOString(),
          warehouse_status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .or('payment_status.eq.pending,order_status.eq.pending_payment')
        .select('id');

      if (updateError) {
        return { success: false, orderNumber: null, error: 'Failed to confirm payment' };
      }

      if (!updatedRows || updatedRows.length === 0) {
        return { success: true, orderNumber: permanentOrderNumber, error: null };
      }

      await this.createStatusHistory(orderId, null, 'confirmed', 'commit', true, 'Payment confirmed — inventory deducted');

      CommunicationService.triggerEvent({
        eventType: 'PAYMENT_CONFIRMED',
        storeId: order.store_id,
        orderId,
        variables: {
          customer_name: order.customer_name,
          order_number: permanentOrderNumber,
        },
        idempotencyKey: `payment_confirmed:${orderId}`,
      }).catch(err => console.error('Failed to trigger PAYMENT_CONFIRMED comm:', err));

      ReconciliationService.applyGatewayFee(orderId).catch(e => console.error('Fee calculation failed:', e));

      supabase.functions.invoke('update-order-status', {
        body: { orderId, status: 'confirmed', notes: 'Payment confirmed' },
      }).catch(err => console.error('Remote status sync failed:', err));

      return { success: true, orderNumber: permanentOrderNumber, error: null };
    } catch (error) {
      console.error('Error in confirmPayment:', error);
      return { success: false, orderNumber: null, error: 'An unexpected error occurred' };
    }
  }

  static async updatePaymentStatus(
    orderId: string,
    paymentStatus: PaymentStatus,
    paymentReference?: string
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      if (paymentStatus === 'paid') {
        const result = await this.confirmPayment(orderId, paymentReference);
        return { success: result.success, error: result.error };
      }

      const { error } = await supabase
        .from('orders')
        .update({
          payment_status: paymentStatus,
          payment_reference: paymentReference || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      if (error) {
        return { success: false, error: 'Failed to update payment status' };
      }

      return { success: true, error: null };
    } catch (error) {
      console.error('Error in updatePaymentStatus:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }

  /**
   * Update order status with automatic inventory synchronization. This never
   * converts an unpaid order to paid; payment confirmation must go through the
   * dedicated confirmPayment path after real payment evidence exists.
   */
  static async updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    notes?: string
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (fetchError || !order) {
        return { success: false, error: 'Order not found' };
      }

      const oldStatus = order.order_status as OrderStatus;

      if (oldStatus === newStatus) {
        return { success: true, error: null };
      }

      if (order.payment_status !== 'paid' && PAYMENT_REQUIRED_STATUSES.has(newStatus)) {
        return {
          success: false,
          error: `Payment must be received before order ${order.order_number || ''} can move to ${newStatus.replace(/_/g, ' ')}.`,
        };
      }

      const inventoryAction = 'none';

      const { data: items } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId);

      if (inventoryAction !== 'none' && (!items || items.length === 0)) {
        return { success: false, error: 'No items found for order (required for inventory update)' };
      }

      const inventorySuccess = true;

      const updatePayload: any = {
        order_status: newStatus,
        fulfillment_status: newStatus,
        updated_at: new Date().toISOString(),
        inventory_sync_status: 'synced',
        inventory_synced_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId);

      if (updateError) {
        console.error('OrderService.updateOrderStatus error:', updateError);
        return {
          success: false,
          error: `Database update failed: ${updateError.message} (${updateError.code || 'no code'})`,
        };
      }

      const commEventMap: Record<string, any> = {
        picking: 'ORDER_PROCESSING',
        packing: 'ORDER_PROCESSING',
        shipped: 'ORDER_DISPATCHED',
        delivered: 'ORDER_DELIVERED',
        cancelled: 'ORDER_CANCELLED',
        refunded: 'ORDER_REFUNDED',
      };

      const eventType = commEventMap[newStatus];
      if (eventType) {
        CommunicationService.triggerEvent({
          eventType,
          storeId: order.store_id,
          orderId,
          variables: {
            customer_name: order.customer_name,
            order_number: order.order_number,
            tracking_number: order.tracking_number || '',
            tracking_url: order.carrier === 'DHL' ? `https://www.dhl.com/en/express/tracking.html?AWB=${order.tracking_number}` : '',
          },
          idempotencyKey: `${eventType.toLowerCase()}:${orderId}`,
        }).catch(err => console.error(`Failed to trigger ${eventType} comm:`, err));
      }

      await this.createStatusHistory(
        orderId,
        oldStatus,
        newStatus,
        inventoryAction,
        inventorySuccess,
        notes || `Status changed from ${oldStatus} to ${newStatus}`
      );

      supabase.functions.invoke('update-order-status', {
        body: { orderId, status: newStatus, notes },
      }).catch(err => console.error('Remote status sync failed:', err));

      return { success: true, error: null };
    } catch (error) {
      console.error('Error in updateOrderStatus:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }

  private static getInventoryAction(
    oldStatus: OrderStatus,
    newStatus: OrderStatus
  ): 'reserve' | 'commit' | 'release' | 'return' | 'none' {
    if (newStatus === 'cancelled') return 'none';
    if (newStatus === 'refunded') return 'return';
    return 'none';
  }

  private static async createStatusHistory(
    orderId: string,
    oldStatus: OrderStatus | null,
    newStatus: OrderStatus,
    inventoryAction: 'reserve' | 'commit' | 'release' | 'return' | 'none',
    inventoryActionCompleted: boolean,
    notes: string
  ): Promise<void> {
    await supabase.from('order_status_history').insert([
      {
        order_id: orderId,
        old_status: oldStatus,
        new_status: newStatus,
        inventory_action: inventoryAction,
        inventory_action_completed: inventoryActionCompleted,
        notes,
      },
    ]);
  }

  private static async enrichItemsWithProducts(items: any[]): Promise<any[]> {
    const productIds = items
      .map(i => i.product_id)
      .filter((id): id is string => Boolean(id) && typeof id === 'string');

    if (productIds.length === 0) return items;

    let { data: products, error }: { data: any[] | null; error: any } = await supabase
      .from('products')
      .select('id, brand, weight, unit, image_url')
      .in('id', productIds);

    if (error) {
      console.warn('Could not fetch image_url from products, falling back:', error.message);
      const { data: retryData } = await supabase
        .from('products')
        .select('id, brand, weight, unit')
        .in('id', productIds);
      products = retryData;
    }

    const productMap = new Map<string, { brand: string | null; weight: number | null; unit: string | null; image_url: string | null }>();
    products?.forEach(p => {
      productMap.set(p.id, {
        brand: p.brand || null,
        weight: p.weight ?? null,
        unit: p.unit || null,
        image_url: (p as any).image_url || null,
      });
    });

    return items.map(item => {
      const prod = item.product_id ? productMap.get(item.product_id) : null;
      return {
        ...item,
        brand: item.brand || prod?.brand || null,
        weight: item.weight ?? prod?.weight ?? null,
        unit: item.unit || prod?.unit || null,
        product_image: item.product_image || prod?.image_url || null,
      };
    });
  }

  static async getAllOrders(options: {
    storeId?: string | null;
    page?: number;
    pageSize?: number;
    status?: OrderStatus | 'all' | 'operational';
    paymentStatus?: PaymentStatus | 'all';
    search?: string;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<{ orders: OrderWithItems[]; totalCount: number }> {
    const {
      storeId = null,
      page = 1,
      pageSize = 50,
      status = 'all',
      paymentStatus = 'all',
      search = '',
      startDate,
      endDate,
    } = options;

    try {
      const orderColumns = 'id,user_id,store_id,order_number,customer_name,customer_email,customer_phone,delivery_address,delivery_city,delivery_postcode,subtotal,delivery_fee,total,payment_method,payment_status,order_status,warehouse_status,fulfillment_status,packed_at,ready_to_ship_at,fulfillment_notes,payment_reference,notes,inventory_synced_at,inventory_sync_status,product_cost_total,product_cost_net,packing_cost_net,shipping_cost_net,gateway_fee_net,total_cost_net,platform_fee,total_revenue,gross_profit,profit_margin,cost_per_kg,picking_started_at,picking_completed_at,picked_by_user,picking_duration,locked_by,locked_at,created_at,updated_at,company_name,tracking_number,last_tracking_status,carrier,parcel_count,items';

      let query = supabase
        .from('orders')
        .select(orderColumns, { count: 'exact' });

      if (storeId) {
        query = query.eq('store_id', storeId);
      }

      if (status === 'operational') {
        query = query.eq('payment_status', 'paid')
                     .not('order_status', 'in', '("shipped","delivered","completed","cancelled","refunded")');
      } else if (status !== 'all') {
        query = query.eq('order_status', status);
      }

      if (paymentStatus !== 'all') {
        query = query.eq('payment_status', paymentStatus);
      }

      if (search) {
        query = query.or(`order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%`);
      }

      if (startDate) query = query.gte('created_at', startDate);
      if (endDate) query = query.lte('created_at', endDate);

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data: orders, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error || !orders) {
        console.error('Error fetching orders:', error);
        return { orders: [], totalCount: 0 };
      }

      if (orders.length === 0) return { orders: [], totalCount: count || 0 };

      const orderIds = orders.map(o => o.id);
      const itemsByOrder = new Map<string, any[]>();

      const { data: batchItems, error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .in('order_id', orderIds);

      if (!itemsError && batchItems) {
        batchItems.forEach(item => {
          const list = itemsByOrder.get(item.order_id) || [];
          list.push({
            ...item,
            product_name: item.product_name || 'Unknown Product',
            product_image: item.product_image || null,
            cost_price: item.cost_price || null,
          });
          itemsByOrder.set(item.order_id, list);
        });
      }

      const normalizedOrders = orders.map(order => {
        const fetchedItems = itemsByOrder.get(order.id);
        let items = (fetchedItems && fetchedItems.length > 0)
          ? fetchedItems
          : (Array.isArray((order as any).items) ? (order as any).items : []);

        items = items.map((item: any) => ({
          ...item,
          id: item.id || `item-${order.id}-${item.product_id || item.name || Math.random()}`,
          order_id: order.id,
          product_name: item.product_name || item.name || item.title || 'Unknown Product',
          unit_price: Number(item.unit_price || item.price || 0),
          total_price: Number(item.total_price || item.subtotal || (Number(item.unit_price || item.price || 0) * Number(item.quantity || 1))),
          quantity: Number(item.quantity || 1),
          cost_price: item.cost_price ?? null,
          product_image: item.product_image || item.image || null,
          brand: item.brand || null,
          weight: item.weight ?? null,
          unit: item.unit || null,
        }));

        return {
          ...order,
          items,
          item_count: items.length,
        };
      }) as any[];

      const allItems = normalizedOrders.flatMap(o => o.items || []);
      if (allItems.length > 0) {
        const enrichedItems = await OrderService.enrichItemsWithProducts(allItems);
        const enrichedByOrder = new Map<string, any[]>();
        enrichedItems.forEach(item => {
          const list = enrichedByOrder.get(item.order_id) || [];
          list.push(item);
          enrichedByOrder.set(item.order_id, list);
        });
        normalizedOrders.forEach(order => {
          order.items = enrichedByOrder.get(order.id) || order.items;
        });
      }

      return { orders: normalizedOrders, totalCount: count || 0 };
    } catch (err) {
      console.error('Unexpected error in getAllOrders:', err);
      return { orders: [], totalCount: 0 };
    }
  }

  static async getOrderById(orderId: string): Promise<OrderWithItems | null> {
    try {
      const { data: order, error } = await supabase.from('orders').select('*').eq('id', orderId).single();
      if (error || !order) return null;

      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select(`
          id,
          order_id,
          product_id,
          product_name,
          product_image,
          quantity,
          unit_price,
          total_price,
          cost_price,
          products:product_id (
            name,
            cost_price
          )
        `)
        .eq('order_id', orderId);

      let mappedItems: any[] = [];

      if (itemsError || !items || items.length === 0) {
        const jsonbItems = Array.isArray((order as any).items) ? (order as any).items : [];
        mappedItems = jsonbItems.map((item: any) => ({
          id: item.id || `item-${orderId}-${item.product_id || item.name || Math.random()}`,
          order_id: orderId,
          product_id: item.product_id || null,
          product_name: item.product_name || item.name || item.title || 'Unknown Product',
          product_image: item.product_image || item.image || null,
          quantity: Number(item.quantity || 1),
          unit_price: Number(item.unit_price || item.price || 0),
          total_price: Number(item.total_price || item.subtotal || (Number(item.unit_price || item.price || 0) * Number(item.quantity || 1))),
          cost_price: item.cost_price ?? null,
          brand: item.brand || null,
          weight: item.weight ?? null,
          unit: item.unit || null,
        }));
      } else {
        mappedItems = items.map((item: any) => {
          const prod = Array.isArray(item.products) ? item.products[0] : item.products;
          return {
            ...item,
            product_name: item.product_name || prod?.name || 'Unknown Product',
            product_image: item.product_image || null,
            cost_price: item.cost_price || prod?.cost_price || null,
          };
        });
      }

      return { ...order, items: await OrderService.enrichItemsWithProducts(mappedItems) } as OrderWithItems;
    } catch (err) {
      console.error('Unexpected error in getOrderById:', err);
      return null;
    }
  }

  static async getOrderStatusHistory(orderId: string): Promise<OrderStatusHistory[]> {
    const { data } = await supabase.from('order_status_history').select('*').eq('order_id', orderId).order('created_at', { ascending: false });
    return data || [];
  }

  static async cancelOrder(orderId: string, reason?: string): Promise<{ success: boolean; error: string | null }> {
    return this.updateOrderStatus(orderId, 'cancelled', reason || 'Order cancelled');
  }

  static async refundOrder(orderId: string, reason?: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single();
      if (!order) return { success: false, error: 'Order not found' };

      const { error } = await supabase.from('orders').update({
        order_status: 'refunded',
        payment_status: 'refunded',
        updated_at: new Date().toISOString(),
      }).eq('id', orderId);

      if (error) throw error;

      await this.createStatusHistory(orderId, order.order_status, 'refunded', 'return', true, reason || 'Order refunded');

      CommunicationService.triggerEvent({
        eventType: 'ORDER_REFUNDED',
        storeId: order.store_id,
        orderId,
        variables: {
          customer_name: order.customer_name,
          order_number: order.order_number,
        },
        idempotencyKey: `order_refunded:${orderId}`,
      }).catch(err => console.error('Failed to trigger ORDER_REFUNDED comm:', err));

      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  static async syncOrderFromSource(orderId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { data: order } = await supabase
        .from('orders')
        .select('id, store_id, stores(slug)')
        .eq('id', orderId)
        .single();

      if (!order || !(order as any).stores?.slug) return { success: false, error: 'Order source not found' };

      const slug = (order as any).stores.slug.toLowerCase();
      const data = await syncOrders({ orderId, storeSlug: slug });

      if (!data.success) {
        return { success: false, error: data.error || data.message || 'Failed to sync from source' };
      }

      return { success: true, error: null };
    } catch (err: any) {
      console.error('syncOrderFromSource error:', err);
      return { success: false, error: err.message };
    }
  }

  static async deleteOrder(orderId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { data: order } = await supabase
        .from('orders')
        .select('id, store_id, stores(slug)')
        .eq('id', orderId)
        .single();

      const storeSlug = (order as any)?.stores?.slug;

      const { error } = await supabase.from('orders').delete().eq('id', orderId);
      if (error) throw error;

      if (storeSlug) {
        fetch('/api/orders/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, storeSlug }),
        }).catch(err => console.error('Remote order delete failed:', err));
      }
      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

import { createClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { syncOrders } from './orderSyncClient';
import { InventoryService } from './inventoryService';
import { CommunicationService } from './comm/CommunicationService';
import {
  Order,
  OrderWithItems,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  OrderStatusHistory,
  CreateOrderData,
  InventoryValidationResult,
} from '../types';

import { ReconciliationService } from './banking/reconciliationService';

export class OrderService {
  /**
   * Validate inventory availability for order items
   */
  static async validateInventoryForOrder(
    items: { product_id: string; product_name: string; quantity: number }[]
  ): Promise<InventoryValidationResult> {
    const errors: InventoryValidationResult['errors'] = [];
    const backorderItems: InventoryValidationResult['backorder_items'] = [];

    // Fetch backorder flags for all products in one query
    const productIds = items.map(i => i.product_id).filter(Boolean);
    const { data: products } = await supabase
      .from('products')
      .select('id, allow_backorder')
      .in('id', productIds);

    const backorderMap: Record<string, boolean> = {};
    products?.forEach((p: any) => { backorderMap[p.id] = p.allow_backorder === true; });

    for (const item of items) {
      const inventory = await InventoryService.getInventoryForProduct(item.product_id);

      const stock_quantity = inventory?.stock_quantity ?? 0;
      const reserved_quantity = inventory?.reserved_quantity ?? 0;
      const available = stock_quantity - reserved_quantity;

      if (available < item.quantity) {
        if (backorderMap[item.product_id]) {
          // Product allows backorders — don't block, just record it
          backorderItems.push({
            product_id: item.product_id,
            product_name: item.product_name,
            requested: item.quantity,
            available,
          });
        } else {
          errors.push({
            product_id: item.product_id,
            product_name: item.product_name,
            requested: item.quantity,
            available,
            message: `Insufficient stock (available: ${available}, requested: ${item.quantity})`,
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      backorder_items: backorderItems,
    };
  }

  /**
   * Generate temporary order number for pending payments
   */
  private static generateTemporaryOrderNumber(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `TEMP-${timestamp}-${random}`;
  }

  /**
   * Generate permanent store-specific order number
   * KeralaGroceries: KG2501, KG2502, etc.
   * PocketGrocery: PG2501, PG2502, etc.
   */
  private static async generatePermanentOrderNumber(storeId: string): Promise<string> {
    // Get store details
    const { data: store } = await supabase
      .from('stores')
      .select('name')
      .eq('id', storeId)
      .maybeSingle();

    // Determine prefix based on store name
    let prefix = 'ORD';
    if (store) {
      if (store.name.toLowerCase().includes('kerala')) {
        prefix = 'KG';
      } else if (store.name.toLowerCase().includes('pocket')) {
        prefix = 'PG';
      }
    }

    // Get count of confirmed orders for this store starting with the prefix
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('payment_status', 'paid')
      .like('order_number', `${prefix}%`);

    // Start from 2501
    const orderNum = 2501 + (count || 0);
    return `${prefix}${orderNum}`;
  }

  /**
   * Create a new order with automatic inventory reservation
   */
  static async createOrder(orderData: CreateOrderData): Promise<{ order: Order | null; error: string | null }> {
    try {
      // Validate inventory first
      const validation = await this.validateInventoryForOrder(orderData.items);
      if (!validation.valid) {
        const errorMsg = validation.errors.map((e) => e.message).join('; ');
        return { order: null, error: errorMsg };
      }

      // Calculate totals
      const subtotal = orderData.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
      const deliveryFee = subtotal >= 50 ? 0 : 5; // Free delivery over £50
      const total = subtotal + deliveryFee;

      // Fetch cost prices to calculate product_cost_total
      const productIds = orderData.items.map(i => i.product_id);
      const { data: products } = await supabase
        .from('products')
        .select('id, cost_price')
        .in('id', productIds);

      const costMap: Record<string, number> = {};
      products?.forEach(p => { costMap[p.id] = p.cost_price || 0; });

      const productCostTotal = orderData.items.reduce((sum, item) =>
        sum + (costMap[item.product_id] || 0) * item.quantity, 0
      );

      // For COD (cash on delivery), generate permanent order number immediately
      // For other payment methods, use temporary number until payment is confirmed
      const isCOD = orderData.payment_method === 'cod';
      const orderNumber = isCOD
        ? await this.generatePermanentOrderNumber(orderData.store_id)
        : this.generateTemporaryOrderNumber();

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert([
          {
            store_id: orderData.store_id,
            order_number: orderNumber,
            customer_name: orderData.customer_name,
            customer_email: orderData.customer_email,
            customer_phone: orderData.customer_phone,
            delivery_address: orderData.delivery_address,
            delivery_city: orderData.delivery_city,
            delivery_postcode: orderData.delivery_postcode,
            subtotal,
            delivery_fee: deliveryFee,
            total,
            product_cost_total: productCostTotal,
            payment_method: orderData.payment_method,
            payment_status: isCOD ? 'paid' : 'pending',
            order_status: 'pending_payment',
            fulfillment_status: 'pending_payment',
            warehouse_status: 'pending',
            notes: orderData.notes || null,
            inventory_sync_status: 'pending',
          },
        ])
        .select()
        .single();

      if (orderError || !order) {
        console.error('Error creating order:', orderError);
        return { order: null, error: 'Failed to create order' };
      }

      // Create order items
      const orderItems = orderData.items.map((item) => ({
        order_id: order.id,
        product_id: item.product_id,
        product_name: item.product_name,
        product_image: item.product_image || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.unit_price * item.quantity,
        cost_price: costMap[item.product_id] || 0,
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);

      if (itemsError) {
        console.error('Error creating order items:', itemsError);
        // Rollback: delete the order
        await supabase.from('orders').delete().eq('id', order.id);
        return { order: null, error: 'Failed to create order items' };
      }

      // Do NOT reserve or deduct inventory before payment is confirmed.
      // Inventory is only deducted when payment_status changes to 'paid' (see confirmPayment).
      await this.createStatusHistory(order.id, null, 'pending_payment', 'none', true, 'Order created — awaiting payment');

      // Trigger Order Received Communication
      CommunicationService.triggerEvent({
        eventType: 'ORDER_RECEIVED',
        storeId: order.store_id,
        orderId: order.id,
        variables: {
          customer_name: order.customer_name,
          order_number: order.order_number,
          order_total: `£${order.total.toFixed(2)}`
        },
        idempotencyKey: `order_received:${order.id}`
      }).catch(err => console.error('Failed to trigger ORDER_RECEIVED comm:', err));

      return { order, error: null };
    } catch (error) {
      console.error('Error in createOrder:', error);
      return { order: null, error: 'An unexpected error occurred' };
    }
  }

  /**
   * Confirm payment and assign permanent order number
   */
  static async confirmPayment(
    orderId: string,
    paymentReference?: string
  ): Promise<{ success: boolean; orderNumber: string | null; error: string | null }> {
    try {
      // Get current order
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (fetchError || !order) {
        return { success: false, orderNumber: null, error: 'Order not found' };
      }

      // Check if already confirmed
      if (order.payment_status === 'paid' && !order.order_number.startsWith('TEMP-')) {
        return { success: true, orderNumber: order.order_number, error: null };
      }

      // Generate permanent order number
      if (!order.store_id) {
        return { success: false, orderNumber: null, error: 'Order has no store associated' };
      }

      const permanentOrderNumber = await this.generatePermanentOrderNumber(order.store_id);

      // Stock deduction is handled automatically by the database trigger
      // (handle_order_inventory_movement) when payment_status changes to 'paid'.
      // Do NOT deduct stock here manually -- it would cause double deduction.

      // Single atomic update: set payment_status, order_status, order_number, and inventory sync together
      // Also set warehouse_status='pending' so the order appears in the picking queue automatically
      // We allow the update if payment_status is 'pending' OR if order_status is 'pending_payment'
      // This ensures we can fix orders that are stuck in 'pending_payment' even if already 'paid'
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

      // If no rows were updated, another request already confirmed this order
      if (!updatedRows || updatedRows.length === 0) {
        return { success: true, orderNumber: permanentOrderNumber, error: null };
      }

      await this.createStatusHistory(orderId, null, 'confirmed', 'commit', true, 'Payment confirmed — inventory deducted');

      // Trigger Payment Confirmed Communication
      CommunicationService.triggerEvent({
        eventType: 'PAYMENT_CONFIRMED',
        storeId: order.store_id,
        orderId: orderId,
        variables: {
          customer_name: order.customer_name,
          order_number: permanentOrderNumber
        },
        idempotencyKey: `payment_confirmed:${orderId}`
      }).catch(err => console.error('Failed to trigger PAYMENT_CONFIRMED comm:', err));

      // 4. Apply gateway fees for accurate profit tracking
      ReconciliationService.applyGatewayFee(orderId).catch(e => console.error('Fee calculation failed:', e));

      // Push status update to remote store via edge function
      supabase.functions.invoke('update-order-status', {
        body: { orderId, status: 'confirmed', notes: 'Payment confirmed' },
      }).catch(err => console.error('Remote status sync failed:', err));

      return { success: true, orderNumber: permanentOrderNumber, error: null };
    } catch (error) {
      console.error('Error in confirmPayment:', error);
      return { success: false, orderNumber: null, error: 'An unexpected error occurred' };
    }
  }

  /**
   * Update payment status
   */
  static async updatePaymentStatus(
    orderId: string,
    paymentStatus: PaymentStatus,
    paymentReference?: string
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      // If confirming payment, use the confirmPayment method
      if (paymentStatus === 'paid') {
        const result = await this.confirmPayment(orderId, paymentReference);
        return { success: result.success, error: result.error };
      }

      // For other payment statuses, just update
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
   * Update order status with automatic inventory synchronization
   */
  static async updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    notes?: string
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      // Get current order
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (fetchError || !order) {
        return { success: false, error: 'Order not found' };
      }

      const oldStatus = order.order_status as OrderStatus;

      // Prevent duplicate status updates
      if (oldStatus === newStatus) {
        return { success: true, error: null };
      }

      // Determine inventory action
      // We rely on database triggers for inventory deduction (on payment)
      // and restoration (on cancel/refund). This prevents double-deduction.
      const inventoryAction = 'none';

      // Get order items (required for inventory actions)
      const { data: items } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId);

      // Only fail if an inventory action is required but items are missing
      if (inventoryAction !== 'none' && (!items || items.length === 0)) {
        return { success: false, error: 'No items found for order (required for inventory update)' };
      }

      // Execute inventory action
      // Inventory success is assumed as DB triggers handle the heavy lifting
      let inventorySuccess = true;

      // Update order status
      const updatePayload: any = {
        order_status: newStatus,
        updated_at: new Date().toISOString(),
        inventory_sync_status: 'synced',
        inventory_synced_at: new Date().toISOString(),
      };

      // Ensure fulfillment_status is also updated to keep them in sync
      // This prevents constraint failures if one was out of sync
      updatePayload.fulfillment_status = newStatus;

      // If the order is moved to "confirmed" via the status dropdown, also set payment_status
      // Only do this if payment is still pending -- the trigger handles stock deduction
      if (newStatus === 'confirmed' && order.payment_status !== 'paid') {
        updatePayload.payment_status = 'paid';
      }

      const { error: updateError } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId);

      if (updateError) {
        console.error('OrderService.updateOrderStatus error:', updateError);
        return {
          success: false,
          error: `Database update failed: ${updateError.message} (${updateError.code || 'no code'})`
        };
      }

      // Trigger Communication based on status
      const commEventMap: Record<string, any> = {
        'picking': 'ORDER_PROCESSING',
        'packing': 'ORDER_PROCESSING',
        'shipped': 'ORDER_DISPATCHED',
        'delivered': 'ORDER_DELIVERED',
        'cancelled': 'ORDER_CANCELLED',
        'refunded': 'ORDER_REFUNDED'
      };

      const eventType = commEventMap[newStatus];
      if (eventType) {
        CommunicationService.triggerEvent({
          eventType,
          storeId: order.store_id,
          orderId: orderId,
          variables: {
            customer_name: order.customer_name,
            order_number: order.order_number,
            tracking_number: order.tracking_number || '',
            tracking_url: order.carrier === 'DHL' ? `https://www.dhl.com/en/express/tracking.html?AWB=${order.tracking_number}` : ''
          },
          idempotencyKey: `${eventType.toLowerCase()}:${orderId}`
        }).catch(err => console.error(`Failed to trigger ${eventType} comm:`, err));
      }

      // Create status history
      await this.createStatusHistory(
        orderId,
        oldStatus,
        newStatus,
        inventoryAction,
        inventorySuccess,
        notes || `Status changed from ${oldStatus} to ${newStatus}`
      );

      // Push status update to remote store via edge function
      supabase.functions.invoke('update-order-status', {
        body: { orderId, status: newStatus, notes },
      }).catch(err => console.error('Remote status sync failed:', err));

      return { success: true, error: null };
    } catch (error) {
      console.error('Error in updateOrderStatus:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }

  /**
   * Determine what inventory action to take based on status change
   */
  private static getInventoryAction(
    oldStatus: OrderStatus,
    newStatus: OrderStatus
  ): 'reserve' | 'commit' | 'release' | 'return' | 'none' {
    if (newStatus === 'cancelled') return 'none'; // No reserved stock to release
    if (newStatus === 'refunded') return 'return';
    return 'none';
  }

  /**
   * Create status history entry
   */
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

  /**
   * Enrich order items with product details (brand, weight, unit) from the products table
   */
  private static async enrichItemsWithProducts(items: any[]): Promise<any[]> {
    const productIds = items
      .map(i => i.product_id)
      .filter((id): id is string => Boolean(id) && typeof id === 'string');

    if (productIds.length === 0) return items;

    // Try to fetch with image_url first
    let { data: products, error }: { data: any[] | null; error: any } = await supabase
      .from('products')
      .select('id, brand, weight, unit, image_url')
      .in('id', productIds);

    // If it fails (e.g. image_url column missing), fallback to basic fields
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
        image_url: (p as any).image_url || null
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

  /**
   * Get all orders with items, optionally filtered and paginated
   */
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
      endDate
    } = options;

    try {
      const orderColumns = 'id,user_id,store_id,order_number,customer_name,customer_email,customer_phone,delivery_address,delivery_city,delivery_postcode,subtotal,delivery_fee,total,payment_method,payment_status,order_status,warehouse_status,fulfillment_status,packed_at,ready_to_ship_at,fulfillment_notes,payment_reference,notes,inventory_synced_at,inventory_sync_status,product_cost_total,product_cost_net,packing_cost_net,shipping_cost_net,gateway_fee_net,total_cost_net,platform_fee,total_revenue,gross_profit,profit_margin,cost_per_kg,picking_started_at,picking_completed_at,picked_by_user,picking_duration,locked_by,locked_at,created_at,updated_at,company_name,tracking_number,last_tracking_status,carrier,parcel_count,items';

      let query = supabase
        .from('orders')
        .select(orderColumns, { count: 'exact' });

      // Apply filters
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

      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        query = query.lte('created_at', endDate);
      }

      // Pagination
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

      // 2. Fetch items for this page's orders
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
            cost_price: item.cost_price || null
          });
          itemsByOrder.set(item.order_id, list);
        });
      }

      // 3. Combine data
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
          unit: item.unit || null
        }));

        return {
          ...order,
          items: items,
          item_count: items.length
        };
      }) as any[];

      // 4. Enrichment
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

  /**
   * Get single order with items
   */
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
        // Fall back to the JSONB items column on the order itself
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
          unit: item.unit || null
        }));
      } else {
        mappedItems = items.map((item: any) => {
          const prod = Array.isArray(item.products) ? item.products[0] : item.products;
          return {
            ...item,
            product_name: item.product_name || prod?.name || 'Unknown Product',
            product_image: item.product_image || null,
            cost_price: item.cost_price || prod?.cost_price || null
          };
        });
      }

      return { ...order, items: await OrderService.enrichItemsWithProducts(mappedItems) } as OrderWithItems;
    } catch (err) {
      console.error('Unexpected error in getOrderById:', err);
      return null;
    }
  }

  /**
   * Get order status history
   */
  static async getOrderStatusHistory(orderId: string): Promise<OrderStatusHistory[]> {
    const { data, error } = await supabase.from('order_status_history').select('*').eq('order_id', orderId).order('created_at', { ascending: false });
    return data || [];
  }

  /**
   * Cancel order and release inventory
   */
  static async cancelOrder(orderId: string, reason?: string): Promise<{ success: boolean; error: string | null }> {
    return this.updateOrderStatus(orderId, 'cancelled', reason || 'Order cancelled');
  }

  /**
   * Process refund and return stock
   */
  static async refundOrder(orderId: string, reason?: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single();
      if (!order) return { success: false, error: 'Order not found' };

      // We only update status here. The database trigger 'trg_order_inventory_movement'
      // will automatically restore stock to products and central_inventory
      // when order_status changes to 'refunded'.
      const { error } = await supabase.from('orders').update({
        order_status: 'refunded',
        payment_status: 'refunded',
        updated_at: new Date().toISOString()
      }).eq('id', orderId);

      if (error) throw error;

      await this.createStatusHistory(orderId, order.order_status, 'refunded', 'return', true, reason || 'Order refunded');

      // Trigger Refunded Communication
      CommunicationService.triggerEvent({
        eventType: 'ORDER_REFUNDED',
        storeId: order.store_id,
        orderId: orderId,
        variables: {
          customer_name: order.customer_name,
          order_number: order.order_number
        },
        idempotencyKey: `order_refunded:${orderId}`
      }).catch(err => console.error('Failed to trigger ORDER_REFUNDED comm:', err));

      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync a single order's items from its source website
   */
  static async syncOrderFromSource(orderId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      // 1. Get order and store info
      const { data: order } = await supabase
        .from('orders')
        .select('id, store_id, stores(slug)')
        .eq('id', orderId)
        .single();

      if (!order || !(order as any).stores?.slug) return { success: false, error: 'Order source not found' };

      const slug = (order as any).stores.slug.toLowerCase();

      // Use the edge function for syncing to avoid client-side environment variable issues
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

  /**
   * Delete order and its related data
   */
  static async deleteOrder(orderId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      // 1. Get order and store info for remote sync
      const { data: order } = await supabase
        .from('orders')
        .select('id, store_id, stores(slug)')
        .eq('id', orderId)
        .single();

      const storeSlug = (order as any)?.stores?.slug;

      // 2. Delete locally
      const { error } = await supabase.from('orders').delete().eq('id', orderId);
      if (error) throw error;

      // 3. Trigger background delete for remote if needed
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

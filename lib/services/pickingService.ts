import { supabase } from '../supabase';
import { OrderWithItems, WarehouseStatus, OrderItem } from '../types';
import { pushOrderStatusToStore } from '../utils/orderStatusSync';

export class PickingService {
  /**
   * Get all orders in the picking queue (Paid + not yet processed)
   */
  static async getPickingQueue(): Promise<OrderWithItems[]> {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .in('order_status', ['paid', 'confirmed', 'picking'])
      .order('created_at', { ascending: true });

    if (error || !orders) return [];

    const productIds = new Set<string>();
    orders.forEach(o => {
      const items = Array.isArray(o.items) ? o.items : [];
      items.forEach((item: any) => {
        if (item.product_id) productIds.add(item.product_id);
      });
    });

    let productLocationMap = new Map<string, string>();
    if (productIds.size > 0) {
      const { data: products } = await supabase
        .from('products')
        .select('id, warehouse_location')
        .in('id', Array.from(productIds));
      products?.forEach(p => {
        if (p.warehouse_location) productLocationMap.set(p.id, p.warehouse_location);
      });
    }

    return orders
      .map(order => {
        const rawItems = Array.isArray(order.items) ? order.items : [];
        const items = rawItems.map((item: any, idx: number) => ({
          id: `${order.id}-${idx}`,
          order_id: order.id,
          product_id: item.product_id || null,
          product_name: item.name || 'Unknown Product',
          product_image: item.image || null,
          quantity: item.quantity || 0,
          unit_price: item.price || 0,
          total_price: item.subtotal || 0,
          brand: item.brand || null,
          weight: item.weight || null,
          unit: item.unit || null,
          picked_quantity: item.picked_quantity || 0,
          skip_reason: item.skip_reason || null,
          warehouse_location: productLocationMap.get(item.product_id) || null,
        }));
        return { ...order, items };
      })
      .filter(order => order.items.length > 0) as OrderWithItems[];
  }

  /**
   * Get a single order for picking with live inventory
   */
  static async getOrderForPicking(orderId: string): Promise<OrderWithItems | null> {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error || !order) return null;

    let rawItems = Array.isArray(order.items) ? order.items : [];

    // Fallback: if items JSONB is empty, fetch from order_items table
    if (rawItems.length === 0) {
      const { data: orderItemsData, error: oiError } = await supabase
        .from('order_items')
        .select('product_id, name, image, quantity, price, subtotal, brand, weight, unit')
        .eq('order_id', orderId);
      if (!oiError && orderItemsData) {
        rawItems = orderItemsData.map((item: any) => ({
          product_id: item.product_id,
          name: item.name,
          image: item.image,
          quantity: item.quantity,
          price: item.price,
          subtotal: item.subtotal,
          brand: item.brand,
          weight: item.weight,
          unit: item.unit,
        }));
      }
    }

    const productIds = rawItems.map((item: any) => item.product_id).filter(Boolean);

    let productMap = new Map<string, any>();
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from('products')
        .select('id, name, brand, weight_grams, warehouse_location, gtin, image_url, expiry_date')
        .in('id', productIds);
      products?.forEach(p => productMap.set(p.id, p));
    }

    const items = rawItems.map((item: any, idx: number) => {
      const product = item.product_id ? productMap.get(item.product_id) : null;
      return {
        id: `${order.id}-${idx}`,
        order_id: order.id,
        product_id: item.product_id || null,
        product_name: item.name || product?.name || 'Unknown Product',
        product_image: item.image || product?.image_url || null,
        quantity: item.quantity || 0,
        unit_price: item.price || 0,
        total_price: item.subtotal || 0,
        brand: item.brand || product?.brand || null,
        weight: item.weight || (product?.weight_grams ? String(product.weight_grams) : null),
        unit: item.unit || null,
        picked_quantity: item.picked_quantity || 0,
        skip_reason: item.skip_reason || null,
        warehouse_location: product?.warehouse_location || null,
        gtin: product?.gtin || null,
        expiry_date: product?.expiry_date || null,
      };
    });

    // Sort items by expiry date (FEFO - First Expired, First Out)
    // Items with no expiry date go to the end
    items.sort((a: any, b: any) => {
      if (!a.expiry_date && !b.expiry_date) return 0;
      if (!a.expiry_date) return 1;
      if (!b.expiry_date) return -1;
      return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
    });

    return { ...order, items } as OrderWithItems;
  }

  /**
   * Start picking an order
   */
  static async startPicking(orderId: string, userId: string): Promise<{ success: boolean; error: string | null }> {
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('warehouse_status, locked_by')
      .eq('id', orderId)
      .single();

    if (fetchError) return { success: false, error: 'Order not found' };
    if (order.warehouse_status === 'picking' && order.locked_by && order.locked_by !== userId) {
      return { success: false, error: 'Order is being picked by another user' };
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        order_status: 'picking',
        warehouse_status: 'picking',
        picking_started_at: new Date().toISOString(),
        picked_by_user: userId,
        locked_by: userId,
        locked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (updateError) return { success: false, error: updateError.message };

    pushOrderStatusToStore(orderId, 'picking', 'Picking started');

    return { success: true, error: null };
  }

  /**
   * Update picked quantity for an item
   */
  static async updatePickedQuantity(
    orderId: string,
    productId: string | null,
    quantity: number,
    gtin: string,
    userId: string
  ): Promise<{ success: boolean; error: string | null }> {
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('items')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) return { success: false, error: fetchError?.message || 'Order not found' };

    const items = Array.isArray(order.items) ? [...order.items] : [];
    const itemIndex = productId
      ? items.findIndex((it: any) => it.product_id === productId)
      : -1;

    // If item not found in JSONB items, try updating the order_items table directly
    if (itemIndex === -1 && productId) {
      const { error: oiError } = await supabase
        .from('order_items')
        .update({
          picked_quantity: quantity,
          last_scanned_gtin: gtin,
          picked_at: new Date().toISOString(),
          picked_by: userId as any,
        })
        .eq('order_id', orderId)
        .eq('product_id', productId);

      if (oiError) return { success: false, error: oiError.message };
      return { success: true, error: null };
    }

    if (itemIndex === -1) return { success: false, error: 'Item not found in order' };

    items[itemIndex] = {
      ...items[itemIndex],
      picked_quantity: quantity,
      last_scanned_gtin: gtin,
      picked_at: new Date().toISOString(),
      picked_by: userId,
    };

    const { error } = await supabase
      .from('orders')
      .update({ items, updated_at: new Date().toISOString() })
      .eq('id', orderId);

    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  }

  /**
   * Skip a product
   */
  static async skipProduct(
    orderId: string,
    productId: string | null,
    reason: string
  ): Promise<{ success: boolean; error: string | null }> {
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('items')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) return { success: false, error: fetchError?.message || 'Order not found' };

    const items = Array.isArray(order.items) ? [...order.items] : [];
    const itemIndex = productId
      ? items.findIndex((it: any) => it.product_id === productId)
      : -1;

    // If item not found in JSONB items, try updating the order_items table directly
    if (itemIndex === -1 && productId) {
      const { error: oiError } = await supabase
        .from('order_items')
        .update({ skip_reason: reason })
        .eq('order_id', orderId)
        .eq('product_id', productId);

      if (oiError) return { success: false, error: oiError.message };
      return { success: true, error: null };
    }

    if (itemIndex === -1) return { success: false, error: 'Item not found in order' };

    items[itemIndex] = {
      ...items[itemIndex],
      skip_reason: reason,
    };

    const { error } = await supabase
      .from('orders')
      .update({ items, updated_at: new Date().toISOString() })
      .eq('id', orderId);

    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  }

  /**
   * Cancel picking and return to pending
   */
  static async cancelPicking(orderId: string): Promise<{ success: boolean; error: string | null }> {
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('items')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) return { success: false, error: fetchError?.message || 'Order not found' };

    const items = Array.isArray(order.items)
      ? order.items.map((item: any) => ({
          ...item,
          picked_quantity: 0,
          last_scanned_gtin: null,
          picked_at: null,
          picked_by: null,
          skip_reason: null,
        }))
      : [];

    const { error: orderError } = await supabase
      .from('orders')
      .update({
        order_status: 'confirmed',
        warehouse_status: 'pending',
        picking_started_at: null,
        picked_by_user: null,
        locked_by: null,
        locked_at: null,
        items,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (orderError) return { success: false, error: orderError.message };

    // Also reset picking state in order_items table
    await supabase
      .from('order_items')
      .update({
        picked_quantity: 0,
        last_scanned_gtin: null,
        picked_at: null,
        picked_by: null,
        skip_reason: null,
      })
      .eq('order_id', orderId);

    pushOrderStatusToStore(orderId, 'confirmed', 'Picking cancelled — returned to confirmed');

    return { success: true, error: null };
  }

  /**
   * Complete picking
   */
  static async completePicking(orderId: string, durationSeconds: number): Promise<{ success: boolean; error: string | null }> {
    const { error } = await supabase
      .from('orders')
      .update({
        warehouse_status: 'packing',
        order_status: 'packing',
        picking_completed_at: new Date().toISOString(),
        picking_duration: durationSeconds,
        locked_by: null,
        locked_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (error) return { success: false, error: error.message };

    pushOrderStatusToStore(orderId, 'packing', 'Picking complete — moved to packing');

    return { success: true, error: null };
  }

  /**
   * Move to packing
   */
  static async moveToPacking(orderId: string): Promise<{ success: boolean; error: string | null }> {
    const { error } = await supabase
      .from('orders')
      .update({
        warehouse_status: 'packing',
        order_status: 'packing',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (error) return { success: false, error: error.message };

    pushOrderStatusToStore(orderId, 'packing', 'Moved to packing');

    return { success: true, error: null };
  }

  static async completePacking(orderId: string): Promise<{ success: boolean; error: string | null }> {
    const { error } = await supabase
      .from('orders')
      .update({
        warehouse_status: 'ready_to_ship',
        order_status: 'packed',
        packing_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (error) return { success: false, error: error.message };

    pushOrderStatusToStore(orderId, 'packed', 'Packing complete');

    return { success: true, error: null };
  }

  static async markReadyToShip(orderId: string): Promise<{ success: boolean; error: string | null }> {
    const { error } = await supabase
      .from('orders')
      .update({
        warehouse_status: 'ready_to_ship',
        order_status: 'ready_to_ship',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (error) return { success: false, error: error.message };

    pushOrderStatusToStore(orderId, 'ready_to_ship', 'Ready to ship');

    return { success: true, error: null };
  }
}

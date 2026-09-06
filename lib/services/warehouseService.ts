import { supabase } from '../supabase';
import { pushOrderStatusToStore } from '../utils/orderStatusSync';

export type WarehouseAction =
  | 'PICK_STARTED'
  | 'ITEM_PICKED'
  | 'PICKING_COMPLETED'
  | 'BARCODE_SCANNED'
  | 'BARCODE_VERIFIED'
  | 'WRONG_BARCODE'
  | 'PACKING_STARTED'
  | 'PACKING_COMPLETED'
  | 'SHIPMENT_BOOKING_BLOCKED'
  | 'SHIPMENT_BOOKED';

export class WarehouseService {
  /**
   * Log a warehouse action for auditing
   */
  static async logAction(params: {
    orderId: string;
    action: WarehouseAction;
    details?: any;
    userId?: string;
  }): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = params.userId || user?.id;

      await supabase.from('warehouse_logs').insert({
        order_id: params.orderId,
        user_id: userId,
        action: params.action,
        details: params.details || {},
      });
    } catch (err) {
      console.error('[WarehouseService] Failed to log action:', err);
    }
  }

  /**
   * Check if an order is fully barcode verified
   */
  static async isFullyVerified(orderId: string): Promise<boolean> {
    // Try RPC first
    const { data: rpcData, error: rpcError } = await supabase.rpc('is_order_fully_verified', { p_order_id: orderId });
    if (!rpcError && rpcData !== null) return !!rpcData;

    // Fallback: Check locally if items are in JSONB column
    const { data: order } = await supabase.from('orders').select('items').eq('id', orderId).single();
    if (order && Array.isArray(order.items)) {
      return order.items.every((it: any) => (it.verified_quantity || 0) >= (it.quantity || 1));
    }

    return false;
  }

  /**
   * Verify a barcode for a product in an order during packing
   */
  static async verifyBarcode(params: {
    orderId: string;
    barcode: string;
    userId: string;
  }): Promise<{ success: boolean; item?: any; error?: string; remaining?: number }> {
    try {
      // 1. Find the product by barcode (GTIN or SKU)
      const { data: products, error: pError } = await supabase
        .from('products')
        .select('id, name, sku, gtin')
        .or(`gtin.eq.${params.barcode},sku.eq.${params.barcode}`)
        .limit(1);

      if (pError || !products || products.length === 0) {
        await this.logAction({
          orderId: params.orderId,
          action: 'WRONG_BARCODE',
          details: { barcode: params.barcode, reason: 'Barcode not found in catalog' },
          userId: params.userId
        });
        return { success: false, error: 'Product not found for this barcode' };
      }

      const product = products[0];

      // 2. Find the item in the order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('items')
        .eq('id', params.orderId)
        .single();

      if (orderError || !order) return { success: false, error: 'Order not found' };

      // 2a. Try to update JSONB items first
      if (Array.isArray(order.items) && order.items.length > 0) {
        const items = [...order.items];
        const idx = items.findIndex((it: any) => it.product_id === product.id);

        if (idx !== -1) {
          const item = items[idx];
          if ((item.verified_quantity || 0) >= (item.quantity || 1)) {
             return { success: false, error: 'Required quantity already verified', remaining: 0 };
          }
          item.verified_quantity = (item.verified_quantity || 0) + 1;
          item.verified_at = new Date().toISOString();
          item.verified_by = params.userId;

          const { error: updateError } = await supabase
            .from('orders')
            .update({ items, updated_at: new Date().toISOString() })
            .eq('id', params.orderId);

          if (!updateError) {
             await this.logAction({
               orderId: params.orderId,
               action: 'BARCODE_VERIFIED',
               details: { product_id: product.id, product_name: product.name, barcode: params.barcode, verified_qty: item.verified_quantity },
               userId: params.userId
             });
             return { success: true, item, remaining: (item.quantity || 1) - item.verified_quantity };
          }
        }
      }

      // 2b. Fallback to order_items table
      const { data: orderItems, error: oiError } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', params.orderId)
        .eq('product_id', product.id)
        .limit(1);

      if (oiError || !orderItems || orderItems.length === 0) {
        await this.logAction({
          orderId: params.orderId,
          action: 'WRONG_BARCODE',
          details: { barcode: params.barcode, product_name: product.name, reason: 'Product not in this order' },
          userId: params.userId
        });
        return { success: false, error: `Product "${product.name}" is not in this order` };
      }

      const item = orderItems[0];

      if (item.verified_quantity >= item.quantity) {
        return { success: false, error: 'Required quantity already verified for this product', remaining: 0 };
      }

      // 3. Increment verified quantity
      const newVerifiedQty = (item.verified_quantity || 0) + 1;
      const { error: updateError } = await supabase
        .from('order_items')
        .update({
          verified_quantity: newVerifiedQty,
          verified_at: new Date().toISOString(),
          verified_by: params.userId
        })
        .eq('id', item.id);

      if (updateError) throw updateError;

      await this.logAction({
        orderId: params.orderId,
        action: 'BARCODE_VERIFIED',
        details: {
          product_id: product.id,
          product_name: product.name,
          barcode: params.barcode,
          verified_qty: newVerifiedQty,
          total_needed: item.quantity
        },
        userId: params.userId
      });

      return {
        success: true,
        item: { ...item, verified_quantity: newVerifiedQty },
        remaining: item.quantity - newVerifiedQty
      };

    } catch (err: any) {
      console.error('[WarehouseService] verifyBarcode error:', err);
      return { success: false, error: err.message || 'Verification failed' };
    }
  }

  /**
   * Complete packing for an order
   */
  static async completePacking(params: {
    orderId: string;
    userId: string;
    materials: { materialId: string; quantity: number; costPerUnit: number }[];
    notes?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const fullyVerified = await this.isFullyVerified(params.orderId);
      if (!fullyVerified) {
        return { success: false, error: 'Order items have not been fully barcode-verified' };
      }

      // 1. Create or get order_packing record
      const { data: packing, error: pError } = await supabase
        .from('order_packing')
        .upsert({
          order_id: params.orderId,
          packed_by: params.userId,
          packed_at: new Date().toISOString(),
          status: 'completed',
          notes: params.notes
        }, { onConflict: 'order_id' })
        .select()
        .single();

      if (pError) throw pError;

      // 2. Save packing items and record transactions
      if (params.materials.length > 0) {
        // Clear old items if any (to allow re-packing)
        await supabase.from('order_packing_items').delete().eq('order_packing_id', packing.id);

        for (const m of params.materials) {
          // Record items used
          await supabase.from('order_packing_items').insert({
            order_packing_id: packing.id,
            material_id: m.materialId,
            quantity_used: m.quantity,
            cost_per_unit: m.costPerUnit,
            total_cost: m.quantity * m.costPerUnit
          });

          // Record stock deduction transaction
          await supabase.from('packing_material_transactions').insert({
            material_id: m.materialId,
            type: 'OUT',
            quantity: -m.quantity,
            reference_type: 'order',
            reference_id: params.orderId,
            notes: `Used for order ${params.orderId}`,
            created_by: params.userId
          });
        }
      }

      // 3. Update order status
      const { error } = await supabase
        .from('orders')
        .update({
          order_status: 'packed',
          warehouse_status: 'packed',
          fulfillment_status: 'packed',
          packed_at: new Date().toISOString(),
          packed_by_user: params.userId,
          updated_at: new Date().toISOString()
        })
        .eq('id', params.orderId);

      if (error) throw error;

      await this.logAction({
        orderId: params.orderId,
        action: 'PACKING_COMPLETED',
        userId: params.userId
      });

      // Sync status to remote store
      pushOrderStatusToStore(params.orderId, 'packed', 'Order packed and verified');

      return { success: true };
    } catch (err: any) {
      console.error('[WarehouseService] completePacking error:', err);
      return { success: false, error: err.message || 'Failed to complete packing' };
    }
  }
}

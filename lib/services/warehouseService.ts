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
  static async logAction(params: { orderId: string; action: WarehouseAction; details?: any; userId?: string }): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = params.userId || user?.id;
      const { error } = await supabase.from('warehouse_logs').insert({
        order_id: params.orderId,
        user_id: userId,
        action: params.action,
        details: params.details || {}
      });
      if (error) console.error('[WarehouseService] Failed to log action:', error);
    } catch (err) {
      console.error('[WarehouseService] Failed to log action:', err);
    }
  }

  static async isFullyVerified(orderId: string): Promise<boolean> {
    const { data: rpcData, error: rpcError } = await supabase.rpc('is_order_fully_verified', { p_order_id: orderId });
    if (!rpcError && rpcData !== null) return !!rpcData;

    const { data: order } = await supabase.from('orders').select('items').eq('id', orderId).single();
    if (order && Array.isArray(order.items)) {
      return order.items.every((it: any) => (it.verified_quantity || 0) >= (it.quantity || 1));
    }
    return false;
  }

  static async verifyBarcode(params: { orderId: string; barcode: string; userId: string }): Promise<{ success: boolean; item?: any; error?: string; remaining?: number }> {
    try {
      const { data: products, error: pError } = await supabase
        .from('products')
        .select('id, name, sku, gtin')
        .or(`gtin.eq.${params.barcode},sku.eq.${params.barcode}`)
        .limit(1);

      if (pError || !products || products.length === 0) {
        await this.logAction({ orderId: params.orderId, action: 'WRONG_BARCODE', details: { barcode: params.barcode, reason: 'Barcode not found in catalog' }, userId: params.userId });
        return { success: false, error: 'Product not found for this barcode' };
      }

      const product = products[0];
      const { data: order, error: orderError } = await supabase.from('orders').select('items').eq('id', params.orderId).single();
      if (orderError || !order) return { success: false, error: 'Order not found' };

      if (Array.isArray(order.items) && order.items.length > 0) {
        const items = [...order.items];
        const idx = items.findIndex((it: any) => it.product_id === product.id);
        if (idx !== -1) {
          const item = items[idx];
          if ((item.verified_quantity || 0) >= (item.quantity || 1)) return { success: false, error: 'Required quantity already verified', remaining: 0 };

          item.verified_quantity = (item.verified_quantity || 0) + 1;
          item.verified_at = new Date().toISOString();
          item.verified_by = params.userId;
          const { error: updateError } = await supabase.from('orders').update({ items, updated_at: new Date().toISOString() }).eq('id', params.orderId);
          if (!updateError) {
            await this.logAction({ orderId: params.orderId, action: 'BARCODE_VERIFIED', details: { product_id: product.id, product_name: product.name, barcode: params.barcode, verified_qty: item.verified_quantity }, userId: params.userId });
            return { success: true, item, remaining: (item.quantity || 1) - item.verified_quantity };
          }
        }
      }

      const { data: orderItems, error: oiError } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', params.orderId)
        .eq('product_id', product.id)
        .limit(1);

      if (oiError || !orderItems || orderItems.length === 0) {
        await this.logAction({ orderId: params.orderId, action: 'WRONG_BARCODE', details: { barcode: params.barcode, product_name: product.name, reason: 'Product not in this order' }, userId: params.userId });
        return { success: false, error: `Product "${product.name}" is not in this order` };
      }

      const item = orderItems[0];
      if ((item.verified_quantity || 0) >= item.quantity) return { success: false, error: 'Required quantity already verified for this product', remaining: 0 };

      const newVerifiedQty = (item.verified_quantity || 0) + 1;
      const { error: updateError } = await supabase
        .from('order_items')
        .update({ verified_quantity: newVerifiedQty, verified_at: new Date().toISOString(), verified_by: params.userId })
        .eq('id', item.id);
      if (updateError) throw updateError;

      await this.logAction({ orderId: params.orderId, action: 'BARCODE_VERIFIED', details: { product_id: product.id, product_name: product.name, barcode: params.barcode, verified_qty: newVerifiedQty, total_needed: item.quantity }, userId: params.userId });
      return { success: true, item: { ...item, verified_quantity: newVerifiedQty }, remaining: item.quantity - newVerifiedQty };
    } catch (err: any) {
      console.error('[WarehouseService] verifyBarcode error:', err);
      return { success: false, error: err.message || 'Verification failed' };
    }
  }

  static async completePacking(params: {
    orderId: string;
    userId: string;
    materials: { materialId: string; quantity: number; costPerUnit: number }[];
    notes?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const fullyVerified = await this.isFullyVerified(params.orderId);
      if (!fullyVerified) return { success: false, error: 'Order items have not been fully barcode-verified' };

      const now = new Date().toISOString();
      const { data: packing, error: pError } = await supabase.from('order_packing').upsert({
        order_id: params.orderId,
        packed_by: params.userId,
        packed_at: now,
        status: 'completed',
        notes: params.notes || null
      }, { onConflict: 'order_id' }).select().single();
      if (pError) throw pError;

      const { error: clearPackingError } = await supabase.from('order_packing_items').delete().eq('order_packing_id', packing.id);
      if (clearPackingError) throw clearPackingError;
      const { error: clearAllocationError } = await supabase.from('order_packaging_allocations').delete().eq('order_id', params.orderId);
      if (clearAllocationError) throw clearAllocationError;

      if (params.materials.length > 0) {
        const materialIds = [...new Set(params.materials.map(m => m.materialId))];
        const { data: materialRows, error: materialError } = await supabase
          .from('packaging_materials')
          .select('id,sku,name,unit_type,vat_rate,unit_weight_kg')
          .in('id', materialIds);
        if (materialError) throw materialError;

        const materialMap = new Map((materialRows || []).map((row: any) => [row.id, row]));
        for (const m of params.materials) {
          const material: any = materialMap.get(m.materialId);
          if (!material) throw new Error(`Packaging material ${m.materialId} no longer exists.`);

          const quantity = Math.max(0, Number(m.quantity || 0));
          if (quantity <= 0) continue;
          const unitCost = Math.max(0, Number(m.costPerUnit || 0));
          const costNet = quantity * unitCost;
          const vatRate = Math.max(0, Number(material.vat_rate ?? 20));
          const vatAmount = costNet * vatRate / 100;

          const { error: itemError } = await supabase.from('order_packing_items').insert({
            order_packing_id: packing.id,
            material_id: m.materialId,
            quantity_used: quantity,
            cost_per_unit: unitCost,
            total_cost: costNet
          });
          if (itemError) throw itemError;

          const { error: allocationError } = await supabase.from('order_packaging_allocations').upsert({
            order_id: params.orderId,
            material_id: m.materialId,
            material_sku: material.sku || `PKG-${m.materialId.slice(0, 8)}`,
            material_name: material.name || 'Packaging material',
            quantity_used: quantity,
            usage_unit: material.unit_type || 'unit',
            unit_cost_net: unitCost,
            cost_net: costNet,
            vat_rate: vatRate,
            vat_amount: vatAmount,
            cost_gross: costNet + vatAmount,
            unit_weight_kg: material.unit_weight_kg ?? null,
            allocated_weight_kg: material.unit_weight_kg != null ? Number(material.unit_weight_kg) * quantity : null,
            allocation_basis: 'packing_confirmation',
            is_estimated: false,
            confidence: 1,
            cost_as_of_date: now.slice(0, 10),
            updated_at: now
          }, { onConflict: 'order_id,material_id' });
          if (allocationError) throw allocationError;
        }
      }

      const { error: orderError } = await supabase.from('orders').update({
        order_status: 'packed',
        warehouse_status: 'packed',
        fulfillment_status: 'packed',
        packed_at: now,
        packed_by_user: params.userId,
        updated_at: now
      }).eq('id', params.orderId);
      if (orderError) throw orderError;

      await this.logAction({ orderId: params.orderId, action: 'PACKING_COMPLETED', userId: params.userId });
      void pushOrderStatusToStore(params.orderId, 'packed', 'Order packed and verified');
      return { success: true };
    } catch (err: any) {
      console.error('[WarehouseService] completePacking error:', err);
      return { success: false, error: err.message || 'Failed to complete packing' };
    }
  }
}

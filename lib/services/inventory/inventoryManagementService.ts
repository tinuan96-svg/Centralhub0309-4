import { supabase } from '@/lib/supabase';

export type MovementType =
  | 'SALE'
  | 'PURCHASE'
  | 'MANUAL_ADJUSTMENT'
  | 'RETURN'
  | 'REFUND'
  | 'DAMAGE'
  | 'EXPIRED'
  | 'WAREHOUSE_TRANSFER'
  | 'INITIAL_STOCK'
  | 'DEDUCT'
  | 'RESTORE'
  | 'ADJUST';

export interface StockAdjustment {
  productId: string;
  warehouseId?: string;
  changeAmount: number;
  type: MovementType;
  reason: string;
  orderId?: string;
  supplierId?: string;
  notes?: string;
}

export class InventoryManagementService {
  static async getDashboardStats() {
    try {
      // 1. Get basic counts
      const { count: totalProducts, error: prodError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .or('is_deleted.is.null,is_deleted.eq.false');

      if (prodError) console.warn('[InventoryManagementService] totalProducts error:', prodError.message);

      // 2. Fetch inventory data with product info (explicit join or separate)
      // Attempt explicit join via product_id to ensure PostgREST finds the relationship
      const { data: inventoryData, error: invError } = await supabase
        .from('central_inventory')
        .select(`
          stock_quantity,
          low_stock_threshold,
          products!product_id (
            cost_price
          )
        `);

      if (invError) {
        console.error('[InventoryManagementService] inventoryData join error:', invError.message);
        // Fallback: If join fails, fetch central_inventory alone to at least show stock units
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('central_inventory')
          .select('stock_quantity, low_stock_threshold');

        if (fallbackError) throw fallbackError;

        let totalStockUnits = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;

        fallbackData?.forEach((inv: any) => {
          const stock = Number(inv.stock_quantity || 0);
          const threshold = Number(inv.low_stock_threshold || 5);
          totalStockUnits += stock;
          if (stock <= 0) outOfStockCount++;
          else if (stock <= threshold) lowStockCount++;
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const { count: movementsToday } = await supabase.from('inventory_logs').select('*', { count: 'exact', head: true }).gte('created_at', today.toISOString());

        return {
          totalProducts: totalProducts || 0,
          totalStockUnits,
          totalInventoryValue: 0, // Cannot calculate without cost_price
          lowStockCount,
          outOfStockCount,
          movementsToday: movementsToday || 0
        };
      }

      let totalStockUnits = 0;
      let totalInventoryValue = 0;
      let lowStockCount = 0;
      let outOfStockCount = 0;

      inventoryData?.forEach((inv: any) => {
        const stock = Number(inv.stock_quantity || 0);
        const productData = Array.isArray(inv.products) ? inv.products[0] : inv.products;
        const threshold = Number(inv.low_stock_threshold || 5);

        totalStockUnits += stock;
        if (productData) {
          totalInventoryValue += stock * (Number(productData.cost_price) || 0);
        }

        if (stock <= 0) outOfStockCount++;
        else if (stock <= threshold) lowStockCount++;
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: movementsToday, error: logsError } = await supabase
        .from('inventory_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());

      if (logsError) console.warn('[InventoryManagementService] movementsToday error:', logsError.message);

      return {
        totalProducts: totalProducts || 0,
        totalStockUnits,
        totalInventoryValue,
        lowStockCount,
        outOfStockCount,
        movementsToday: movementsToday || 0
      };
    } catch (e) {
      console.error('[InventoryManagementService] getDashboardStats critical failure:', e);
      return null;
    }
  }

  static async adjustStock(adj: StockAdjustment) {
    console.log(`[InventoryManagementService] Adjusting stock for ${adj.productId} by ${adj.changeAmount}`);

    // 1. Fetch current state from central_inventory (Source of Truth)
    const { data: inventory, error: fetchError } = await supabase
      .from('central_inventory')
      .select('stock_quantity, products!product_id(name, sku)')
      .eq('product_id', adj.productId)
      .maybeSingle();

    if (fetchError || !inventory) {
      console.error(`[InventoryManagementService] Product ${adj.productId} not found in inventory:`, fetchError);
      throw new Error('Product not found in inventory. Please ensure it is registered in the catalog.');
    }

    const product = Array.isArray((inventory as any).products)
      ? (inventory as any).products[0]
      : (inventory as any).products;
    const oldStock = Number(inventory.stock_quantity || 0);
    const newStock = oldStock + adj.changeAmount;

    // 2. Update central_inventory Ledger (Atomic Upsert)
    const { error: ciError } = await supabase
      .from('central_inventory')
      .upsert({
        product_id: adj.productId,
        stock_quantity: newStock,
        updated_at: new Date().toISOString()
      }, { onConflict: 'product_id' });

    if (ciError) {
      console.error(`[InventoryManagementService] central_inventory update failed:`, ciError);
      throw new Error(`Inventory update failed: ${ciError.message}`);
    }

    // 2b. Sync back to legacy products.stock - REMOVED: Database trigger now handles this automatically
    // to prevent "Direct updates to products.stock are blocked" errors.
    // await supabase.from('products').update({ stock: newStock }).eq('id', adj.productId);

    // 3. Log the change for Audit Trail (inventory_movements is our enterprise ledger)
    const { error: moveError } = await supabase.from('inventory_movements').insert({
      product_id: adj.productId,
      sku: product?.sku,
      change_amount: adj.changeAmount,
      old_stock: oldStock,
      new_stock: newStock,
      action_type: adj.type,
      reason: adj.reason,
      notes: adj.notes || adj.reason,
      order_id: adj.orderId,
      created_at: new Date().toISOString()
    });

    if (moveError) {
       console.error(`[InventoryManagementService] inventory_movements insert failed:`, moveError);
    }

    return { success: true, newStock };
  }

  static async bulkAdjustStock(params: {
    items: { sku: string; count: number }[];
    reason: string;
    type: string;
  }) {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase.rpc('process_bulk_physical_count', {
      p_items: params.items,
      p_reason: params.reason,
      p_adjustment_type: params.type,
      p_user_id: user?.id
    });

    if (error) {
      console.error('[InventoryManagementService] bulkAdjustStock RPC failed:', error);
      throw new Error(error.message);
    }

    return data;
  }

  static async getMovements(filters?: { productId?: string; type?: string; limit?: number }) {
    let query = supabase.from('inventory_movements').select('*, products!product_id(name)').order('created_at', { ascending: false });
    if (filters?.productId) query = query.eq('product_id', filters.productId);
    if (filters?.type) query = query.eq('action_type', filters.type);
    if (filters?.limit) query = query.limit(filters.limit);
    const { data, error } = await query;
    if (error) {
      console.error('Error fetching inventory movements:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return [];
    }
    return (data || []).map((row: any) => ({
      id: row.id,
      product_id: row.product_id,
      product_name: row.products?.name || 'Unknown',
      sku: row.sku,
      change_amount: row.change_amount,
      old_stock: row.old_stock,
      new_stock: row.new_stock,
      action_type: row.action_type,
      notes: row.notes,
      order_number: row.order_number,
      created_at: row.created_at,
    }));
  }

  static async getWarehouses() {
    try {
      const { data, error } = await supabase.from('warehouses').select('*').order('name');
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('[InventoryManagementService] Error fetching warehouses:', e);
      return [];
    }
  }
}

import { supabase } from '../supabase';
import { CentralInventory, InventoryLog, InventoryWithProduct, MovementType } from '../types';
import { StockSyncService } from './products/stockSyncService';

export class InventoryService {
  static async getAllInventory(limit: number = 100): Promise<InventoryWithProduct[]> {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id,
        name,
        slug,
        price,
        cost_price,
        backorder,
        allow_backorder,
        central_inventory:central_inventory!product_id (
          stock_quantity,
          low_stock_threshold,
          updated_at
        )
      `)
      .limit(limit);

    if (error) {
      console.error('Error fetching inventory:', error);
      return [];
    }

    return (data || []).map((item: any) => {
      const inventory = Array.isArray(item.central_inventory)
        ? item.central_inventory[0]
        : item.central_inventory;

      const stockQuantity = inventory?.stock_quantity ?? 0;
      const lowStockThreshold = inventory?.low_stock_threshold ?? 5;
      const availableStock = stockQuantity; // Reserved stock system removed

      const stockStatus =
        availableStock <= 0
          ? 'out'
          : availableStock <= lowStockThreshold
          ? 'low'
          : 'ok';

      return {
        product_id: item.id,
        stock_quantity: stockQuantity,
        reserved_quantity: 0,
        low_stock_threshold: lowStockThreshold,
        updated_at: inventory?.updated_at || null,
        product_name: item.name || 'Unknown Product',
        product_sku: item.slug || null,
        available_stock: availableStock,
        stock_status: stockStatus,
        price: item.price || 0,
        cost_price: item.cost_price || 0,
        backorder: item.backorder,
        allow_backorder: item.allow_backorder,
      } as any;
    });
  }

  static async getInventoryForProduct(
    productId: string
  ): Promise<CentralInventory | null> {
    const { data, error } = await supabase
      .from('central_inventory')
      .select('*')
      .eq('product_id', productId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching product inventory:', error);
      return null;
    }

    return data;
  }

  static async initializeInventory(
    productId: string,
    initialStock: number = 0,
    lowStockThreshold: number = 5,
    storeId: string | null = null
  ): Promise<CentralInventory | null> {
    const { data, error } = await supabase
      .from('central_inventory')
      .upsert({
        product_id: productId,
        stock_quantity: initialStock,
        reserved_quantity: 0,
        low_stock_threshold: lowStockThreshold,
        updated_at: new Date().toISOString()
      }, { onConflict: 'product_id' })
      .select()
      .single();

    if (error) {
      console.error('Error initializing inventory:', error);
      return null;
    }

    await this.logInventoryChange(
      productId,
      initialStock,
      'MANUAL',
      null,
      'Initial inventory setup',
      storeId
    );

    // Sync to websites
    await StockSyncService.syncStockToAllWebsites(productId, initialStock);

    return data;
  }

  static async updateStock(
    productId: string,
    newQuantity: number,
    reason: string,
    userId?: string,
    deviceName: string = 'CentralHub Web',
    notes?: string,
    storeId: string | null = null
  ): Promise<void> {
    const current = await this.getInventoryForProduct(productId);
    const oldQuantity = current?.stock_quantity ?? 0;
    const change = newQuantity - oldQuantity;

    // Update Central Ledger (Source of Truth)
    // Rule: Backend stock sync handles products.stock enforcement
    const { error } = await supabase
      .from('central_inventory')
      .upsert({
        product_id: productId,
        stock_quantity: newQuantity,
        reserved_quantity: 0,
        updated_at: new Date().toISOString()
      }, { onConflict: 'product_id' });

    if (error) {
      console.error('Error updating stock in central_inventory:', error);
      throw error;
    }

    // Attempt to get user if not provided
    let effectiveUserId = userId;
    if (!effectiveUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      effectiveUserId = user?.id || 'system';
    }

    // Detailed audit logging
    const { error: logError } = await supabase.from('inventory_logs').insert([
      {
        product_id: productId,
        change,
        old_quantity: oldQuantity,
        new_quantity: newQuantity,
        type: 'ADJUSTMENT',
        reason: reason,
        notes: notes || `Manual adjustment by ${effectiveUserId}`,
        edited_by: effectiveUserId,
        device_name: deviceName,
        store_id: storeId,
        created_at: new Date().toISOString()
      },
    ]);

    if (logError) {
      console.error('Error logging inventory adjustment:', logError);
    }

    // Sync updated stock to websites
    await StockSyncService.syncStockToAllWebsites(productId, newQuantity);
  }

  static async deductStock(
    productId: string,
    quantity: number,
    orderId: string,
    store_id: string | null = null
  ): Promise<boolean> {
    const inventory = await this.getInventoryForProduct(productId);
    const currentStock = inventory?.stock_quantity ?? 0;
    const newStockQuantity = currentStock - quantity;

    // Update Central Ledger (Source of Truth)
    const { error } = await supabase
      .from('central_inventory')
      .upsert({
        product_id: productId,
        stock_quantity: newStockQuantity,
        reserved_quantity: 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'product_id' });

    if (error) {
      console.error('Error deducting stock:', error);
      return false;
    }

    await this.logInventoryChange(
      productId,
      -quantity,
      'ORDER',
      orderId,
      `Deducted ${quantity} units — payment confirmed`,
      store_id
    );

    await StockSyncService.syncStockToAllWebsites(productId, newStockQuantity);

    return true;
  }

  static async reserveStock(
    productId: string,
    quantity: number,
    orderId: string,
    storeId: string | null = null
  ): Promise<boolean> {
    return true; // System removed
  }

  static async commitStock(
    productId: string,
    quantity: number,
    orderId: string,
    store_id: string | null = null,
    skipRemoteSync: boolean = false
  ): Promise<boolean> {
    const inventory = await this.getInventoryForProduct(productId);
    const currentStock = inventory?.stock_quantity ?? 0;
    const newStockQuantity = currentStock - quantity;

    // Update Central Ledger (Source of Truth)
    const { error } = await supabase
      .from('central_inventory')
      .upsert({
        product_id: productId,
        stock_quantity: newStockQuantity,
        reserved_quantity: 0,
        updated_at: new Date().toISOString()
      }, { onConflict: 'product_id' });

    if (error) {
      console.error('Error committing stock:', error);
      return false;
    }

    await this.logInventoryChange(
      productId,
      -quantity,
      'ORDER',
      orderId,
      `Committed ${quantity} units for order completion`,
      store_id
    );

    if (!skipRemoteSync) {
      await StockSyncService.syncStockToAllWebsites(productId, newStockQuantity);
    }

    return true;
  }

  static async releaseStock(
    productId: string,
    quantity: number,
    orderId: string,
    storeId: string | null = null
  ): Promise<boolean> {
    return true; // System removed
  }

  static async returnStock(
    productId: string,
    quantity: number,
    orderId: string,
    notes?: string,
    storeId: string | null = null
  ): Promise<boolean> {
    const inventory = await this.getInventoryForProduct(productId);
    const currentStock = inventory?.stock_quantity ?? 0;
    const newStockQuantity = currentStock + quantity;

    // Update Central Ledger (Source of Truth)
    const { error } = await supabase
      .from('central_inventory')
      .upsert({
        product_id: productId,
        stock_quantity: newStockQuantity,
        reserved_quantity: 0,
        updated_at: new Date().toISOString()
      }, { onConflict: 'product_id' });

    if (error) {
      console.error('Error returning stock:', error);
      return false;
    }

    await this.logInventoryChange(
      productId,
      quantity,
      'RETURN',
      orderId,
      notes || `Returned ${quantity} units from order`,
      storeId
    );

    await StockSyncService.syncStockToAllWebsites(productId, newStockQuantity);

    return true;
  }

  static async getLowStockProducts(threshold?: number): Promise<InventoryWithProduct[]> {
    const allInventory = await this.getAllInventory();

    return allInventory.filter((item) => {
      const checkThreshold = threshold ?? item.low_stock_threshold;
      return item.stock_quantity <= checkThreshold;
    });
  }

  static async getInventoryLogs(
    productId?: string,
    limit: number = 100,
    filters?: {
      type?: string;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
    }
  ): Promise<InventoryLog[]> {
    let query = supabase
      .from('inventory_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (productId) {
      query = query.eq('product_id', productId);
    }

    if (filters) {
      if (filters.type && filters.type !== 'all') {
        query = query.eq('movement_type', filters.type);
      }
      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo);
      }
      if (filters.search) {
        const s = `%${filters.search}%`;
        query = query.or(`product_name.ilike.${s},sku.ilike.${s},reference_number.ilike.${s}`);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching inventory logs:', error);
      return [];
    }

    return (data || []).map((log: any) => ({
      ...log,
      product_name: log.product_name || 'Unknown Product',
      sku: log.sku || null,
      edited_by: log.edited_by || 'System'
    }));
  }

  static async getInventoryStats(): Promise<{
    stockInToday: number;
    stockOutToday: number;
    adjustmentsToday: number;
    transfersToday: number;
    lowStockCount: number;
    outOfStockCount: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const [logsResult, lowStockResult] = await Promise.all([
      supabase
        .from('inventory_logs')
        .select('change, movement_type, type')
        .gte('created_at', todayStr),
      this.getAllInventory(2000)
    ]);

    const logs = logsResult.data || [];
    const stats = {
      stockInToday: 0,
      stockOutToday: 0,
      adjustmentsToday: 0,
      transfersToday: 0,
      lowStockCount: 0,
      outOfStockCount: 0
    };

    logs.forEach(log => {
      if (log.change > 0) stats.stockInToday += log.change;
      else if (log.change < 0) stats.stockOutToday += Math.abs(log.change);

      if (log.movement_type === 'ADJUSTMENT' || log.type === 'ADJUSTMENT') stats.adjustmentsToday++;
      if (log.movement_type === 'TRANSFER') stats.transfersToday++;
    });

    stats.lowStockCount = lowStockResult.filter(i => i.stock_status === 'low').length;
    stats.outOfStockCount = lowStockResult.filter(i => i.stock_status === 'out').length;

    return stats;
  }

  private static async logInventoryChange(
    productId: string | null,
    change: number,
    type: 'ORDER' | 'MANUAL' | 'RETURN' | 'ADJUSTMENT' | 'TRANSFER' | 'SYNC',
    referenceId: string | null,
    notes: string | null,
    storeId: string | null = null,
    movementType?: MovementType,
    referenceType?: string,
    referenceNumber?: string
  ): Promise<void> {
    let oldQuantity = 0;
    let product_name = 'System Sync';
    let sku = null;

    if (productId) {
      const { data: product } = await supabase
        .from('products')
        .select('name, sku, stock')
        .eq('id', productId)
        .single();

      oldQuantity = product?.stock || 0;
      product_name = product?.name || 'Unknown Product';
      sku = product?.sku || null;
    }

    const newQuantity = oldQuantity + change;

    const { error } = await supabase.from('inventory_logs').insert([
      {
        product_id: productId,
        product_name: product_name,
        sku: sku,
        change,
        old_quantity: oldQuantity,
        new_quantity: newQuantity,
        type: type === 'TRANSFER' ? 'ADJUSTMENT' : type,
        movement_type: movementType || (change > 0 ? 'IN' : 'OUT'),
        reference_id: referenceId,
        reference_type: referenceType || (type === 'ORDER' ? 'Customer Order' : type === 'RETURN' ? 'Return' : type === 'SYNC' ? 'System Sync' : 'Manual'),
        reference_number: referenceNumber || referenceId,
        notes,
        store_id: storeId,
        created_at: new Date().toISOString()
      },
    ]);

    if (error) {
      console.error('Error logging inventory change:', error);
    }
  }

  static async bulkUpdateThreshold(
    productIds: string[],
    threshold: number
  ): Promise<void> {
    const { error } = await supabase
      .from('central_inventory')
      .update({ low_stock_threshold: threshold })
      .in('product_id', productIds);

    if (error) {
      console.error('Error updating thresholds:', error);
      throw error;
    }
  }
}

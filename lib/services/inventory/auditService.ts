import { supabase } from '@/lib/supabase';
import { InventoryService } from '../inventoryService';
import { StockSyncService } from '../products/stockSyncService';
import { InventoryManagementService } from './inventoryManagementService';

export interface AuditProduct {
  id: string;
  name: string;
  gtin: string | null;
  sku: string | null;
  brand: string | null;
  category: string | null;
  warehouse_location: string | null;
  is_active: boolean;
  is_published: boolean;
  current_stock: number;
  last_audited_at: string | null;
  expiry_date: string | null;
}

export interface BinLocation {
  id?: string;
  location_code: string;
  stock_quantity: number;
}

const mapProduct = (product: any): AuditProduct => {
  const inventory = Array.isArray(product.central_inventory) ? product.central_inventory[0] : product.central_inventory;
  return {
    id: product.id,
    name: product.name,
    gtin: product.gtin,
    sku: product.sku,
    brand: product.brand,
    category: product.category,
    warehouse_location: product.warehouse_location,
    is_active: product.is_active,
    is_published: product.is_published,
    expiry_date: product.expiry_date,
    current_stock: inventory?.stock_quantity ?? 0,
    last_audited_at: inventory?.last_audited_at ?? null,
  };
};

export class AuditService {
  static async findProductByGTIN(gtin: string): Promise<AuditProduct | null> {
    const { data, error } = await supabase
      .from('products')
      .select(`id, name, gtin, sku, brand, category, warehouse_location, is_active, is_published, expiry_date, central_inventory(stock_quantity, last_audited_at)`)
      .eq('gtin', gtin)
      .maybeSingle();
    if (error) {
      console.error('[AuditService] Error finding product by GTIN:', error);
      return null;
    }
    return data ? mapProduct(data) : null;
  }

  static async getBinLocations(productId: string): Promise<BinLocation[]> {
    const { data, error } = await supabase.from('product_bin_locations').select('*').eq('product_id', productId);
    if (error) return [];
    return data || [];
  }

  static async performAudit(params: {
    productId: string;
    totalStock: number;
    bins: { location_code: string; stock_quantity: number }[];
    expiryDate?: string | null;
    notes?: string;
    userId?: string;
    gtin?: string;
  }): Promise<boolean> {
    const { productId, totalStock, bins, expiryDate, notes, userId, gtin } = params;
    const auditedAt = new Date().toISOString();

    try {
      const currentInventory = await InventoryService.getInventoryForProduct(productId);
      const oldStock = Number(currentInventory?.stock_quantity ?? 0);
      const change = totalStock - oldStock;

      if (change !== 0) {
        await InventoryManagementService.adjustStock({
          productId,
          changeAmount: change,
          type: 'ADJUST',
          reason: notes || `Physical stock audit across ${bins.length} location${bins.length === 1 ? '' : 's'}`,
          notes: notes || `Physical stock audit across ${bins.length} location${bins.length === 1 ? '' : 's'}`,
        });
      }

      const primaryLocation = bins[0]?.location_code || '';
      const productUpdate: any = { warehouse_location: primaryLocation, expiry_date: expiryDate, updated_at: auditedAt };
      if (gtin) productUpdate.gtin = gtin;
      const { error: productError } = await supabase.from('products').update(productUpdate).eq('id', productId);
      if (productError) throw productError;

      const { error: deleteBinsError } = await supabase.from('product_bin_locations').delete().eq('product_id', productId);
      if (deleteBinsError) throw deleteBinsError;
      if (bins.length > 0) {
        const { error: binsError } = await supabase.from('product_bin_locations').insert(bins.map(bin => ({
          product_id: productId,
          location_code: bin.location_code,
          stock_quantity: bin.stock_quantity,
          last_audited_at: auditedAt
        })));
        if (binsError) throw binsError;
      }

      const { error: inventoryError } = await supabase.from('central_inventory').upsert({
        product_id: productId,
        stock_quantity: totalStock,
        last_audited_at: auditedAt,
        last_audited_by: userId,
        audit_notes: notes,
        updated_at: auditedAt
      }, { onConflict: 'product_id' });
      if (inventoryError) throw inventoryError;

      const { error: logError } = await supabase.from('inventory_logs').insert([{
        product_id: productId,
        change,
        old_quantity: oldStock,
        new_quantity: totalStock,
        type: 'AUDIT',
        reason: 'Physical Stock Audit (Multi-Location)',
        notes: notes || `Audit across ${bins.length} locations.`,
        edited_by: userId,
        created_at: auditedAt
      }]);
      if (logError) console.warn('[AuditService] inventory_logs write failed:', logError.message);

      await StockSyncService.syncStockToAllWebsites(productId, totalStock);
      return true;
    } catch (error) {
      console.error('[AuditService] Audit failed:', error);
      return false;
    }
  }

  static async searchProductsByName(query: string): Promise<AuditProduct[]> {
    const pattern = `%${query}%`;
    const { data, error } = await supabase
      .from('products')
      .select(`id, name, gtin, sku, brand, category, warehouse_location, is_active, is_published, expiry_date, central_inventory(stock_quantity, last_audited_at)`)
      .eq('is_active', true)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .or(`name.ilike.${pattern},brand.ilike.${pattern},category.ilike.${pattern},gtin.ilike.${pattern},sku.ilike.${pattern}`)
      .limit(25);
    if (error) return [];
    return (data || []).map(mapProduct);
  }

  static async getUnauditedProducts(daysAgo = 30): Promise<AuditProduct[]> {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const { data, error } = await supabase
      .from('products')
      .select(`id, name, gtin, sku, brand, category, warehouse_location, is_active, is_published, expiry_date, central_inventory(stock_quantity, last_audited_at)`)
      .eq('is_active', true)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .or(`central_inventory.last_audited_at.is.null,central_inventory.last_audited_at.lt.${date.toISOString()}`)
      .limit(100);
    if (error) {
      console.error('[AuditService] Error fetching unaudited products:', error);
      return [];
    }
    return (data || []).map(mapProduct);
  }

  static async quickCreateProduct(name: string, gtin: string): Promise<AuditProduct | null> {
    const { data, error } = await supabase
      .from('products')
      .insert([{ name, gtin, is_active: true, is_published: false, created_at: new Date().toISOString() }])
      .select()
      .single();
    if (error) {
      console.error('[AuditService] Quick create failed:', error);
      return null;
    }

    const { error: inventoryError } = await supabase.from('central_inventory').insert([{
      product_id: data.id,
      product_name: data.name,
      stock_quantity: 0,
      updated_at: new Date().toISOString()
    }]);
    if (inventoryError) console.warn('[AuditService] inventory initialization failed:', inventoryError.message);

    return {
      id: data.id,
      name: data.name,
      gtin: data.gtin,
      sku: data.sku,
      brand: data.brand,
      category: data.category,
      warehouse_location: data.warehouse_location,
      is_active: data.is_active,
      is_published: data.is_published,
      expiry_date: data.expiry_date || null,
      current_stock: 0,
      last_audited_at: null,
    };
  }
}

import { supabase } from '@/lib/supabase';
import { InventoryService } from '../inventoryService';
import { StockSyncService } from '../products/stockSyncService';

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

export class AuditService {
  static async findProductByGTIN(gtin: string): Promise<AuditProduct | null> {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id, name, gtin, sku, brand, category, warehouse_location, is_active, is_published, expiry_date,
        central_inventory(stock_quantity, last_audited_at)
      `)
      .eq('gtin', gtin)
      .maybeSingle();

    if (error) {
      console.error('[AuditService] Error finding product by GTIN:', error);
      return null;
    }

    if (!data) return null;

    const inventory = Array.isArray(data.central_inventory) ? data.central_inventory[0] : data.central_inventory;

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
      expiry_date: data.expiry_date,
      current_stock: inventory?.stock_quantity ?? 0,
      last_audited_at: inventory?.last_audited_at ?? null,
    };
  }

  static async getBinLocations(productId: string): Promise<BinLocation[]> {
    const { data, error } = await supabase
      .from('product_bin_locations')
      .select('*')
      .eq('product_id', productId);

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

    try {
      // 1. Update Product general info (Main location becomes first bin for backward compat)
      const primaryLocation = bins.length > 0 ? bins[0].location_code : '';
      const productUpdate: any = {
        warehouse_location: primaryLocation,
        expiry_date: expiryDate,
        updated_at: new Date().toISOString()
      };
      if (gtin) productUpdate.gtin = gtin;

      await supabase.from('products').update(productUpdate).eq('id', productId);

      // 2. Update Bin Locations
      // First clear old bins (or you could upsert/delete diff)
      await supabase.from('product_bin_locations').delete().eq('product_id', productId);
      if (bins.length > 0) {
        await supabase.from('product_bin_locations').insert(
          bins.map(b => ({
            product_id: productId,
            location_code: b.location_code,
            stock_quantity: b.stock_quantity,
            last_audited_at: new Date().toISOString()
          }))
        );
      }

      // 3. Update Central Inventory & Log (Standard workflow)
      const currentInventory = await InventoryService.getInventoryForProduct(productId);
      const oldStock = currentInventory?.stock_quantity ?? 0;
      const change = totalStock - oldStock;

      const { error: invError } = await supabase
        .from('central_inventory')
        .upsert({
          product_id: productId,
          stock_quantity: totalStock,
          last_audited_at: new Date().toISOString(),
          last_audited_by: userId,
          audit_notes: notes,
          updated_at: new Date().toISOString()
        }, { onConflict: 'product_id' });

      if (invError) throw invError;

      await supabase.from('inventory_logs').insert([{
        product_id: productId,
        change,
        old_quantity: oldStock,
        new_quantity: totalStock,
        type: 'AUDIT',
        reason: 'Physical Stock Audit (Multi-Location)',
        notes: notes || `Audit across ${bins.length} locations.`,
        edited_by: userId,
        created_at: new Date().toISOString()
      }]);

      await StockSyncService.syncStockToAllWebsites(productId, totalStock);

      return true;
    } catch (err) {
      console.error('[AuditService] Audit failed:', err);
      return false;
    }
  }

  static async searchProductsByName(query: string): Promise<AuditProduct[]> {
    const s = `%${query}%`;
    const { data, error } = await supabase
      .from('products')
      .select(`
        id, name, gtin, sku, brand, category, warehouse_location, is_active, is_published, expiry_date,
        central_inventory(stock_quantity, last_audited_at)
      `)
      .or(`name.ilike.${s},brand.ilike.${s},category.ilike.${s},gtin.ilike.${s},sku.ilike.${s}`)
      .limit(25);

    if (error) return [];

    return (data || []).map(p => {
      const inv = Array.isArray(p.central_inventory) ? p.central_inventory[0] : p.central_inventory;
      return {
        id: p.id,
        name: p.name,
        gtin: p.gtin,
        sku: p.sku,
        brand: p.brand,
        category: p.category,
        warehouse_location: p.warehouse_location,
        is_active: p.is_active,
        is_published: p.is_published,
        expiry_date: p.expiry_date,
        current_stock: inv?.stock_quantity ?? 0,
        last_audited_at: inv?.last_audited_at ?? null,
      };
    });
  }

  static async getUnauditedProducts(daysAgo: number = 30): Promise<AuditProduct[]> {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);

    // Products either never audited or not audited in the last X days
    const { data, error } = await supabase
      .from('products')
      .select(`
        id, name, gtin, sku, brand, category, warehouse_location, is_active, is_published, expiry_date,
        central_inventory(stock_quantity, last_audited_at)
      `)
      .is('is_deleted', false)
      .or(`central_inventory.last_audited_at.is.null,central_inventory.last_audited_at.lt.${date.toISOString()}`)
      .limit(100);

    if (error) {
      console.error('[AuditService] Error fetching unaudited products:', error);
      return [];
    }

    return (data || []).map(p => {
      const inv = Array.isArray(p.central_inventory) ? p.central_inventory[0] : p.central_inventory;
      return {
        id: p.id,
        name: p.name,
        gtin: p.gtin,
        sku: p.sku,
        brand: p.brand,
        category: p.category,
        warehouse_location: p.warehouse_location,
        is_active: p.is_active,
        is_published: p.is_published,
        expiry_date: p.expiry_date,
        current_stock: inv?.stock_quantity ?? 0,
        last_audited_at: inv?.last_audited_at ?? null,
      };
    });
  }

  static async quickCreateProduct(name: string, gtin: string): Promise<AuditProduct | null> {
    const { data, error } = await supabase
      .from('products')
      .insert([{
        name,
        gtin,
        is_active: true,
        is_published: false,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('[AuditService] Quick create failed:', error);
      return null;
    }

    // Initialize central_inventory for the new product
    await supabase.from('central_inventory').insert([{
      product_id: data.id,
      product_name: data.name,
      stock_quantity: 0,
      updated_at: new Date().toISOString()
    }]);

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
      expiry_date: null,
      current_stock: 0,
      last_audited_at: null,
    };
  }
}

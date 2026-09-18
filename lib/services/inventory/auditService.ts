import { supabase } from '@/lib/supabase';
import { StockSyncService } from '../products/stockSyncService';

export interface AuditProduct {
  id: string;
  name: string;
  gtin: string | null;
  sku: string | null;
  brand: string | null;
  category: string | null;
  unit: string | null;
  weight: number | null;
  weight_kg: number | null;
  weight_grams: number | null;
  pack_size: number | null;
  pack_unit: string | null;
  variant_group_key: string | null;
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
    unit: product.unit ?? null,
    weight: product.weight == null ? null : Number(product.weight),
    weight_kg: product.weight_kg == null ? null : Number(product.weight_kg),
    weight_grams: product.weight_grams == null ? null : Number(product.weight_grams),
    pack_size: product.pack_size == null ? null : Number(product.pack_size),
    pack_unit: product.pack_unit ?? null,
    variant_group_key: product.variant_group_key ?? null,
    warehouse_location: product.warehouse_location,
    is_active: product.is_active,
    is_published: product.is_published,
    expiry_date: product.expiry_date,
    current_stock: Number(inventory?.stock_quantity ?? product.stock ?? 0),
    last_audited_at: inventory?.last_audited_at ?? product.last_audited_at ?? null,
  };
};

export class AuditService {
  static async findProductByGTIN(gtin: string): Promise<AuditProduct | null> {
    const { data, error } = await supabase
      .from('products')
      .select(`id, name, gtin, sku, brand, category, unit, weight, weight_kg, weight_grams, pack_size, pack_unit, variant_group_key, warehouse_location, is_active, is_published, expiry_date, central_inventory(stock_quantity, last_audited_at)`)
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
    const auditNote = notes?.trim() || `Physical stock audit across ${bins.length} location${bins.length === 1 ? '' : 's'}`;

    try {
      if (!Number.isFinite(totalStock) || totalStock < 0) {
        throw new Error('Audit stock total must be a non-negative number.');
      }

      const { data: currentInventory, error: currentInventoryError } = await supabase
        .from('central_inventory')
        .select('stock_quantity')
        .eq('product_id', productId)
        .maybeSingle();
      if (currentInventoryError) throw currentInventoryError;
      if (!currentInventory) throw new Error('Product is not registered in the inventory master.');

      const oldStock = Number(currentInventory.stock_quantity ?? 0);
      const change = totalStock - oldStock;
      const primaryLocation = bins[0]?.location_code?.trim() || '';

      const productUpdate: any = {
        warehouse_location: primaryLocation,
        expiry_date: expiryDate || null,
        last_audited_at: auditedAt,
        last_audited_by: userId || null,
        audit_notes: auditNote,
        updated_at: auditedAt
      };
      if (gtin) productUpdate.gtin = gtin;

      const { error: productError } = await supabase
        .from('products')
        .update(productUpdate)
        .eq('id', productId);
      if (productError) throw productError;

      const { error: deleteBinsError } = await supabase
        .from('product_bin_locations')
        .delete()
        .eq('product_id', productId);
      if (deleteBinsError) throw deleteBinsError;

      if (bins.length > 0) {
        const cleanBins = bins.map(bin => ({
          product_id: productId,
          location_code: bin.location_code.trim(),
          stock_quantity: Number(bin.stock_quantity) || 0,
          last_audited_at: auditedAt
        }));
        if (cleanBins.some(bin => !bin.location_code || bin.stock_quantity < 0)) {
          throw new Error('Every stock location needs a location code and a non-negative quantity.');
        }
        const { error: binsError } = await supabase.from('product_bin_locations').insert(cleanBins);
        if (binsError) throw binsError;
      }

      if (change !== 0) {
        // central_inventory is a writable view over products. UPDATE is supported by its
        // INSTEAD OF trigger; UPSERT/ON CONFLICT is not, which was causing audit saves to fail.
        const { error: stockError } = await supabase
          .from('central_inventory')
          .update({ stock_quantity: totalStock, updated_at: auditedAt })
          .eq('product_id', productId);
        if (stockError) throw stockError;

        const { data: warehouse } = await supabase
          .from('warehouses')
          .select('id')
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        const { error: movementError } = await supabase.from('inventory_movements').insert({
          product_id: productId,
          warehouse_id: warehouse?.id || null,
          change_amount: change,
          old_stock: oldStock,
          new_stock: totalStock,
          action_type: 'ADJUST',
          notes: auditNote,
          created_at: auditedAt
        });

        if (movementError) {
          const { error: rollbackError } = await supabase
            .from('central_inventory')
            .update({ stock_quantity: oldStock, updated_at: new Date().toISOString() })
            .eq('product_id', productId);
          if (rollbackError) {
            throw new Error(`Audit ledger failed (${movementError.message}) and stock rollback failed (${rollbackError.message}).`);
          }
          throw new Error(`Audit stock change was rolled back because ledger logging failed: ${movementError.message}`);
        }
      }

      const { error: logError } = await supabase.from('inventory_logs').insert([{
        product_id: productId,
        change,
        old_quantity: oldStock,
        new_quantity: totalStock,
        type: 'AUDIT',
        movement_type: 'AUDIT',
        reason: 'Physical Stock Audit (Multi-Location)',
        notes: auditNote,
        edited_by: userId || null,
        created_at: auditedAt
      }]);
      if (logError) console.warn('[AuditService] secondary inventory_logs write failed:', logError.message);

      try {
        await StockSyncService.syncStockToAllWebsites(productId, totalStock);
      } catch (syncError) {
        // The physical audit is already saved locally. A downstream store-sync issue must not
        // falsely report the audit itself as failed; the normal sync/retry pipeline can recover it.
        console.warn('[AuditService] audit saved but downstream stock sync failed:', syncError);
      }

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
      .select(`id, name, gtin, sku, brand, category, unit, weight, weight_kg, weight_grams, pack_size, pack_unit, variant_group_key, warehouse_location, is_active, is_published, expiry_date, central_inventory(stock_quantity, last_audited_at)`)
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
      .select(`id, name, gtin, sku, brand, category, unit, weight, weight_kg, weight_grams, pack_size, pack_unit, variant_group_key, warehouse_location, is_active, is_published, expiry_date, central_inventory(stock_quantity, last_audited_at)`)
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

    return {
      id: data.id,
      name: data.name,
      gtin: data.gtin,
      sku: data.sku,
      brand: data.brand,
      category: data.category,
      unit: data.unit ?? null,
      weight: data.weight == null ? null : Number(data.weight),
      weight_kg: data.weight_kg == null ? null : Number(data.weight_kg),
      weight_grams: data.weight_grams == null ? null : Number(data.weight_grams),
      pack_size: data.pack_size == null ? null : Number(data.pack_size),
      pack_unit: data.pack_unit ?? null,
      variant_group_key: data.variant_group_key ?? null,
      warehouse_location: data.warehouse_location,
      is_active: data.is_active,
      is_published: data.is_published,
      expiry_date: data.expiry_date || null,
      current_stock: Number(data.stock || 0),
      last_audited_at: data.last_audited_at || null,
    };
  }
}

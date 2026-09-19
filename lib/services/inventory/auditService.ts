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
  units_per_box: number | null;
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

export interface ExpiryBatch {
  id?: string;
  batch_id: string | null;
  expiry_date: string;
  quantity: number;
  remaining_quantity?: number;
  box_number?: number | null;
  manufacture_date?: string | null;
  packed_date?: string | null;
  carton_no?: string | null;
  label_photo_id?: string | null;
  entry_source?: 'manual' | 'auto_split' | 'photo';
}

export interface LabelExtraction {
  label_type: 'retail_pack' | 'carton' | 'unknown';
  item_name: string | null;
  brand: string | null;
  barcode: string | null;
  batch_code: string | null;
  manufacture_date: string | null;
  packed_date: string | null;
  expiry_date: string | null;
  weight_each_value: number | null;
  weight_each_unit: 'g' | 'kg' | 'ml' | 'l' | null;
  pack_count: number | null;
  carton_no: string | null;
  net_quantity_text: string | null;
  confidence: number;
  notes: string | null;
}

export interface AuditLabelPhotoResult {
  photo_id: string;
  storage_path: string;
  extraction: LabelExtraction | null;
  analysis_error: string | null;
}

export interface VoiceTranscriptionResult {
  transcript: string;
  normalized: string;
  stage: 'quantity' | 'location' | 'pack-size' | 'confirm';
}

export interface FullAuditSession {
  id: string;
  status: 'open' | 'finalized' | 'cancelled';
  started_at: string;
  finalized_at: string | null;
  snapshot_product_count: number;
  counted_product_count: number;
  missing_product_count: number;
}

export interface RecentAuditItem {
  log_id: string;
  product_id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  unit: string | null;
  weight: number | null;
  weight_kg: number | null;
  weight_grams: number | null;
  pack_size: number | null;
  pack_unit: string | null;
  quantity: number;
  warehouse_location: string | null;
  created_at: string;
}

const mapBlindProduct = (product: any): AuditProduct => {
  const inventory = Array.isArray(product.central_inventory) ? product.central_inventory[0] : product.central_inventory;
  return {
    id: product.id,
    name: product.name,
    gtin: product.gtin ?? null,
    sku: product.sku ?? null,
    brand: product.brand ?? null,
    category: product.category ?? null,
    unit: product.unit ?? null,
    weight: product.weight == null ? null : Number(product.weight),
    weight_kg: product.weight_kg == null ? null : Number(product.weight_kg),
    weight_grams: product.weight_grams == null ? null : Number(product.weight_grams),
    pack_size: product.pack_size == null ? null : Number(product.pack_size),
    pack_unit: product.pack_unit ?? null,
    units_per_box: product.units_per_box == null ? null : Number(product.units_per_box),
    variant_group_key: product.variant_group_key ?? null,
    // Blind count mode: do not send current system stock/location/expiry to the audit form.
    warehouse_location: null,
    is_active: product.is_active ?? true,
    is_published: product.is_published ?? false,
    expiry_date: null,
    current_stock: 0,
    last_audited_at: inventory?.last_audited_at ?? product.last_audited_at ?? null,
  };
};

export class AuditService {
  static async getRecentAuditItems(limit = 2): Promise<RecentAuditItem[]> {
    const { data, error } = await supabase
      .from('inventory_logs')
      .select(`
        id,product_id,new_quantity,created_at,audited_locations,
        products(id,name,sku,brand,unit,weight,weight_kg,weight_grams,pack_size,pack_unit,warehouse_location)
      `)
      .eq('type', 'AUDIT')
      .eq('movement_type', 'AUDIT')
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 10)));

    if (error) {
      console.error('[AuditService] Failed to load recent audit items:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      log_id: row.id,
      product_id: row.product_id,
      name: row.products?.name || 'Unknown Product',
      sku: row.products?.sku || null,
      brand: row.products?.brand || null,
      unit: row.products?.unit || null,
      weight: row.products?.weight == null ? null : Number(row.products.weight),
      weight_kg: row.products?.weight_kg == null ? null : Number(row.products.weight_kg),
      weight_grams: row.products?.weight_grams == null ? null : Number(row.products.weight_grams),
      pack_size: row.products?.pack_size == null ? null : Number(row.products.pack_size),
      pack_unit: row.products?.pack_unit || null,
      quantity: Number(row.new_quantity || 0),
      warehouse_location:
        Array.isArray(row.audited_locations) && row.audited_locations.length > 0
          ? row.audited_locations.map((loc: any) => loc?.location_code).filter(Boolean).join(', ')
          : row.products?.warehouse_location || null,
      created_at: row.created_at,
    }));
  }

  static async getOpenFullAuditSession(): Promise<FullAuditSession | null> {
    const { data, error } = await supabase
      .from('inventory_audit_sessions')
      .select('id,status,started_at,finalized_at,snapshot_product_count,counted_product_count,missing_product_count')
      .eq('status', 'open')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('[AuditService] Failed to load full audit session:', error);
      return null;
    }
    return data as FullAuditSession | null;
  }

  static async startFullAudit(notes?: string): Promise<FullAuditSession | null> {
    const { data: sessionId, error } = await supabase.rpc('start_full_inventory_audit', {
      p_notes: notes?.trim() || null,
    });
    if (error || !sessionId) {
      console.error('[AuditService] Failed to start full audit:', error);
      return null;
    }
    return this.getOpenFullAuditSession();
  }

  static async finalizeFullAudit(sessionId: string): Promise<number | null> {
    const { data, error } = await supabase.rpc('finalize_full_inventory_audit', {
      p_session_id: sessionId,
    });
    if (error) {
      console.error('[AuditService] Failed to finalize full audit:', error);
      return null;
    }
    return Number(data || 0);
  }

  static async findProductByGTIN(gtin: string): Promise<AuditProduct | null> {
    const barcode = String(gtin || '').trim();
    if (!barcode) return null;

    const primary = await supabase
      .from('products')
      .select(`id, name, gtin, sku, brand, category, unit, weight, weight_kg, weight_grams, pack_size, pack_unit, units_per_box, variant_group_key, is_active, is_published`)
      .eq('gtin', barcode)
      .maybeSingle();

    if (primary.error) {
      console.error('[AuditService] Error finding product by primary GTIN:', primary.error);
      return null;
    }
    if (primary.data) return mapBlindProduct(primary.data);

    const alias = await supabase
      .from('product_barcodes')
      .select(`
        barcode,
        products!inner(
          id, name, gtin, sku, brand, category, unit, weight, weight_kg, weight_grams,
          pack_size, pack_unit, units_per_box, variant_group_key, is_active, is_published
        )
      `)
      .ilike('barcode', barcode)
      .limit(1)
      .maybeSingle();

    if (alias.error) {
      console.error('[AuditService] Error finding product by barcode alias:', alias.error);
      return null;
    }

    const product = Array.isArray((alias.data as any)?.products)
      ? (alias.data as any).products[0]
      : (alias.data as any)?.products;

    return product ? mapBlindProduct(product) : null;
  }

  static async assignProductBarcode(productId: string, barcode: string): Promise<boolean> {
    const value = String(barcode || '').trim();
    if (!productId || !value) return false;

    const { error } = await supabase.rpc('assign_product_barcode', {
      p_product_id: productId,
      p_barcode: value,
      p_source: 'inventory_audit_manual_match',
    });

    if (error) {
      console.error('[AuditService] Failed to remember scanned barcode:', error);
      return false;
    }
    return true;
  }

  static async getBinLocations(productId: string): Promise<BinLocation[]> {
    const { data, error } = await supabase.from('product_bin_locations').select('*').eq('product_id', productId);
    if (error) return [];
    return data || [];
  }

  static async getSavedExpiryDates(productId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('product_expiry')
      .select('expiry_date')
      .eq('product_id', productId)
      .gt('remaining_quantity', 0)
      .not('expiry_date', 'is', null)
      .order('expiry_date', { ascending: true });

    if (error) {
      console.error('[AuditService] Error loading remembered expiry dates:', error);
      return [];
    }

    return [...new Set((data || []).map((row: any) => String(row.expiry_date || '')).filter(Boolean))];
  }

  static async uploadAndAnalyzeLabelPhoto(productId: string, file: File): Promise<AuditLabelPhotoResult | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('[AuditService] Label photo upload requires an authenticated user.');
      return null;
    }

    const safeName = (file.name || 'label.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${productId}/${user.id}/${Date.now()}-${safeName}`;

    const upload = await supabase.storage
      .from('inventory-audit-labels')
      .upload(storagePath, file, { upsert: false, contentType: file.type || undefined });

    if (upload.error) {
      console.error('[AuditService] Label photo upload failed:', upload.error);
      return null;
    }

    const { data: photo, error: photoError } = await supabase
      .from('inventory_audit_label_photos')
      .insert({
        product_id: productId,
        storage_path: storagePath,
        file_name: file.name || safeName,
        mime_type: file.type || 'image/jpeg',
        status: 'uploaded',
        created_by: user.id,
      })
      .select('id,storage_path')
      .single();

    if (photoError || !photo) {
      console.error('[AuditService] Label photo record failed:', photoError);
      await supabase.storage.from('inventory-audit-labels').remove([storagePath]);
      return null;
    }

    const { data: analysis, error: analysisError } = await supabase.functions.invoke('inventory-label-vision', {
      body: { photo_id: photo.id },
    });

    return {
      photo_id: photo.id,
      storage_path: photo.storage_path,
      extraction: analysis?.success && analysis?.result ? analysis.result as LabelExtraction : null,
      analysis_error: analysisError?.message || (!analysis?.success ? String(analysis?.error || 'Label analysis unavailable') : null),
    };
  }

  static async transcribeVoiceClip(
    blob: Blob,
    stage: 'quantity' | 'location' | 'pack-size' | 'confirm',
  ): Promise<VoiceTranscriptionResult | null> {
    if (!blob || blob.size <= 0) return null;

    const extension = blob.type.includes('ogg') ? 'ogg'
      : blob.type.includes('mp4') || blob.type.includes('m4a') ? 'm4a'
        : 'webm';

    const form = new FormData();
    form.append('audio', blob, `audit-voice-${Date.now()}.${extension}`);
    form.append('stage', stage);

    const { data, error } = await supabase.functions.invoke('inventory-voice-transcribe', {
      body: form,
    });

    if (error || !data?.success) {
      console.error('[AuditService] Voice transcription failed:', error || data?.error);
      return null;
    }

    return {
      transcript: String(data.transcript || '').trim(),
      normalized: String(data.normalized || '').trim(),
      stage,
    };
  }

  static async getExpiryBatches(productId: string): Promise<ExpiryBatch[]> {
    const { data, error } = await supabase
      .from('product_expiry')
      .select('id,batch_id,box_number,expiry_date,manufacture_date,packed_date,carton_no,label_photo_id,quantity,remaining_quantity')
      .eq('product_id', productId)
      .gt('remaining_quantity', 0)
      .order('expiry_date', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[AuditService] Error loading expiry batches:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      batch_id: row.batch_id || null,
      expiry_date: row.expiry_date,
      quantity: Number(row.remaining_quantity ?? row.quantity ?? 0),
      remaining_quantity: Number(row.remaining_quantity ?? row.quantity ?? 0),
      box_number: row.box_number == null ? null : Number(row.box_number),
      manufacture_date: row.manufacture_date || null,
      packed_date: row.packed_date || null,
      carton_no: row.carton_no || null,
      label_photo_id: row.label_photo_id || null,
    }));
  }

  static async updateProductPackSize(
    productId: string,
    value: number,
    unit: 'g' | 'kg' | 'ml' | 'l',
  ): Promise<boolean> {
    if (!Number.isFinite(value) || value <= 0) return false;
    const { error } = await supabase
      .from('products')
      .update({
        pack_size: value,
        pack_unit: unit,
        updated_at: new Date().toISOString(),
      })
      .eq('id', productId);

    if (error) {
      console.error('[AuditService] Failed to update spoken pack size:', error);
      return false;
    }
    return true;
  }

  static async performAudit(params: {
    productId: string;
    totalStock: number;
    bins: { location_code: string; stock_quantity: number }[];
    expiryDate?: string | null;
    expiryBatches?: ExpiryBatch[];
    unitsPerBox?: number | null;
    notes?: string;
    userId?: string;
    gtin?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { productId, totalStock, bins, expiryBatches, unitsPerBox, notes } = params;
    const auditNote = notes?.trim() || `Physical stock audit across ${bins.length} location${bins.length === 1 ? '' : 's'}`;

    try {
      if (!Number.isFinite(totalStock) || totalStock < 0) {
        return { success: false, error: 'Enter a valid physical stock quantity.' };
      }

      const cleanBins = bins.map(bin => ({
        location_code: String(bin.location_code || '').trim(),
        stock_quantity: Math.max(0, Number(bin.stock_quantity) || 0),
      }));

      if (totalStock > 0 && cleanBins.some(bin => bin.stock_quantity > 0 && !bin.location_code)) {
        return { success: false, error: 'Enter Location / Bin for every positive stock quantity.' };
      }

      const binTotal = cleanBins.reduce((sum, bin) => sum + bin.stock_quantity, 0);
      if (binTotal !== totalStock) {
        return {
          success: false,
          error: `Location quantities (${binTotal}) must equal physical stock total (${totalStock}).`,
        };
      }

      let cleanBatches: any[] | null = null;
      if (expiryBatches !== undefined) {
        const rawBatches = expiryBatches
          .map((batch, index) => ({
            batch_id: batch.batch_id?.trim() || null,
            box_number: batch.box_number || index + 1,
            expiry_date: batch.expiry_date,
            manufacture_date: batch.manufacture_date || null,
            packed_date: batch.packed_date || null,
            carton_no: batch.carton_no?.trim() || null,
            label_photo_id: batch.label_photo_id || null,
            quantity: Math.max(0, Number(batch.quantity) || 0),
          }))
          .filter(batch => batch.quantity > 0);

        // Box mode safety: a physical box cannot contain more than its configured capacity.
        // If a single row contains more pieces than the box capacity, split it automatically
        // into multiple physical boxes while preserving its expiry/batch metadata.
        if (unitsPerBox && unitsPerBox > 0) {
          const normalized: any[] = [];
          for (const batch of rawBatches) {
            let remaining = batch.quantity;
            let firstChunk = true;
            while (remaining > 0) {
              const qty = Math.min(unitsPerBox, remaining);
              normalized.push({
                ...batch,
                box_number: normalized.length + 1,
                quantity: qty,
                // One uploaded photo is evidence for the original row; don't duplicate
                // the same attachment across all generated rows.
                label_photo_id: firstChunk ? batch.label_photo_id : null,
              });
              remaining -= qty;
              firstChunk = false;
            }
          }
          cleanBatches = normalized;
        } else {
          cleanBatches = rawBatches;
        }

        const expiryTotal = cleanBatches.reduce((sum, batch) => sum + batch.quantity, 0);
        if (cleanBatches.length > 0 && expiryTotal !== totalStock) {
          return {
            success: false,
            error: `Expiry quantities (${expiryTotal}) must equal physical stock total (${totalStock}).`,
          };
        }
        if (cleanBatches.some(batch => !batch.expiry_date)) {
          return { success: false, error: 'Every expiry row with stock needs an expiry date.' };
        }
      }

      const { error } = await supabase.rpc('save_inventory_audit_atomic', {
        p_product_id: productId,
        p_total_stock: totalStock,
        p_bins: cleanBins,
        p_expiry_boxes: cleanBatches,
        p_units_per_box: unitsPerBox ?? null,
        p_notes: auditNote,
      });

      if (error) {
        console.error('[AuditService] Atomic audit save failed:', error);
        return { success: false, error: error.message || 'Could not save stock audit.' };
      }

      try {
        // Physical stock and sellable stock are deliberately different.
        // Expired / <=20-day stock remains in the warehouse audit but must sync as zero
        // (or only the fresh remainder) to storefronts.
        const { data: expirySummary, error: expirySummaryError } = await supabase
          .from('product_expiry_product_summary')
          .select('sellable_stock')
          .eq('product_id', productId)
          .maybeSingle();

        if (expirySummaryError) {
          console.warn('[AuditService] Could not read sellable stock after audit:', expirySummaryError);
        }

        const sellableStock =
          expirySummary?.sellable_stock == null
            ? totalStock
            : Math.max(0, Number(expirySummary.sellable_stock) || 0);

        await StockSyncService.syncStockToAllWebsites(productId, sellableStock);
      } catch (syncError) {
        // Local physical audit is committed. Downstream sync retries separately.
        console.warn('[AuditService] audit saved but downstream stock sync failed:', syncError);
      }

      return { success: true };
    } catch (error: any) {
      console.error('[AuditService] Audit failed:', error);
      return {
        success: false,
        error: String(error?.message || 'Could not save stock audit.'),
      };
    }
  }

  static async searchProductsByName(query: string): Promise<AuditProduct[]> {
    const pattern = `%${query}%`;
    const { data, error } = await supabase
      .from('products')
      .select(`id, name, gtin, sku, brand, category, unit, weight, weight_kg, weight_grams, pack_size, pack_unit, units_per_box, variant_group_key, is_active, is_published`)
      .eq('is_active', true)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .or(`name.ilike.${pattern},brand.ilike.${pattern},category.ilike.${pattern},gtin.ilike.${pattern},sku.ilike.${pattern}`)
      .limit(25);
    if (error) return [];
    return (data || []).map(mapBlindProduct);
  }

  static async getUnauditedProducts(daysAgo = 30): Promise<AuditProduct[]> {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const { data, error } = await supabase
      .from('products')
      .select(`id, name, gtin, sku, brand, category, unit, weight, weight_kg, weight_grams, pack_size, pack_unit, units_per_box, variant_group_key, is_active, is_published, central_inventory(last_audited_at)`)
      .eq('is_active', true)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .or(`central_inventory.last_audited_at.is.null,central_inventory.last_audited_at.lt.${date.toISOString()}`)
      .limit(100);
    if (error) {
      console.error('[AuditService] Error fetching unaudited products:', error);
      return [];
    }
    return (data || []).map(mapBlindProduct);
  }

  static async quickCreateProduct(
    name: string,
    gtin: string,
  ): Promise<{ product: AuditProduct | null; error?: string }> {
    const cleanName = String(name || '').trim();
    const cleanGtin = String(gtin || '').trim();

    if (!cleanName) {
      return { product: null, error: 'Product name is required.' };
    }

    const { data, error } = await supabase
      .from('products')
      .insert([{
        name: cleanName,
        gtin: cleanGtin || null,
        // Quick-create is an inventory draft, not a storefront approval.
        is_active: false,
        is_published: false,
        approval_status: 'pending',
        created_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) {
      console.error('[AuditService] Quick create failed:', error);
      return {
        product: null,
        error: error.message || 'Could not create the inventory draft product.',
      };
    }

    return {
      product: {
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
        units_per_box: data.units_per_box == null ? null : Number(data.units_per_box),
        variant_group_key: data.variant_group_key ?? null,
        warehouse_location: data.warehouse_location,
        is_active: data.is_active,
        is_published: data.is_published,
        expiry_date: data.expiry_date || null,
        current_stock: Number(data.stock || 0),
        last_audited_at: data.last_audited_at || null,
      },
    };
  }
}

import { supabase } from '../supabase';

export interface PackingMaterial {
  id: string;
  name: string;
  category: 'box' | 'filler' | 'tape' | 'label' | 'other';
  size: string | null;
  supplier_name: string | null;
  purchase_cost_per_unit: number;
  selling_cost_per_unit: number | null;
  opening_stock: number;
  current_stock: number;
  minimum_stock_alert: number;
  unit: string;
  is_active: boolean;
  internal_length: number | null;
  internal_width: number | null;
  internal_height: number | null;
  max_weight: number | null;
  volume_cm3: number | null;
  created_at: string;
  updated_at: string;
  unit_type?: string | null;
  units_per_pack?: number | null;
  usage_capacity?: number | null;
  usage_capacity_unit?: string | null;
  sku?: string;
}

export interface PackingMaterialTransaction {
  id: string;
  material_id: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  reference_type: 'order' | 'purchase_order' | 'manual' | null;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  packaging_materials?: { name: string } | null;
}

export interface PackingPurchaseOrder {
  id: string;
  po_number: string;
  supplier_name: string;
  supplier_id?: string | null;
  status: 'draft' | 'ordered' | 'received' | 'cancelled';
  total_cost: number;
  order_date: string | null;
  expected_delivery_date: string | null;
  received_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

type CanonicalPackagingMaterial = {
  id: string;
  sku: string;
  name: string;
  category: string;
  dimensions: string | null;
  unit_type: string;
  units_per_pack: number;
  latest_pack_cost_net: number | null;
  latest_unit_cost_net: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  usage_capacity: number | null;
  usage_capacity_unit: string | null;
};

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPackingMaterial = (
  row: CanonicalPackagingMaterial,
  openingStock = 0,
  currentStock = 0,
): PackingMaterial => {
  const supportedCategories = new Set(['box', 'filler', 'tape', 'label', 'other']);
  const category = supportedCategories.has(row.category) ? row.category : 'other';
  const unitsPerPack = asNumber(row.units_per_pack, 1);
  const packCost = row.latest_pack_cost_net ?? null;
  const unitCost = row.latest_unit_cost_net ?? (
    packCost == null ? null : packCost / Math.max(unitsPerPack, 1)
  );

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: category as PackingMaterial['category'],
    size: row.dimensions,
    supplier_name: null,
    purchase_cost_per_unit: asNumber(unitCost),
    selling_cost_per_unit: null,
    opening_stock: openingStock,
    current_stock: currentStock,
    minimum_stock_alert: 0,
    unit: row.unit_type || 'unit',
    is_active: Boolean(row.is_active),
    internal_length: null,
    internal_width: null,
    internal_height: null,
    max_weight: null,
    volume_cm3: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    unit_type: row.unit_type,
    units_per_pack: unitsPerPack,
    usage_capacity: row.usage_capacity,
    usage_capacity_unit: row.usage_capacity_unit,
  };
};

const totalsByMaterial = (rows: Array<{ material_id: string; quantity: unknown }>) =>
  rows.reduce<Record<string, number>>((totals, row) => {
    totals[row.material_id] = (totals[row.material_id] || 0) + asNumber(row.quantity);
    return totals;
  }, {});

export class PackingMaterialService {
  static async getAllMaterials(): Promise<PackingMaterial[]> {
    const [{ data, error }, { data: purchases }, { data: consumed }] = await Promise.all([
      supabase
        .from('packaging_materials')
        .select('id,sku,name,category,dimensions,unit_type,units_per_pack,latest_pack_cost_net,latest_unit_cost_net,is_active,created_at,updated_at,usage_capacity,usage_capacity_unit')
        .order('name', { ascending: true }),
      supabase
        .from('packaging_material_purchase_items')
        .select('material_id,units_received'),
      supabase
        .from('order_packing_items')
        .select('material_id,quantity_used'),
    ]);

    if (error) {
      console.error('[PackingService] Error fetching materials:', error);
      return [];
    }

    const purchasedTotals = totalsByMaterial(
      (purchases || []).map((row: any) => ({ material_id: row.material_id, quantity: row.units_received })),
    );
    const consumedTotals = totalsByMaterial(
      (consumed || []).map((row: any) => ({ material_id: row.material_id, quantity: row.quantity_used })),
    );

    return ((data || []) as CanonicalPackagingMaterial[]).map((row) => {
      const openingStock = purchasedTotals[row.id] || 0;
      const currentStock = Math.max(0, openingStock - (consumedTotals[row.id] || 0));
      return toPackingMaterial(row, openingStock, currentStock);
    });
  }

  static async getMaterialById(id: string): Promise<PackingMaterial | null> {
    const { data, error } = await supabase
      .from('packaging_materials')
      .select('id,sku,name,category,dimensions,unit_type,units_per_pack,latest_pack_cost_net,latest_unit_cost_net,is_active,created_at,updated_at,usage_capacity,usage_capacity_unit')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;
    return toPackingMaterial(data as CanonicalPackagingMaterial);
  }

  static async createMaterial(material: Partial<PackingMaterial>): Promise<{ success: boolean; data?: PackingMaterial; error?: string }> {
    const payload = {
      sku: material.sku || `CH-PKG-${Date.now()}`,
      name: material.name || 'Packaging material',
      category: material.category || 'other',
      dimensions: material.size || null,
      unit_type: material.unit || 'unit',
      units_per_pack: material.units_per_pack || 1,
      latest_unit_cost_net: material.purchase_cost_per_unit ?? null,
      is_active: material.is_active ?? true,
    };

    const { data, error } = await supabase
      .from('packaging_materials')
      .insert(payload)
      .select('id,sku,name,category,dimensions,unit_type,units_per_pack,latest_pack_cost_net,latest_unit_cost_net,is_active,created_at,updated_at,usage_capacity,usage_capacity_unit')
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: toPackingMaterial(data as CanonicalPackagingMaterial) };
  }

  static async updateMaterial(id: string, updates: Partial<PackingMaterial>): Promise<{ success: boolean; error?: string }> {
    const payload: Record<string, unknown> = {};
    if (updates.sku !== undefined) payload.sku = updates.sku;
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.size !== undefined) payload.dimensions = updates.size;
    if (updates.unit !== undefined) payload.unit_type = updates.unit;
    if (updates.units_per_pack !== undefined) payload.units_per_pack = updates.units_per_pack;
    if (updates.purchase_cost_per_unit !== undefined) payload.latest_unit_cost_net = updates.purchase_cost_per_unit;
    if (updates.is_active !== undefined) payload.is_active = updates.is_active;

    const { error } = await supabase
      .from('packaging_materials')
      .update(payload)
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  static async adjustStock(): Promise<{ success: boolean; error?: string }> {
    return {
      success: false,
      error: 'Packaging stock is derived from goods received and packing records. Use GRN or packing confirmation to change it.',
    };
  }

  static async getTransactions(materialId?: string, limit = 50): Promise<PackingMaterialTransaction[]> {
    let query = supabase
      .from('order_packing_items')
      .select('id,material_id,quantity_used,created_at,order_packing(order_id)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (materialId) query = query.eq('material_id', materialId);

    const { data, error } = await query;
    if (error || !data) return [];

    const materialIds = [...new Set(data.map((row: any) => row.material_id).filter(Boolean))];
    const [{ data: materials }, { data: packingRows }] = await Promise.all([
      materialIds.length
        ? supabase.from('packaging_materials').select('id,name').in('id', materialIds)
        : Promise.resolve({ data: [] as any[] }),
      Promise.resolve({ data: data }),
    ]);
    const names = new Map((materials || []).map((row: any) => [row.id, row.name]));

    return data.map((row: any) => ({
      id: row.id,
      material_id: row.material_id,
      type: 'OUT',
      quantity: -Math.abs(asNumber(row.quantity_used)),
      reference_type: 'order',
      reference_id: row.order_packing?.order_id || null,
      notes: 'Packing consumption',
      created_by: null,
      created_at: row.created_at,
      packaging_materials: { name: names.get(row.material_id) || 'Packaging material' },
    }));
  }

  static async getPurchaseOrders(): Promise<PackingPurchaseOrder[]> {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('id,po_number,status,total_cost,order_date,expected_delivery_date,actual_delivery_date,notes,created_by,created_at,updated_at,supplier_id')
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    const supplierIds = [...new Set(data.map((row: any) => row.supplier_id).filter(Boolean))];
    const { data: suppliers } = supplierIds.length
      ? await supabase.from('suppliers').select('id,name').in('id', supplierIds)
      : { data: [] as any[] };
    const supplierNames = new Map((suppliers || []).map((row: any) => [row.id, row.name]));

    return data.map((row: any) => ({
      id: row.id,
      po_number: row.po_number,
      supplier_id: row.supplier_id,
      supplier_name: supplierNames.get(row.supplier_id) || 'Supplier',
      status: row.status,
      total_cost: asNumber(row.total_cost),
      order_date: row.order_date,
      expected_delivery_date: row.expected_delivery_date,
      received_date: row.actual_delivery_date,
      notes: row.notes,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  static async createPurchaseOrder(po: Partial<PackingPurchaseOrder>): Promise<{ success: boolean; data?: PackingPurchaseOrder; error?: string }> {
    if (!po.supplier_id) {
      return { success: false, error: 'A supplier is required for a purchase order.' };
    }

    const payload = {
      po_number: po.po_number || `PO-${Date.now()}`,
      supplier_id: po.supplier_id,
      status: po.status || 'draft',
      order_date: po.order_date || new Date().toISOString().slice(0, 10),
      expected_delivery_date: po.expected_delivery_date || null,
      total_cost: po.total_cost || 0,
      currency: 'GBP',
      source_type: 'manual',
      notes: po.notes || null,
      created_by: po.created_by || null,
    };

    const { data, error } = await supabase
      .from('purchase_orders')
      .insert(payload)
      .select('id,po_number,status,total_cost,order_date,expected_delivery_date,actual_delivery_date,notes,created_by,created_at,updated_at,supplier_id')
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: (await this.getPurchaseOrders()).find((row) => row.id === data.id) };
  }

  /**
   * Predict out-of-stock dates for packaging materials based on 30-day consumption.
   */
  static async getUsagePredictions(): Promise<Record<string, { avgDailyUsage: number; daysRemaining: number; predictedRunOutDate: string | null }>> {
    const materials = await this.getAllMaterials();
    const transactions = await this.getTransactions(undefined, 1000);
    const usageByMaterial = transactions.reduce<Record<string, number>>((totals, transaction) => {
      totals[transaction.material_id] = (totals[transaction.material_id] || 0) + Math.abs(transaction.quantity);
      return totals;
    }, {});

    const predictions: Record<string, { avgDailyUsage: number; daysRemaining: number; predictedRunOutDate: string | null }> = {};
    materials.forEach((material) => {
      const avgDailyUsage = (usageByMaterial[material.id] || 0) / 30;
      const daysRemaining = avgDailyUsage > 0
        ? Math.floor(material.current_stock / avgDailyUsage)
        : 999;
      const predictedRunOutDate = avgDailyUsage > 0
        ? new Date(Date.now() + daysRemaining * 86400000).toISOString()
        : null;

      predictions[material.id] = {
        avgDailyUsage: Math.round(avgDailyUsage * 100) / 100,
        daysRemaining,
        predictedRunOutDate,
      };
    });

    return predictions;
  }
}

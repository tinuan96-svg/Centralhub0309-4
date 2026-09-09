import { supabase } from '../supabase';

export interface PackingMaterial {
  id: string;
  sku?: string | null;
  name: string;
  category: 'box' | 'filler' | 'tape' | 'label' | 'other';
  size: string | null;
  supplier_name: string | null;
  purchase_cost_per_unit: number;
  pack_cost_net?: number;
  vat_rate?: number;
  opening_stock: number;
  current_stock: number;
  used_stock: number;
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
}

export interface PackingMaterialTransaction {
  id: string;
  material_id: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  reference_type: 'invoice' | 'order' | 'purchase_order' | 'manual' | null;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
  packing_materials?: { name: string } | null;
}

export interface PackingPurchaseOrder {
  id: string;
  po_number: string;
  supplier_name: string;
  supplier_id?: string | null;
  status: string;
  total_cost: number;
  order_date: string | null;
  expected_delivery_date: string | null;
  received_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const n = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const categoryOf = (value: unknown): PackingMaterial['category'] => {
  const raw = String(value || '').toLowerCase();
  if (raw === 'box' || raw === 'boxes') return 'box';
  if (raw === 'tape') return 'tape';
  if (raw === 'label' || raw === 'labels') return 'label';
  if (raw.includes('fill') || raw.includes('bubble') || raw.includes('protect')) return 'filler';
  return 'other';
};

const parseDimensions = (category: PackingMaterial['category'], value: unknown) => {
  if (category !== 'box') return { length: null, width: null, height: null, volume: null };
  const text = String(value || '');
  const values = [...text.matchAll(/([0-9]+(?:\.[0-9]+)?)/g)].map((m) => Number(m[1]));
  if (values.length < 3) return { length: null, width: null, height: null, volume: null };
  let [a, b, c] = values.slice(0, 3);
  if (/\bmm\b/i.test(text)) [a, b, c] = [a / 10, b / 10, c / 10];
  else if (/\bin(?:ch(?:es)?)?\b/i.test(text)) [a, b, c] = [a * 2.54, b * 2.54, c * 2.54];
  return { length: a, width: b, height: c, volume: a * b * c };
};

export class PackingMaterialService {
  static async getAllMaterials(): Promise<PackingMaterial[]> {
    const [materialsResult, purchasesResult, allocationsResult, creditorsResult] = await Promise.all([
      supabase.from('packaging_materials').select('id,sku,name,category,dimensions,unit_type,units_per_pack,latest_pack_cost_net,latest_unit_cost_net,vat_rate,creditor_id,is_active,created_at,updated_at,unit_weight_kg,usage_capacity,usage_capacity_unit').order('name'),
      supabase.from('packaging_material_purchase_items').select('material_id,units_received'),
      supabase.from('order_packaging_allocations').select('material_id,quantity_used'),
      supabase.from('finance_creditors').select('id,name'),
    ]);

    if (materialsResult.error) throw new Error(`Packaging materials could not be loaded: ${materialsResult.error.message}`);
    if (purchasesResult.error) throw new Error(`Packaging purchases could not be loaded: ${purchasesResult.error.message}`);
    if (allocationsResult.error) throw new Error(`Packaging usage could not be loaded: ${allocationsResult.error.message}`);

    const purchased = new Map<string, number>();
    for (const row of purchasesResult.data || []) purchased.set(row.material_id, (purchased.get(row.material_id) || 0) + n(row.units_received));
    const used = new Map<string, number>();
    for (const row of allocationsResult.data || []) used.set(row.material_id, (used.get(row.material_id) || 0) + n(row.quantity_used));
    const creditors = new Map((creditorsResult.data || []).map((row: any) => [row.id, row.name]));

    return (materialsResult.data || []).map((row: any) => {
      const category = categoryOf(row.category);
      const dims = parseDimensions(category, row.dimensions);
      const openingStock = purchased.get(row.id) || 0;
      const usedStock = used.get(row.id) || 0;
      const unitsPerPack = Math.max(1, n(row.units_per_pack, 1));
      const unitCost = row.latest_unit_cost_net == null
        ? (row.latest_pack_cost_net == null ? 0 : n(row.latest_pack_cost_net) / unitsPerPack)
        : n(row.latest_unit_cost_net);
      return {
        id: row.id,
        sku: row.sku,
        name: row.name,
        category,
        size: row.dimensions,
        supplier_name: row.creditor_id ? creditors.get(row.creditor_id) || null : null,
        purchase_cost_per_unit: unitCost,
        pack_cost_net: row.latest_pack_cost_net == null ? undefined : n(row.latest_pack_cost_net),
        vat_rate: n(row.vat_rate, 20),
        opening_stock: openingStock,
        used_stock: usedStock,
        current_stock: Math.max(0, openingStock - usedStock),
        minimum_stock_alert: 0,
        unit: row.unit_type || 'unit',
        is_active: row.is_active !== false,
        internal_length: dims.length,
        internal_width: dims.width,
        internal_height: dims.height,
        max_weight: null,
        volume_cm3: dims.volume,
        created_at: row.created_at,
        updated_at: row.updated_at,
        unit_type: row.unit_type,
        units_per_pack: unitsPerPack,
        usage_capacity: row.usage_capacity == null ? null : n(row.usage_capacity),
        usage_capacity_unit: row.usage_capacity_unit,
      } as PackingMaterial;
    });
  }

  static async getMaterialById(id: string): Promise<PackingMaterial | null> {
    const rows = await this.getAllMaterials();
    return rows.find((row) => row.id === id) || null;
  }

  static async createMaterial(material: Partial<PackingMaterial>): Promise<{ success: boolean; data?: PackingMaterial; error?: string }> {
    const name = String(material.name || '').trim();
    if (!name) return { success: false, error: 'Material name is required.' };
    const payload = {
      sku: String(material.sku || '').trim() || `CH-PKG-${Date.now()}`,
      name,
      category: material.category || 'other',
      dimensions: material.size || null,
      unit_type: material.unit || 'unit',
      units_per_pack: Math.max(1, n(material.units_per_pack, 1)),
      latest_pack_cost_net: material.pack_cost_net ?? null,
      latest_unit_cost_net: n(material.purchase_cost_per_unit),
      vat_rate: material.vat_rate ?? 20,
      is_active: material.is_active ?? true,
    };
    const { data, error } = await supabase.from('packaging_materials').insert(payload).select('id').single();
    if (error) return { success: false, error: error.message };
    const created = await this.getMaterialById(data.id);
    return created ? { success: true, data: created } : { success: false, error: 'Material saved but could not be reloaded.' };
  }

  static async updateMaterial(id: string, updates: Partial<PackingMaterial>): Promise<{ success: boolean; error?: string }> {
    const payload: Record<string, unknown> = {};
    if (updates.sku !== undefined) payload.sku = updates.sku;
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.size !== undefined) payload.dimensions = updates.size;
    if (updates.unit !== undefined) payload.unit_type = updates.unit;
    if (updates.units_per_pack !== undefined) payload.units_per_pack = updates.units_per_pack;
    if (updates.pack_cost_net !== undefined) payload.latest_pack_cost_net = updates.pack_cost_net;
    if (updates.purchase_cost_per_unit !== undefined) payload.latest_unit_cost_net = updates.purchase_cost_per_unit;
    if (updates.vat_rate !== undefined) payload.vat_rate = updates.vat_rate;
    if (updates.is_active !== undefined) payload.is_active = updates.is_active;
    const { error } = await supabase.from('packaging_materials').update(payload).eq('id', id);
    return error ? { success: false, error: error.message } : { success: true };
  }

  static async adjustStock(): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Packaging stock is derived from received supplier purchases minus order packaging allocations.' };
  }

  static async getTransactions(materialId?: string, limit = 200): Promise<PackingMaterialTransaction[]> {
    let purchaseQuery = supabase.from('packaging_material_purchase_items').select('id,material_id,units_received,finance_document_id,order_reference,purchase_date,created_at');
    let usageQuery = supabase.from('order_packaging_allocations').select('id,material_id,quantity_used,order_id,allocation_basis,is_estimated,created_at');
    if (materialId) {
      purchaseQuery = purchaseQuery.eq('material_id', materialId);
      usageQuery = usageQuery.eq('material_id', materialId);
    }
    const [purchaseResult, usageResult, materialResult] = await Promise.all([
      purchaseQuery,
      usageQuery,
      supabase.from('packaging_materials').select('id,name'),
    ]);
    if (purchaseResult.error) throw new Error(`Packaging purchase activity could not be loaded: ${purchaseResult.error.message}`);
    if (usageResult.error) throw new Error(`Packaging usage activity could not be loaded: ${usageResult.error.message}`);
    if (materialResult.error) throw new Error(`Packaging material names could not be loaded: ${materialResult.error.message}`);
    const names = new Map((materialResult.data || []).map((row: any) => [row.id, row.name]));
    const rows: PackingMaterialTransaction[] = [
      ...(purchaseResult.data || []).map((row: any) => ({
        id: `in-${row.id}`,
        material_id: row.material_id,
        type: 'IN' as const,
        quantity: n(row.units_received),
        reference_type: 'invoice' as const,
        reference_id: row.finance_document_id || null,
        notes: row.order_reference ? `Supplier reference ${row.order_reference}` : 'Supplier packaging purchase',
        created_at: row.purchase_date ? `${row.purchase_date}T12:00:00Z` : row.created_at,
        packing_materials: { name: names.get(row.material_id) || 'Packaging material' },
      })),
      ...(usageResult.data || []).map((row: any) => ({
        id: `out-${row.id}`,
        material_id: row.material_id,
        type: 'OUT' as const,
        quantity: -Math.abs(n(row.quantity_used)),
        reference_type: 'order' as const,
        reference_id: row.order_id || null,
        notes: `${row.allocation_basis || 'order packaging'}${row.is_estimated ? ' · estimated' : ''}`,
        created_at: row.created_at,
        packing_materials: { name: names.get(row.material_id) || 'Packaging material' },
      })),
    ];
    return rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, limit);
  }

  static async getPurchaseOrders(): Promise<PackingPurchaseOrder[]> {
    const [poResult, supplierResult] = await Promise.all([
      supabase.from('purchase_orders').select('id,po_number,status,total_cost,order_date,expected_delivery_date,actual_delivery_date,notes,created_by,created_at,updated_at,supplier_id').order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id,name'),
    ]);
    if (poResult.error) throw new Error(`Material purchase orders could not be loaded: ${poResult.error.message}`);
    const suppliers = new Map((supplierResult.data || []).map((row: any) => [row.id, row.name]));
    return (poResult.data || []).map((row: any) => ({
      id: row.id,
      po_number: row.po_number,
      supplier_id: row.supplier_id,
      supplier_name: suppliers.get(row.supplier_id) || 'Supplier',
      status: row.status,
      total_cost: n(row.total_cost),
      order_date: row.order_date,
      expected_delivery_date: row.expected_delivery_date,
      received_date: row.actual_delivery_date,
      notes: row.notes,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  static async getUsagePredictions(): Promise<Record<string, { avgDailyUsage: number; daysRemaining: number; predictedRunOutDate: string | null }>> {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [materials, usageResult] = await Promise.all([
      this.getAllMaterials(),
      supabase.from('order_packaging_allocations').select('material_id,quantity_used,created_at').gte('created_at', since),
    ]);
    if (usageResult.error) throw new Error(`Packaging usage prediction could not be loaded: ${usageResult.error.message}`);
    const usage = new Map<string, number>();
    for (const row of usageResult.data || []) usage.set(row.material_id, (usage.get(row.material_id) || 0) + Math.abs(n(row.quantity_used)));
    const result: Record<string, { avgDailyUsage: number; daysRemaining: number; predictedRunOutDate: string | null }> = {};
    for (const material of materials) {
      const avgDailyUsage = (usage.get(material.id) || 0) / 30;
      const daysRemaining = avgDailyUsage > 0 ? Math.max(0, Math.floor(material.current_stock / avgDailyUsage)) : 999;
      result[material.id] = {
        avgDailyUsage: Math.round(avgDailyUsage * 100) / 100,
        daysRemaining,
        predictedRunOutDate: avgDailyUsage > 0 ? new Date(Date.now() + daysRemaining * 86400000).toISOString() : null,
      };
    }
    return result;
  }
}

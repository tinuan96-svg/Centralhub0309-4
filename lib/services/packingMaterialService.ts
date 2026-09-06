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
}

export interface PackingPurchaseOrder {
  id: string;
  po_number: string;
  supplier_name: string;
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

export class PackingMaterialService {
  static async getAllMaterials(): Promise<PackingMaterial[]> {
    const { data, error } = await supabase
      .from('packing_materials')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('[PackingService] Error fetching materials:', error);
      return [];
    }
    return data || [];
  }

  static async getMaterialById(id: string): Promise<PackingMaterial | null> {
    const { data, error } = await supabase
      .from('packing_materials')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return null;
    return data;
  }

  static async createMaterial(material: Partial<PackingMaterial>): Promise<{ success: boolean; data?: PackingMaterial; error?: string }> {
    const { data, error } = await supabase
      .from('packing_materials')
      .insert([material])
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  static async updateMaterial(id: string, updates: Partial<PackingMaterial>): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
      .from('packing_materials')
      .update(updates)
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  static async adjustStock(params: {
    materialId: string;
    quantity: number;
    type: 'IN' | 'OUT' | 'ADJUSTMENT';
    notes?: string;
    referenceType?: 'order' | 'purchase_order' | 'manual';
    referenceId?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('packing_material_transactions')
      .insert([{
        material_id: params.materialId,
        quantity: params.quantity,
        type: params.type,
        notes: params.notes || 'Manual adjustment',
        reference_type: params.referenceType || 'manual',
        reference_id: params.referenceId,
        created_by: user?.id
      }]);

    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  static async getTransactions(materialId?: string, limit = 50): Promise<any[]> {
    let query = supabase
      .from('packing_material_transactions')
      .select('*, packing_materials(name)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (materialId) query = query.eq('material_id', materialId);

    const { data, error } = await query;
    if (error) return [];
    return data || [];
  }

  static async getPurchaseOrders(): Promise<PackingPurchaseOrder[]> {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return [];
    return data || [];
  }

  static async createPurchaseOrder(po: Partial<PackingPurchaseOrder>): Promise<{ success: boolean; data?: PackingPurchaseOrder; error?: string }> {
    // Generate PO number if not provided
    if (!po.po_number) {
        const { data: poNum } = await supabase.rpc('generate_po_number');
        po.po_number = poNum || `PO-${Date.now()}`;
    }

    const { data: { user } } = await supabase.auth.getUser();
    po.created_by = user?.id;

    const { data, error } = await supabase
      .from('purchase_orders')
      .insert([po])
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  /**
   * Predict out-of-stock dates for packing materials based on 30-day consumption
   */
  static async getUsagePredictions(): Promise<Record<string, { avgDailyUsage: number; daysRemaining: number; predictedRunOutDate: string | null }>> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: transactions } = await supabase
      .from('packing_material_transactions')
      .select('material_id, quantity, created_at')
      .eq('type', 'OUT')
      .gte('created_at', thirtyDaysAgo.toISOString());

    const { data: materials } = await supabase
      .from('packing_materials')
      .select('id, current_stock');

    const predictions: Record<string, any> = {};

    materials?.forEach(m => {
      const usage = transactions?.filter(t => t.material_id === m.id) || [];
      const totalUsed = Math.abs(usage.reduce((sum, t) => sum + t.quantity, 0));
      const avgDailyUsage = totalUsed / 30;

      let daysRemaining = Infinity;
      let predictedRunOutDate = null;

      if (avgDailyUsage > 0) {
        daysRemaining = Math.floor(m.current_stock / avgDailyUsage);
        const runOut = new Date();
        runOut.setDate(runOut.getDate() + daysRemaining);
        predictedRunOutDate = runOut.toISOString();
      }

      predictions[m.id] = {
        avgDailyUsage: Math.round(avgDailyUsage * 100) / 100,
        daysRemaining: daysRemaining === Infinity ? 999 : daysRemaining,
        predictedRunOutDate
      };
    });

    return predictions;
  }
}

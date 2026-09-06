import { supabase } from '@/lib/supabase';
import { procurementService, ProcurementRecommendation } from './procurementService';

export interface UnfulfilledOrderItem {
  product_id: string;
  product_name: string;
  order_id: string;
  order_number: string;
  quantity: number;
}

export interface ProductWithPackInfo {
  id: string;
  name: string;
  stock: number;
  pack_size: number;
  pack_unit: string | null;
  cost_price: number | null;
  reorder_frequency: string;
  low_stock_threshold: number;
  supplier_id: string | null;
}

export interface SupplierInfo {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  purchase_days?: string[];
}

export interface BackorderPlanItem {
  product_id: string;
  product_name: string;
  sku: string;
  supplier_id: string;
  supplier_name: string;
  units_needed: number;
  pack_size: number;
  pack_unit: string | null;
  packs_to_order: number;
  surplus_units: number;
  cost_per_pack: number;
  total_cost: number;
  triggered_by_orders: string[];
  current_stock: number;
  reorder_frequency: string;
  daily_burn_rate?: number;
  days_until_stockout?: number;

  // New Procurement Engine Fields
  backorder_debt?: number;
  on_po_quantity?: number;
  lead_time_demand?: number;
  safety_stock?: number;
  forward_coverage_demand?: number;
  reasoning?: string;
  priority_score?: number;
  status_label?: string;
}

export interface BackorderPlanSummary {
  total_estimated_spend: number;
  total_products: number;
  total_packs: number;
  surplus_units: number;
  items: BackorderPlanItem[];
  items_by_supplier: { supplier: SupplierInfo; items: BackorderPlanItem[]; supplier_total: number }[];
  missing_supplier_items: BackorderPlanItem[];
}

export interface SavedBackorderPlan {
  id: string;
  plan_date: string;
  total_estimated_spend: number;
  total_products: number;
  total_packs: number;
  surplus_units: number;
  status: string;
  created_at: string;
}

class BackorderService {
  async getUnfulfilledOrderItems(): Promise<UnfulfilledOrderItem[]> {
    const { data: orders, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number')
      .eq('payment_status', 'paid')
      .in('order_status', ['confirmed', 'picking', 'packing', 'ready_to_ship', 'pending']);

    if (orderError) { console.error('getUnfulfilledOrderItems order error:', orderError); return []; }
    if (!orders || orders.length === 0) return [];

    const orderIds = orders.map((o: any) => o.id);
    const orderNumberMap = new Map(orders.map((o: any) => [o.id, o.order_number || o.id]));

    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('order_id, product_id, product_name, quantity')
      .in('order_id', orderIds);

    if (itemsError) { console.error('getUnfulfilledOrderItems items error:', itemsError); return []; }
    if (!items || items.length === 0) return [];

    return items.map((item: any) => ({
      product_id: item.product_id,
      product_name: item.product_name || 'Unknown Product',
      order_id: item.order_id,
      order_number: orderNumberMap.get(item.order_id) || item.order_id,
      quantity: item.quantity || 0,
    }));
  }

  async generatePlan(storeId?: string | null): Promise<BackorderPlanSummary> {
    const procurementPlan = await procurementService.calculateProcurementPlan(storeId);

    // Map ProcurementRecommendation to BackorderPlanItem
    const planItems: BackorderPlanItem[] = procurementPlan.items.map(rec => ({
      product_id: rec.product_id,
      product_name: rec.product_name,
      sku: rec.sku,
      supplier_id: rec.supplier_id,
      supplier_name: rec.supplier_name,
      units_needed: rec.required_units,
      pack_size: rec.pack_size,
      pack_unit: null, // No longer tracked specifically here
      packs_to_order: rec.recommended_purchase / rec.pack_size,
      surplus_units: rec.recommended_purchase - rec.required_units,
      cost_per_pack: rec.unit_cost * rec.pack_size,
      total_cost: rec.total_cost,
      triggered_by_orders: rec.triggered_by_orders,
      current_stock: rec.stock_quantity,
      reorder_frequency: 'regular', // Placeholder
      daily_burn_rate: rec.daily_sales_velocity,
      days_until_stockout: rec.daily_sales_velocity > 0 ? (rec.available_stock / rec.daily_sales_velocity) : 999,

      // Evidence
      backorder_debt: rec.backorder_debt,
      on_po_quantity: rec.on_po_quantity,
      lead_time_demand: rec.lead_time_demand,
      safety_stock: rec.safety_stock,
      forward_coverage_demand: rec.forward_coverage_demand,
      reasoning: rec.reasoning,
      priority_score: rec.priority_score,
      status_label: rec.status_label
    }));

    const itemsBySupplierMap = new Map<string, { supplier: SupplierInfo; items: BackorderPlanItem[]; supplier_total: number }>();
    const missingSupplierItems: BackorderPlanItem[] = [];

    // Get unique suppliers from items
    const supplierIds = Array.from(new Set(planItems.filter(i => i.supplier_id).map(i => i.supplier_id)));
    const { data: supplierDetails } = await supabase.from('suppliers').select('*').in('id', supplierIds);
    const supplierMap = new Map(supplierDetails?.map(s => [s.id, s]) || []);

    planItems.forEach(item => {
      if (!item.supplier_id || !supplierMap.has(item.supplier_id)) {
        missingSupplierItems.push(item);
        return;
      }

      const existing = itemsBySupplierMap.get(item.supplier_id);
      if (existing) {
        existing.items.push(item);
        existing.supplier_total += item.total_cost;
      } else {
        const s = supplierMap.get(item.supplier_id)!;
        itemsBySupplierMap.set(item.supplier_id, {
          supplier: {
            id: s.id,
            name: s.name,
            contact_email: s.contact_email,
            contact_phone: s.contact_phone,
            purchase_days: s.purchase_days
          },
          items: [item],
          supplier_total: item.total_cost
        });
      }
    });

    const itemsBySupplier = Array.from(itemsBySupplierMap.values())
      .sort((a, b) => a.supplier.name.localeCompare(b.supplier.name));

    return {
      total_estimated_spend: procurementPlan.total_spend,
      total_products: procurementPlan.total_products,
      total_packs: planItems.reduce((sum, i) => sum + i.packs_to_order, 0),
      surplus_units: planItems.reduce((sum, i) => sum + i.surplus_units, 0),
      items: planItems,
      items_by_supplier: itemsBySupplier,
      missing_supplier_items: missingSupplierItems
    };
  }

  async savePlan(plan: BackorderPlanSummary): Promise<string | null> {
    const { data: planRow, error: planError } = await supabase
      .from('backorder_plans')
      .insert({
        plan_date: new Date().toISOString().split('T')[0],
        total_estimated_spend: plan.total_estimated_spend,
        total_products: plan.total_products,
        total_packs: plan.total_packs,
        surplus_units: plan.surplus_units,
        status: 'open',
      })
      .select()
      .maybeSingle();

    if (planError || !planRow) { console.error('savePlan error:', planError); return null; }

    const planId = planRow.id;
    const itemsToInsert = plan.items.map(item => ({
      plan_id: planId,
      product_id: item.product_id,
      supplier_id: item.supplier_id || null,
      supplier_name: item.supplier_name,
      product_name: item.product_name,
      units_needed: item.units_needed,
      pack_size: item.pack_size,
      packs_to_order: item.packs_to_order,
      surplus_units: item.surplus_units,
      cost_per_pack: item.cost_per_pack,
      total_cost: item.total_cost,
      triggered_by_orders: item.triggered_by_orders,

      // Evidence columns added in migration
      backorder_debt: item.backorder_debt || 0,
      on_po_quantity: item.on_po_quantity || 0,
      lead_time_demand: item.lead_time_demand || 0,
      safety_stock: item.safety_stock || 0,
      forward_coverage_demand: item.forward_coverage_demand || 0,
      reasoning: item.reasoning,
      priority_score: item.priority_score || 0,
      status_label: item.status_label
    }));

    if (itemsToInsert.length > 0) {
      const { error: itemsError } = await supabase
        .from('backorder_plan_items')
        .insert(itemsToInsert);

      if (itemsError) {
        console.error('savePlan items error:', itemsError);
        // Transactional-ish: if items fail, try to delete the header to avoid ghost plans
        await supabase.from('backorder_plans').delete().eq('id', planId);
        return null;
      }
    }

    return planId;
  }

  async getSavedPlans(): Promise<SavedBackorderPlan[]> {
    const { data, error } = await supabase
      .from('backorder_plans')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) { console.error('getSavedPlans error:', error); return []; }
    return data || [];
  }

  async updatePlanStatus(planId: string, status: string): Promise<boolean> {
    const { error } = await supabase
      .from('backorder_plans')
      .update({ status })
      .eq('id', planId);

    if (error) { console.error('updatePlanStatus error:', error); return false; }
    return true;
  }

  async getAllBackorderItems(): Promise<any[]> {
    const { data, error } = await supabase
      .from('backorder_items')
      .select('*, products(name, sku, image_url), orders(order_number, customer_name, store_id)')
      .order('created_at', { ascending: false });

    if (error) { console.error('getAllBackorderItems error:', error); return []; }
    return data || [];
  }

  async createPODraft(supplierId: string, supplierName: string, items: BackorderPlanItem[], storeId: string | null = null): Promise<string | null> {
    if (!supplierId) {
      console.error('createPODraft: No supplier ID provided');
      return null;
    }

    const draftItems = items.map(item => ({
      product_id: item.product_id,
      product_name: item.product_name,
      sku: item.sku,
      packs: item.packs_to_order,
      pack_size: item.pack_size,
      units_total: item.packs_to_order * item.pack_size,
      cost_per_pack: item.cost_per_pack,
      total_cost: item.total_cost,
      triggered_by_orders: item.triggered_by_orders,

      // Explanation metadata for Requirement 10 & 19
      evidence: {
        backorder_debt: item.backorder_debt,
        available_stock: item.current_stock,
        on_po: item.on_po_quantity,
        forecast: item.forward_coverage_demand,
        safety_stock: item.safety_stock,
        reasoning: item.reasoning
      }
    }));

    const totalAmount = items.reduce((sum, i) => sum + i.total_cost, 0);
    const allOrderNumbers = Array.from(new Set(items.flatMap(i => i.triggered_by_orders)));

    const insertPayload: any = {
      supplier_id: supplierId,
      draft_items: draftItems,
      recommended_items: draftItems, // Mirror for now as staged layer
      total_amount: totalAmount,
      trigger_reason: `Backorder plan - Orders: ${allOrderNumbers.join(', ')}`,
      status: 'draft',
    };

    if (storeId) {
      insertPayload.store_id = storeId;
    }

    const { data, error } = await supabase
      .from('po_drafts')
      .insert(insertPayload)
      .select()
      .maybeSingle();

    if (error) {
      console.error('createPODraft error details:', error);
      return null;
    }
    return data?.id || null;
  }
}

export const backorderService = new BackorderService();

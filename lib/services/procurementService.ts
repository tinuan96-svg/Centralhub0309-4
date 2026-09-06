import { supabase } from '@/lib/supabase';

export interface ProcurementRecommendation {
  product_id: string;
  product_name: string;
  sku: string;

  // Stock levels
  stock_quantity: number;
  reserved_quantity: number;
  available_stock: number;

  // Demand factors
  backorder_debt: number;
  daily_sales_velocity: number;
  lead_time_days: number;
  lead_time_demand: number;
  safety_stock: number;
  forward_coverage_days: number;
  forward_coverage_demand: number;

  // Supply factors
  supplier_id: string;
  supplier_name: string;
  moq: number;
  pack_size: number;
  unit_cost: number;

  // Existing incoming
  on_po_quantity: number;

  // Calculations
  target_stock: number;
  required_units: number;
  recommended_purchase: number;
  total_cost: number;

  // Metadata
  priority_score: number;
  status_label: 'Buy Now - Backorder' | 'Buy Now - Stockout Risk' | 'Replenish Soon' | 'Covered by PO' | 'No Purchase Required' | 'Supplier Missing';
  reasoning: string;
  triggered_by_orders: string[];
}

export interface ProcurementPlanSummary {
  items: ProcurementRecommendation[];
  total_spend: number;
  total_products: number;
  timestamp: string;
}

class ProcurementService {
  /**
   * Generates a comprehensive procurement plan based on inventory, sales velocity, and supplier constraints.
   */
  async calculateProcurementPlan(storeId?: string | null): Promise<ProcurementPlanSummary> {
    // 1. Fetch data
    let productsQuery = supabase.from('products').select('id, name, sku, sales_velocity_30d, reorder_frequency, low_stock_threshold, pack_size, pack_unit, cost_price');
    let poDraftsQuery = supabase.from('po_drafts').select('id, draft_items, store_id').eq('status', 'draft');
    let invoicesQuery = supabase.from('supplier_invoices').select('id, status, store_id').in('status', ['draft', 'received', 'approved']);

    if (storeId) {
        poDraftsQuery = poDraftsQuery.eq('store_id', storeId);
        invoicesQuery = invoicesQuery.eq('store_id', storeId);
    }

    const [
      { data: inventory },
      { data: products },
      { data: productSuppliers },
      { data: poDrafts },
      { data: invoices },
      unfulfilledOrders
    ] = await Promise.all([
      supabase.from('central_inventory').select('*'),
      productsQuery,
      supabase.from('product_suppliers').select('*, suppliers(*)').eq('is_active', true),
      poDraftsQuery,
      invoicesQuery,
      this.getUnfulfilledOrderTriggers(storeId)
    ]);

    if (!inventory || !products) {
      return { items: [], total_spend: 0, total_products: 0, timestamp: new Date().toISOString() };
    }

    // 2. Map data for quick lookup
    const invMap = new Map(inventory.map(i => [i.product_id, i]));

    // Group suppliers by product_id
    const suppliersByProduct = new Map<string, any[]>();
    productSuppliers?.forEach(s => {
      const list = suppliersByProduct.get(s.product_id) || [];
      list.push(s);
      suppliersByProduct.set(s.product_id, list);
    });

    const triggerMap = unfulfilledOrders; // product_id -> order_numbers[]

    // Calculate "On PO" quantity from drafts and invoices
    const onPoMap = await this.calculateOnPoQuantities(storeId);

    const recommendations: ProcurementRecommendation[] = [];

    for (const product of products) {
      const inv = invMap.get(product.id);

      // REQUIREMENT 6: Supplier Selection Priority
      const suppliers = suppliersByProduct.get(product.id) || [];
      const preferredSupplier = suppliers.find(s => s.is_preferred && s.suppliers?.is_active);
      const supplierInfo = preferredSupplier || suppliers.find(s => s.suppliers?.is_active);

      const stock = inv?.stock_quantity ?? 0;
      const reserved = inv?.reserved_quantity ?? 0;
      const available = stock - reserved;

      // Calculate Backorder Debt
      const backorderDebt = Math.max(0, -available);

      // Calculate Lead Time Demand
      const dailyVelocity = Number(product.sales_velocity_30d || 0);
      const leadTime = supplierInfo?.lead_time_days ?? 7;
      const leadTimeDemand = dailyVelocity * leadTime;

      // Calculate Safety Stock
      const safetyStock = Math.max(product.low_stock_threshold || 0, dailyVelocity * 3);

      // Target Coverage (14 days)
      const forwardCoverageDays = 14;
      const forwardCoverageDemand = dailyVelocity * forwardCoverageDays;

      // Total Target Stock
      const targetStock = leadTimeDemand + safetyStock + forwardCoverageDemand;

      // Existing Incoming
      const onPo = onPoMap.get(product.id) || 0;

      // Required Units
      let requiredUnits = Math.max(backorderDebt, targetStock - available) - onPo;
      requiredUnits = Math.max(0, requiredUnits);

      if (backorderDebt > onPo + available) {
          requiredUnits = Math.max(requiredUnits, backorderDebt - (onPo + Math.max(0, available)));
      }

      // Supplier Constraints
      const moq = supplierInfo?.minimum_order_qty ?? 1;
      const packSize = supplierInfo?.pack_size ?? product.pack_size ?? 1;
      const unitCost = supplierInfo?.cost_price ?? product.cost_price ?? 0;

      let recommendedPurchase = 0;
      if (requiredUnits > 0) {
        recommendedPurchase = Math.max(requiredUnits, moq);
        recommendedPurchase = Math.ceil(recommendedPurchase / packSize) * packSize;
      }

      // Determine Status and Priority
      let status: ProcurementRecommendation['status_label'] = 'No Purchase Required';
      let priority = 0;

      if (!supplierInfo) {
          if (requiredUnits > 0) status = 'Supplier Missing';
      } else if (backorderDebt > 0 && recommendedPurchase > 0) {
          status = 'Buy Now - Backorder';
          priority = 100 + backorderDebt;
      } else if (available <= safetyStock && recommendedPurchase > 0) {
          status = 'Buy Now - Stockout Risk';
          priority = 80 + (safetyStock - available);
      } else if (recommendedPurchase > 0) {
          status = 'Replenish Soon';
          priority = 50;
      } else if (onPo > 0 && (backorderDebt > 0 || available <= safetyStock)) {
          status = 'Covered by PO';
          priority = 20;
      }

      // REQUIREMENT 19: Procurement Explanation
      const reasoningParts = [];
      if (backorderDebt > 0) reasoningParts.push(`${backorderDebt} units are on customer backorder.`);
      reasoningParts.push(`${available} units are currently available after reservations.`);
      if (forwardCoverageDemand > 0) reasoningParts.push(`14-day forecast requires ${forwardCoverageDemand.toFixed(1)} additional units.`);
      if (onPo > 0) reasoningParts.push(`${onPo} units are already incoming.`);
      if (safetyStock > 0) reasoningParts.push(`Safety stock target is ${safetyStock.toFixed(1)}.`);

      const supplierName = supplierInfo?.suppliers?.name || 'No Preferred Supplier';
      const purchaseDay = this.calculateNextPurchaseDay(supplierInfo?.suppliers?.purchase_days);

      if (recommendedPurchase > 0) {
          reasoningParts.push(`Recommended purchase: ${recommendedPurchase} units (${recommendedPurchase/packSize} packs of ${packSize}).`);
          reasoningParts.push(`Supplier: ${supplierName}.`);
          if (purchaseDay) reasoningParts.push(`Next purchase day: ${purchaseDay}.`);
      }

      const rec: ProcurementRecommendation = {
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        stock_quantity: stock,
        reserved_quantity: reserved,
        available_stock: available,
        backorder_debt: backorderDebt,
        daily_sales_velocity: dailyVelocity,
        lead_time_days: leadTime,
        lead_time_demand: leadTimeDemand,
        safety_stock: safetyStock,
        forward_coverage_days: forwardCoverageDays,
        forward_coverage_demand: forwardCoverageDemand,
        supplier_id: supplierInfo?.supplier_id || '',
        supplier_name: supplierName,
        moq,
        pack_size: packSize,
        unit_cost: unitCost,
        on_po_quantity: onPo,
        target_stock: targetStock,
        required_units: requiredUnits,
        recommended_purchase: recommendedPurchase,
        total_cost: recommendedPurchase * unitCost,
        priority_score: priority,
        status_label: status,
        reasoning: reasoningParts.join(' '),
        triggered_by_orders: triggerMap.get(product.id) || []
      };

      if (rec.recommended_purchase > 0 || rec.on_po_quantity > 0 || rec.backorder_debt > 0 || rec.available_stock < rec.safety_stock) {
        recommendations.push(rec);
      }
    }

    // Sort by priority and name
    recommendations.sort((a, b) => b.priority_score - a.priority_score || a.product_name.localeCompare(b.product_name));

    return {
      items: recommendations,
      total_spend: recommendations.reduce((sum, item) => sum + item.total_cost, 0),
      total_products: recommendations.length,
      timestamp: new Date().toISOString()
    };
  }

  private calculateNextPurchaseDay(purchaseDays?: string[]): string {
    if (!purchaseDays || purchaseDays.length === 0) return 'Not configured';

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = new Date();
    const currentDayIdx = now.getDay();

    // Convert configured days to indices
    const targetIndices = purchaseDays.map(d => days.indexOf(d)).filter(idx => idx !== -1).sort((a, b) => a - b);

    if (targetIndices.length === 0) return 'Not configured';

    // Find next day in cycle
    let nextIdx = targetIndices.find(idx => idx >= currentDayIdx);
    if (nextIdx === undefined) nextIdx = targetIndices[0]; // Wrap around to next week

    return days[nextIdx];
  }

  private async getUnfulfilledOrderTriggers(storeId?: string | null): Promise<Map<string, string[]>> {
    let query = supabase
      .from('order_items')
      .select('product_id, orders!inner(order_number, store_id)')
      .eq('orders.payment_status', 'paid')
      .in('orders.order_status', ['confirmed', 'picking', 'packing', 'ready_to_ship', 'pending']);

    if (storeId) {
        query = query.eq('orders.store_id', storeId);
    }

    const { data: items, error } = await query;
    const triggerMap = new Map<string, string[]>();
    if (error || !items) return triggerMap;

    items.forEach((item: any) => {
      if (!item.product_id) return;
      const list = triggerMap.get(item.product_id) || [];
      const orderNum = item.orders?.order_number;
      if (orderNum && !list.includes(orderNum)) {
        list.push(orderNum);
      }
      triggerMap.set(item.product_id, list);
    });

    return triggerMap;
  }

  private async calculateOnPoQuantities(storeId?: string | null): Promise<Map<string, number>> {
    const onPoMap = new Map<string, number>();

    // 1. From PO Drafts
    let draftsQuery = supabase
      .from('po_drafts')
      .select('draft_items, store_id')
      .eq('status', 'draft');

    if (storeId) draftsQuery = draftsQuery.eq('store_id', storeId);

    const { data: drafts } = await draftsQuery;

    drafts?.forEach((draft: any) => {
      const items = Array.isArray(draft.draft_items) ? draft.draft_items : [];
      items.forEach((item: any) => {
        if (!item.product_id) return;
        const qty = Number(item.units_total || (item.packs * item.pack_size) || 0);
        onPoMap.set(item.product_id, (onPoMap.get(item.product_id) || 0) + qty);
      });
    });

    // 2. From Invoices (Incoming stock)
    let invItemsQuery = supabase
      .from('supplier_invoice_items')
      .select('product_id, quantity, received_quantity, supplier_invoices!inner(status, store_id)')
      .in('supplier_invoices.status', ['received', 'approved', 'draft']);

    if (storeId) invItemsQuery = invItemsQuery.eq('supplier_invoices.store_id', storeId);

    const { data: invoiceItems } = await invItemsQuery;

    invoiceItems?.forEach((item: any) => {
      if (!item.product_id) return;
      // Remainder to be received
      const remaining = Math.max(0, Number(item.quantity || 0) - Number(item.received_quantity || 0));
      onPoMap.set(item.product_id, (onPoMap.get(item.product_id) || 0) + remaining);
    });

    return onPoMap;
  }
}

export const procurementService = new ProcurementService();

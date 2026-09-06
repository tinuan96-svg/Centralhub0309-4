import { supabase } from '../supabase';

export interface ProfitOrderRow {
  id: string;
  order_number: string;
  created_at: string;
  store_id: string | null;
  store_name: string;
  customer_name: string;
  total: number;
  delivery_fee: number;
  shipping_cost: number;
  product_cost: number;
  packing_cost: number;
  gross_profit: number;
  profit_margin: number;
  order_status: string;
  payment_status: string;
}

export interface CategorySales {
  category: string;
  revenue: number;
  order_count: number;
  profit: number;
}

export interface StoreTimeSeries {
  store_id: string;
  store_name: string;
  data: { date: string; revenue: number; profit: number }[];
}

export class ProfitAnalysisService {
  /**
   * Authoritative source for paid-order gross profit.
   * Uses the reconciled order-level product_cost_net/gross_profit snapshot rather
   * than silently treating missing historical order-item costs as zero.
   */
  static async getAllProfitOrders(filters?: {
    storeId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<ProfitOrderRow[]> {
    try {
      let query = supabase
        .from('orders')
        .select('id, order_number, created_at, store_id, customer_name, total, delivery_fee, product_cost_net, gross_profit, packing_cost_net, gateway_fee_net, order_status, payment_status')
        .eq('payment_status', 'paid')
        .eq('is_deleted', false)
        .not('order_status', 'in', '("cancelled","refunded")');

      if (filters?.storeId && filters.storeId !== 'all') query = query.eq('store_id', filters.storeId);
      if (filters?.startDate) query = query.gte('created_at', filters.startDate.toISOString());
      if (filters?.endDate) query = query.lte('created_at', filters.endDate.toISOString());

      const { data: orders, error } = await query
        .order('created_at', { ascending: false })
        .limit(filters?.limit || 2000);

      if (error || !orders) {
        console.error('[ProfitAnalysis] Error fetching orders:', error);
        return [];
      }
      if (orders.length === 0) return [];

      const orderIds = orders.map((o: any) => o.id);
      const [shipmentsResult, storesResult] = await Promise.all([
        supabase.from('shipments').select('order_id, shipping_cost').in('order_id', orderIds),
        supabase.from('stores').select('id, name'),
      ]);

      const shippingByOrder = new Map<string, number>();
      (shipmentsResult.data || []).forEach((shipment: any) => {
        const cost = Number(shipment.shipping_cost || 0);
        if (cost > 0) shippingByOrder.set(shipment.order_id, cost);
      });

      const storeMap = new Map<string, string>();
      (storesResult.data || []).forEach((store: any) => storeMap.set(store.id, store.name));

      return (orders as any[]).map((order) => {
        const total = Number(order.total || 0);
        const productCost = Number(order.product_cost_net || 0);
        const storedGrossProfit = Number(order.gross_profit);
        const grossProfit = Number.isFinite(storedGrossProfit) ? storedGrossProfit : total - productCost;
        const profitMargin = total > 0 ? (grossProfit / total) * 100 : 0;

        return {
          id: order.id,
          order_number: order.order_number || '',
          created_at: order.created_at,
          store_id: order.store_id,
          store_name: order.store_id ? storeMap.get(order.store_id) || 'Unknown' : 'No Store',
          customer_name: order.customer_name || '',
          total,
          delivery_fee: Number(order.delivery_fee || 0),
          shipping_cost: shippingByOrder.get(order.id) || 0,
          product_cost: productCost,
          packing_cost: Number(order.packing_cost_net || 0),
          gross_profit: grossProfit,
          profit_margin: profitMargin,
          order_status: order.order_status || '',
          payment_status: order.payment_status || '',
        };
      });
    } catch (err) {
      console.error('[ProfitAnalysis] Unexpected error in getAllProfitOrders:', err);
      return [];
    }
  }

  /**
   * Category profitability is allocated from authoritative order-level COGS in
   * proportion to each item's revenue. This keeps category totals reconciled to
   * order gross profit even when old item-level cost snapshots are incomplete.
   */
  static async getCategorySales(filters?: { storeId?: string; startDate?: Date; endDate?: Date }): Promise<CategorySales[]> {
    try {
      let query = supabase
        .from('orders')
        .select('id, total, product_cost_net')
        .eq('payment_status', 'paid')
        .eq('is_deleted', false)
        .not('order_status', 'in', '("cancelled","refunded")');

      if (filters?.storeId && filters.storeId !== 'all') query = query.eq('store_id', filters.storeId);
      if (filters?.startDate) query = query.gte('created_at', filters.startDate.toISOString());
      if (filters?.endDate) query = query.lte('created_at', filters.endDate.toISOString());

      const { data: paidOrders, error: orderError } = await query.limit(2000);
      if (orderError || !paidOrders || paidOrders.length === 0) return [];

      const orderIds = paidOrders.map((order: any) => order.id);
      const { data: items, error } = await supabase
        .from('order_items')
        .select('product_id, total_price, order_id')
        .in('order_id', orderIds)
        .limit(10000);

      if (error || !items) {
        console.error('[ProfitAnalysis] Error fetching category items:', error);
        return [];
      }

      const productIds = Array.from(new Set(items.map((item: any) => item.product_id).filter(Boolean))) as string[];
      const productCategoryMap = new Map<string, string>();
      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('id, category, department')
          .in('id', productIds);
        (products || []).forEach((product: any) => {
          productCategoryMap.set(product.id, product.category || product.department || 'Uncategorized');
        });
      }

      const orderCostMap = new Map<string, number>();
      (paidOrders || []).forEach((order: any) => orderCostMap.set(order.id, Number(order.product_cost_net || 0)));

      const orderItemRevenueMap = new Map<string, number>();
      (items || []).forEach((item: any) => {
        const revenue = Number(item.total_price || 0);
        orderItemRevenueMap.set(item.order_id, (orderItemRevenueMap.get(item.order_id) || 0) + revenue);
      });

      const categories = new Map<string, CategorySales>();
      for (const item of items as any[]) {
        const category = item.product_id ? productCategoryMap.get(item.product_id) || 'Uncategorized' : 'Uncategorized';
        const revenue = Number(item.total_price || 0);
        const orderRevenue = orderItemRevenueMap.get(item.order_id) || 0;
        const orderCost = orderCostMap.get(item.order_id) || 0;
        const allocatedCost = orderRevenue > 0 ? orderCost * (revenue / orderRevenue) : 0;
        const profit = revenue - allocatedCost;
        const existing = categories.get(category);

        if (existing) {
          existing.revenue += revenue;
          existing.profit += profit;
          existing.order_count += 1;
        } else {
          categories.set(category, { category, revenue, profit, order_count: 1 });
        }
      }

      return Array.from(categories.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 15);
    } catch (err) {
      console.error('[ProfitAnalysis] Unexpected error in getCategorySales:', err);
      return [];
    }
  }

  static async getStoreTimeSeries(): Promise<StoreTimeSeries[]> {
    try {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('id, created_at, total, gross_profit, product_cost_net, store_id, order_status, payment_status')
        .eq('payment_status', 'paid')
        .eq('is_deleted', false)
        .not('order_status', 'in', '("cancelled","refunded")')
        .order('created_at', { ascending: true })
        .limit(5000);

      if (error || !orders || orders.length === 0) {
        if (error) console.error('[ProfitAnalysis] Error fetching store time series:', error);
        return [];
      }

      const { data: stores } = await supabase.from('stores').select('id, name');
      const storeMap = new Map<string, string>();
      (stores || []).forEach((store: any) => storeMap.set(store.id, store.name));

      const grouped = new Map<string, Map<string, { revenue: number; profit: number }>>();
      for (const order of orders as any[]) {
        if (!order.store_id) continue;
        const date = new Date(order.created_at).toISOString().split('T')[0];
        if (!grouped.has(order.store_id)) grouped.set(order.store_id, new Map());

        const storeData = grouped.get(order.store_id)!;
        const existing = storeData.get(date) || { revenue: 0, profit: 0 };
        const total = Number(order.total || 0);
        const storedGrossProfit = Number(order.gross_profit);
        const profit = Number.isFinite(storedGrossProfit)
          ? storedGrossProfit
          : total - Number(order.product_cost_net || 0);

        existing.revenue += total;
        existing.profit += profit;
        storeData.set(date, existing);
      }

      return Array.from(grouped.entries()).map(([storeId, dateMap]) => ({
        store_id: storeId,
        store_name: storeMap.get(storeId) || 'Unknown',
        data: Array.from(dateMap.entries())
          .map(([date, values]) => ({ date, ...values }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      }));
    } catch (err) {
      console.error('[ProfitAnalysis] Unexpected error in getStoreTimeSeries:', err);
      return [];
    }
  }
}

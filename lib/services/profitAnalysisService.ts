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
   * Authoritative source for all profit-related order data.
   * Handles paid status, cancelled/refunded exclusions, and consistent field mapping.
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
        .select(
          'id, order_number, created_at, store_id, customer_name, total, delivery_fee, packing_cost_net, gateway_fee_net, order_status, payment_status'
        )
        .eq('payment_status', 'paid')
        .not('order_status', 'in', '("cancelled","refunded")');

      if (filters?.storeId && filters.storeId !== 'all') {
        query = query.eq('store_id', filters.storeId);
      }
      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate.toISOString());
      }
      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate.toISOString());
      }

      const { data: orders, error } = await query
        .order('created_at', { ascending: false })
        .limit(filters?.limit || 2000);

      if (error || !orders) {
        console.error('Error fetching profit orders:', error);
        return [];
      }

      if (orders.length === 0) return [];

      const orderIds = orders.map((o: any) => o.id);

      const [itemsResult, shipmentsResult, storesResult] = await Promise.all([
        supabase
          .from('order_items')
          .select('order_id, cost_price, quantity, total_price')
          .in('order_id', orderIds),
        supabase
          .from('shipments')
          .select('order_id, shipping_cost')
          .in('order_id', orderIds),
        supabase
          .from('stores')
          .select('id, name'),
      ]);

      const productRevenueByOrder = new Map<string, number>();
      const costByOrder = new Map<string, number>();
      (itemsResult.data || []).forEach((item: any) => {
        const revenue = Number(item.total_price || 0);
        const cost = Number(item.cost_price || 0) * Number(item.quantity || 0);
        productRevenueByOrder.set(item.order_id, (productRevenueByOrder.get(item.order_id) || 0) + revenue);
        costByOrder.set(item.order_id, (costByOrder.get(item.order_id) || 0) + cost);
      });

      const shippingByOrder = new Map<string, number>();
      (shipmentsResult.data || []).forEach((s: any) => {
        const cost = Number(s.shipping_cost || 0);
        if (cost > 0) {
          shippingByOrder.set(s.order_id, cost);
        }
      });

      const storeMap = new Map<string, string>();
      (storesResult.data || []).forEach((s: any) => storeMap.set(s.id, s.name));

      return (orders as any[]).map((o) => {
        const productCost = costByOrder.get(o.id) || 0;
        const shippingCost = shippingByOrder.get(o.id) || 0;
        const packingCost = Number(o.packing_cost_net || 0);
        const gatewayFee = Number(o.gateway_fee_net || 0);
        const total = Number(o.total || 0);
        const deliveryFee = Number(o.delivery_fee || 0);

        // Product-only revenue (excluding delivery fee)
        const productRevenue = total - deliveryFee;

        // Profit calculation based strictly on products, excluding shipping logistics and gateway fees
        const grossProfit = productRevenue - productCost - gatewayFee;
        const profitMargin = productRevenue > 0 ? (grossProfit / productRevenue) * 100 : 0;

        return {
          id: o.id,
          order_number: o.order_number || '',
          created_at: o.created_at,
          store_id: o.store_id,
          store_name: o.store_id ? storeMap.get(o.store_id) || 'Unknown' : 'No Store',
          customer_name: o.customer_name || '',
          total,
          delivery_fee: deliveryFee,
          shipping_cost: shippingCost,
          product_cost: productCost,
          packing_cost: packingCost,
          gross_profit: grossProfit,
          profit_margin: profitMargin,
          order_status: o.order_status || '',
          payment_status: o.payment_status || '',
        };
      });
    } catch (err) {
      console.error('Unexpected error in getAllProfitOrders:', err);
      return [];
    }
  }

  static async getCategorySales(filters?: { storeId?: string; startDate?: Date; endDate?: Date }): Promise<CategorySales[]> {
    try {
      let query = supabase
        .from('orders')
        .select('id')
        .eq('payment_status', 'paid')
        .not('order_status', 'in', '("cancelled","refunded")');

      if (filters?.storeId && filters.storeId !== 'all') {
        query = query.eq('store_id', filters.storeId);
      }
      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate.toISOString());
      }
      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate.toISOString());
      }

      const { data: paidOrders } = await query.limit(2000);

      if (!paidOrders || paidOrders.length === 0) return [];

      const orderIds = paidOrders.map((o: any) => o.id);

      const { data: items, error } = await supabase
        .from('order_items')
        .select('product_id, total_price, cost_price, quantity, order_id')
        .in('order_id', orderIds)
        .limit(5000);

      if (error || !items) {
        console.error('Error fetching order items for category sales:', error);
        return [];
      }

      const productIds = Array.from(
        new Set(items.map((i: any) => i.product_id).filter(Boolean))
      ) as string[];

      const productCategoryMap = new Map<string, string>();
      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('id, category, department')
          .in('id', productIds);
        products?.forEach((p: any) => {
          productCategoryMap.set(p.id, p.category || p.department || 'Uncategorized');
        });
      }

      const catMap = new Map<string, CategorySales>();

      for (const item of items as any[]) {
        const category = item.product_id
          ? productCategoryMap.get(item.product_id) || 'Uncategorized'
          : 'Uncategorized';

        const revenue = Number(item.total_price || 0);
        const cost = Number(item.cost_price || 0) * Number(item.quantity || 0);
        const profit = revenue - cost;

        const existing = catMap.get(category);
        if (existing) {
          existing.revenue += revenue;
          existing.profit += profit;
          existing.order_count += 1;
        } else {
          catMap.set(category, {
            category,
            revenue,
            profit,
            order_count: 1,
          });
        }
      }

      return Array.from(catMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 15);
    } catch (err) {
      console.error('Unexpected error in getCategorySales:', err);
      return [];
    }
  }


  static async getStoreTimeSeries(): Promise<StoreTimeSeries[]> {
    try {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('id, created_at, total, store_id, order_status, payment_status')
        .eq('payment_status', 'paid')
        .order('created_at', { ascending: true })
        .limit(3000);

      if (error || !orders) {
        console.error('Error fetching store time series:', error);
        return [];
      }

      if (orders.length === 0) return [];

      const orderIds = orders.map((o: any) => o.id);

      const [itemsResult, storesResult] = await Promise.all([
        supabase
          .from('order_items')
          .select('order_id, cost_price, quantity')
          .in('order_id', orderIds),
        supabase
          .from('stores')
          .select('id, name'),
      ]);

      const productRevenueByOrder = new Map<string, number>();
      const costByOrder = new Map<string, number>();
      (itemsResult.data || []).forEach((item: any) => {
        const revenue = Number(item.total_price || 0);
        const cost = Number(item.cost_price || 0) * Number(item.quantity || 0);
        productRevenueByOrder.set(item.order_id, (productRevenueByOrder.get(item.order_id) || 0) + revenue);
        costByOrder.set(item.order_id, (costByOrder.get(item.order_id) || 0) + cost);
      });

      const storeMap = new Map<string, string>();
      (storesResult.data || []).forEach((s: any) => storeMap.set(s.id, s.name));

      const grouped = new Map<string, Map<string, { revenue: number; profit: number }>>();

      for (const order of orders as any[]) {
        if (!order.store_id) continue;
        if (['cancelled', 'refunded'].includes(order.order_status)) continue;

        const date = new Date(order.created_at).toISOString().split('T')[0];
        if (!grouped.has(order.store_id)) {
          grouped.set(order.store_id, new Map());
        }
        const storeData = grouped.get(order.store_id)!;
        const existing = storeData.get(date) || { revenue: 0, profit: 0 };
        const total = Number(order.total || 0);
        const deliveryFee = Number(order.delivery_fee || 0);

        // Use product-only revenue (excluding delivery fee)
        const productRevenue = total - deliveryFee;
        const productCost = costByOrder.get(order.id) || 0;

        existing.revenue += productRevenue;
        existing.profit += productRevenue - productCost;
        storeData.set(date, existing);
      }

      return Array.from(grouped.entries()).map(([storeId, dateMap]) => ({
        store_id: storeId,
        store_name: storeMap.get(storeId) || 'Unknown',
        data: Array.from(dateMap.entries())
          .map(([date, vals]) => ({ date, ...vals }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      }));
    } catch (err) {
      console.error('Unexpected error in getStoreTimeSeries:', err);
      return [];
    }
  }
}

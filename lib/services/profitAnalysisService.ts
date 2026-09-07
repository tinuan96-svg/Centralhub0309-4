import { supabase } from '../supabase';

export type CostQuality = 'order_total' | 'snapshot' | 'estimated_current' | 'missing';

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
  cost_quality: CostQuality;
  profit_is_estimated: boolean;
}

export interface CategorySales { category: string; revenue: number; order_count: number; profit: number; }
export interface StoreTimeSeries { store_id: string; store_name: string; data: { date: string; revenue: number; profit: number }[]; }

type CostResolution = { cost: number; quality: CostQuality };

export class ProfitAnalysisService {
  private static resolveCost(orderCost: number, items: any[], currentCosts: Map<string, number>): CostResolution {
    if (orderCost > 0) return { cost: orderCost, quality: 'order_total' };
    if (!items.length) return { cost: 0, quality: 'missing' };

    const allSnapshots = items.every(i => Number(i.cost_price || 0) > 0);
    if (allSnapshots) {
      return {
        cost: items.reduce((s, i) => s + Number(i.cost_price || 0) * Number(i.quantity || 0), 0),
        quality: 'snapshot',
      };
    }

    let reconstructable = true;
    let reconstructed = 0;
    for (const item of items) {
      const qty = Number(item.quantity || 0);
      const snapshot = Number(item.cost_price || 0);
      const current = item.product_id ? Number(currentCosts.get(item.product_id) || 0) : 0;
      const unitCost = snapshot > 0 ? snapshot : current;
      if (unitCost <= 0) {
        reconstructable = false;
        break;
      }
      reconstructed += unitCost * qty;
    }

    return reconstructable
      ? { cost: reconstructed, quality: 'estimated_current' }
      : { cost: 0, quality: 'missing' };
  }

  static async getAllProfitOrders(filters?: { storeId?: string; startDate?: Date; endDate?: Date; limit?: number }): Promise<ProfitOrderRow[]> {
    try {
      let query = supabase
        .from('orders')
        .select('id, order_number, created_at, store_id, customer_name, total, delivery_fee, product_cost_net, packing_cost_net, order_status, payment_status')
        .eq('payment_status', 'paid')
        .eq('is_deleted', false)
        .not('order_status', 'in', '("cancelled","refunded")');
      if (filters?.storeId && filters.storeId !== 'all') query = query.eq('store_id', filters.storeId);
      if (filters?.startDate) query = query.gte('created_at', filters.startDate.toISOString());
      if (filters?.endDate) query = query.lte('created_at', filters.endDate.toISOString());

      const { data: orders, error } = await query.order('created_at', { ascending: false }).limit(filters?.limit || 2000);
      if (error || !orders?.length) return [];

      const orderIds = orders.map((o: any) => o.id);
      const [itemsResult, shipmentsResult, storesResult] = await Promise.all([
        supabase.from('order_items').select('order_id, product_id, cost_price, quantity, total_price').in('order_id', orderIds),
        supabase.from('shipments').select('order_id, shipping_cost').in('order_id', orderIds),
        supabase.from('stores').select('id, name'),
      ]);
      if (itemsResult.error) console.error('[ProfitAnalysis] order_items:', itemsResult.error);

      const itemsByOrder = new Map<string, any[]>();
      const productIds = new Set<string>();
      (itemsResult.data || []).forEach((i: any) => {
        if (!itemsByOrder.has(i.order_id)) itemsByOrder.set(i.order_id, []);
        itemsByOrder.get(i.order_id)!.push(i);
        if (i.product_id) productIds.add(i.product_id);
      });

      const currentCosts = new Map<string, number>();
      if (productIds.size) {
        const { data: products } = await supabase.from('products').select('id,cost_price').in('id', Array.from(productIds));
        (products || []).forEach((p: any) => currentCosts.set(p.id, Number(p.cost_price || 0)));
      }

      const shipping = new Map<string, number>();
      (shipmentsResult.data || []).forEach((s: any) => { if (Number(s.shipping_cost || 0) > 0) shipping.set(s.order_id, Number(s.shipping_cost)); });
      const stores = new Map<string, string>();
      (storesResult.data || []).forEach((s: any) => stores.set(s.id, s.name));

      return (orders as any[]).map(o => {
        const resolution = this.resolveCost(Number(o.product_cost_net || 0), itemsByOrder.get(o.id) || [], currentCosts);
        const total = Number(o.total || 0);
        const hasReliableCost = resolution.quality !== 'missing';
        const grossProfit = hasReliableCost ? total - resolution.cost : 0;
        return {
          id: o.id,
          order_number: o.order_number || '',
          created_at: o.created_at,
          store_id: o.store_id,
          store_name: o.store_id ? stores.get(o.store_id) || 'Unknown' : 'No Store',
          customer_name: o.customer_name || '',
          total,
          delivery_fee: Number(o.delivery_fee || 0),
          shipping_cost: shipping.get(o.id) || 0,
          product_cost: resolution.cost,
          packing_cost: Number(o.packing_cost_net || 0),
          gross_profit: grossProfit,
          profit_margin: hasReliableCost && total > 0 ? (grossProfit / total) * 100 : 0,
          order_status: o.order_status || '',
          payment_status: o.payment_status || '',
          cost_quality: resolution.quality,
          profit_is_estimated: resolution.quality === 'estimated_current' || resolution.quality === 'missing',
        };
      });
    } catch (err) {
      console.error('[ProfitAnalysis] getAllProfitOrders:', err);
      return [];
    }
  }

  static async getCategorySales(filters?: { storeId?: string; startDate?: Date; endDate?: Date }): Promise<CategorySales[]> {
    const orders = await this.getAllProfitOrders({ ...filters, limit: 2000 });
    const reliable = orders.filter(o => o.cost_quality !== 'missing');
    if (!reliable.length) return [];
    const ids = reliable.map(o => o.id);
    const { data: items } = await supabase.from('order_items').select('order_id,product_id,total_price').in('order_id', ids).limit(10000);
    if (!items?.length) return [];

    const productIds = Array.from(new Set(items.map((i: any) => i.product_id).filter(Boolean))) as string[];
    const categories = new Map<string, string>();
    if (productIds.length) {
      const { data: products } = await supabase.from('products').select('id,category,department').in('id', productIds);
      (products || []).forEach((p: any) => categories.set(p.id, p.category || p.department || 'Uncategorized'));
    }
    const orderMap = new Map(reliable.map(o => [o.id, o]));
    const orderRevenue = new Map<string, number>();
    items.forEach((i: any) => orderRevenue.set(i.order_id, (orderRevenue.get(i.order_id) || 0) + Number(i.total_price || 0)));
    const result = new Map<string, CategorySales>();
    for (const item of items as any[]) {
      const order = orderMap.get(item.order_id);
      if (!order) continue;
      const revenue = Number(item.total_price || 0);
      const denominator = orderRevenue.get(item.order_id) || 0;
      const allocatedCost = denominator > 0 ? order.product_cost * (revenue / denominator) : 0;
      const category = item.product_id ? categories.get(item.product_id) || 'Uncategorized' : 'Uncategorized';
      const row = result.get(category) || { category, revenue: 0, order_count: 0, profit: 0 };
      row.revenue += revenue;
      row.profit += revenue - allocatedCost;
      row.order_count += 1;
      result.set(category, row);
    }
    return Array.from(result.values()).sort((a,b) => b.revenue-a.revenue).slice(0,15);
  }

  static async getStoreTimeSeries(): Promise<StoreTimeSeries[]> {
    const orders = (await this.getAllProfitOrders({ limit: 5000 })).filter(o => o.cost_quality !== 'missing' && o.store_id);
    const grouped = new Map<string, Map<string, { revenue: number; profit: number }>>();
    const names = new Map<string,string>();
    for (const o of orders) {
      const storeId = o.store_id!;
      names.set(storeId, o.store_name);
      if (!grouped.has(storeId)) grouped.set(storeId, new Map());
      const date = new Date(o.created_at).toISOString().slice(0,10);
      const row = grouped.get(storeId)!.get(date) || { revenue: 0, profit: 0 };
      row.revenue += o.total;
      row.profit += o.gross_profit;
      grouped.get(storeId)!.set(date, row);
    }
    return Array.from(grouped.entries()).map(([store_id, dateMap]) => ({
      store_id,
      store_name: names.get(store_id) || 'Unknown',
      data: Array.from(dateMap.entries()).map(([date,v]) => ({ date, ...v })).sort((a,b) => a.date.localeCompare(b.date)),
    }));
  }
}

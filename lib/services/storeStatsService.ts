import { supabase } from '@/lib/supabase';

export interface StoreStats {
  storeId: string;
  storeName: string;
  storeSlug: string;
  totalProducts: number;
  activeProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalOrders: number;
  pendingOrders: number;
  totalRevenue: number;
  revenueTrend: number[];
  revenueGrowth: number;
  healthScore: number;
  healthStatus: 'healthy' | 'attention' | 'critical';
  aov: number;
  fulfillmentRate: number;
}

export class StoreStatsService {
  static async getStoreStats(storeId: string, filters?: { startDate?: Date; endDate?: Date }): Promise<StoreStats | null> {
    try {
      let ordersQuery = supabase
        .from('orders')
        .select('id, order_status, payment_status, total, delivery_fee, created_at, warehouse_status')
        .eq('store_id', storeId);

      if (filters?.startDate) ordersQuery = ordersQuery.gte('created_at', filters.startDate.toISOString());
      if (filters?.endDate) ordersQuery = ordersQuery.lte('created_at', filters.endDate.toISOString());

      const [storeRes, productsRes, inventoryRes, ordersRes] = await Promise.all([
        supabase.from('stores').select('id, name, slug').eq('id', storeId).maybeSingle(),
        supabase.from('products').select('id, is_active, is_deleted'),
        supabase.from('central_inventory').select('product_id, stock_quantity, low_stock_threshold'),
        ordersQuery,
      ]);

      const store = storeRes.data;
      if (!store) return null;

      const products = (productsRes.data ?? []).filter((p: any) => !p.is_deleted);
      const inventory = inventoryRes.data ?? [];
      const orders = ordersRes.data ?? [];
      const inventoryByProduct = new Map(inventory.map((i: any) => [i.product_id, i]));

      const activeProducts = products.filter((p: any) => p.is_active !== false).length;
      const lowStockCount = products.filter((p: any) => {
        if (p.is_active === false) return false;
        const inv: any = inventoryByProduct.get(p.id);
        const stock = inv?.stock_quantity ?? 0;
        const threshold = inv?.low_stock_threshold ?? 5;
        return stock > 0 && stock <= threshold;
      }).length;
      const outOfStockCount = products.filter((p: any) => {
        if (p.is_active === false) return false;
        const inv: any = inventoryByProduct.get(p.id);
        return (inv?.stock_quantity ?? 0) <= 0;
      }).length;

      const revenueOrders = orders.filter((o: any) =>
        o.payment_status === 'paid' && !['cancelled', 'refunded'].includes(o.order_status)
      );
      const totalRevenue = revenueOrders.reduce(
        (sum: number, o: any) => sum + ((o.total ?? 0) - (o.delivery_fee ?? 0)),
        0
      );
      const aov = revenueOrders.length > 0 ? totalRevenue / revenueOrders.length : 0;

      const paidOrders = orders.filter((o: any) => o.payment_status === 'paid');
      const fulfilledOrders = paidOrders.filter((o: any) =>
        ['shipped', 'delivered', 'completed'].includes(o.order_status)
      );
      const fulfillmentRate = paidOrders.length > 0
        ? (fulfilledOrders.length / paidOrders.length) * 100
        : 0;

      let score = 100;
      if (activeProducts > 0) {
        score -= Math.min(20, (outOfStockCount / activeProducts) * 100 * 2);
      }
      if (paidOrders.length > 0) {
        score -= Math.min(30, (100 - fulfillmentRate) * 0.5);
      }
      const healthStatus = score >= 85 ? 'healthy' : score >= 60 ? 'attention' : 'critical';

      const now = new Date();
      const trend: number[] = [];
      const previousTrend: number[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const dayEnd = new Date(d);
        dayEnd.setHours(23, 59, 59, 999);
        trend.push(revenueOrders
          .filter((o: any) => { const od = new Date(o.created_at); return od >= d && od <= dayEnd; })
          .reduce((sum: number, o: any) => sum + ((o.total ?? 0) - (o.delivery_fee ?? 0)), 0));

        const pd = new Date(now);
        pd.setDate(now.getDate() - (i + 7));
        pd.setHours(0, 0, 0, 0);
        const pDayEnd = new Date(pd);
        pDayEnd.setHours(23, 59, 59, 999);
        previousTrend.push(revenueOrders
          .filter((o: any) => { const od = new Date(o.created_at); return od >= pd && od <= pDayEnd; })
          .reduce((sum: number, o: any) => sum + ((o.total ?? 0) - (o.delivery_fee ?? 0)), 0));
      }

      const currentPeriodTotal = trend.reduce((a, b) => a + b, 0);
      const previousPeriodTotal = previousTrend.reduce((a, b) => a + b, 0);
      const revenueGrowth = previousPeriodTotal > 0
        ? ((currentPeriodTotal - previousPeriodTotal) / previousPeriodTotal) * 100
        : currentPeriodTotal > 0 ? 100 : 0;

      return {
        storeId: store.id,
        storeName: store.name,
        storeSlug: store.slug,
        totalProducts: products.length,
        activeProducts,
        lowStockCount,
        outOfStockCount,
        totalOrders: orders.length,
        pendingOrders: orders.filter((o: any) => o.order_status === 'pending_payment').length,
        totalRevenue,
        revenueTrend: trend,
        revenueGrowth,
        healthScore: Math.round(score),
        healthStatus,
        aov,
        fulfillmentRate: Math.round(fulfillmentRate),
      };
    } catch (e) {
      console.error('StoreStatsService.getStoreStats error:', e);
      return null;
    }
  }

  static async getAllStoresStats(filters?: { startDate?: Date; endDate?: Date }): Promise<StoreStats[]> {
    try {
      const { data: stores } = await supabase.from('stores').select('id');
      if (!stores) return [];
      const results = await Promise.all(stores.map(s => this.getStoreStats(s.id, filters)));
      return results.filter(Boolean) as StoreStats[];
    } catch (e) {
      console.error('StoreStatsService.getAllStoresStats error:', e);
      return [];
    }
  }
}

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
  paidOrders: number;
  pendingOrders: number;
  failedOrders: number;
  totalRevenue: number;
  revenueTrend: number[];
  revenueGrowth: number;
  healthScore: number;
  healthStatus: 'healthy' | 'attention' | 'critical';
  aov: number;
  fulfillmentRate: number;
}

function productIsGloballyLive(product: any) {
  return product?.is_deleted !== true
    && product?.is_active !== false
    && product?.approval_status === 'approved'
    && product?.is_published === true
    && product?.is_archived !== true;
}

export class StoreStatsService {
  static async getStoreStats(storeId: string, filters?: { startDate?: Date; endDate?: Date }): Promise<StoreStats | null> {
    try {
      let ordersQuery = supabase
        .from('orders')
        .select('id, order_status, payment_status, total, delivery_fee, created_at, warehouse_status, is_deleted')
        .eq('store_id', storeId)
        .eq('is_deleted', false);

      if (filters?.startDate) ordersQuery = ordersQuery.gte('created_at', filters.startDate.toISOString());
      if (filters?.endDate) ordersQuery = ordersQuery.lte('created_at', filters.endDate.toISOString());

      const [storeRes, productsRes, inventoryRes, visibilityRes, ordersRes] = await Promise.all([
        supabase.from('stores').select('id, name, slug').eq('id', storeId).maybeSingle(),
        supabase.from('products').select('id, is_active, is_deleted, approval_status, is_published, is_archived'),
        supabase.from('central_inventory').select('product_id, stock_quantity, low_stock_threshold'),
        supabase.from('store_product_visibility').select('product_id, is_visible').eq('store_id', storeId),
        ordersQuery,
      ]);

      const store = storeRes.data;
      if (!store) return null;

      const products = productsRes.data ?? [];
      const inventory = inventoryRes.data ?? [];
      const visibility = visibilityRes.data ?? [];
      const orders = ordersRes.data ?? [];
      const inventoryByProduct = new Map(inventory.map((i: any) => [i.product_id, i]));
      const visibilityByProduct = new Map(visibility.map((row: any) => [row.product_id, row.is_visible !== false]));

      // Store cards describe the effective CentralHub storefront catalogue, not every
      // product row in the shared master table. A product must pass the global
      // approval/publication gate and must not be explicitly hidden for this store.
      const globallyLiveProducts = products.filter(productIsGloballyLive);
      const storeLiveProducts = globallyLiveProducts.filter((p: any) => visibilityByProduct.get(p.id) !== false);
      const activeProducts = storeLiveProducts.length;

      const lowStockCount = storeLiveProducts.filter((p: any) => {
        const inv: any = inventoryByProduct.get(p.id);
        const stock = inv?.stock_quantity ?? 0;
        const threshold = inv?.low_stock_threshold ?? 5;
        return stock > 0 && stock <= threshold;
      }).length;
      const outOfStockCount = storeLiveProducts.filter((p: any) => {
        const inv: any = inventoryByProduct.get(p.id);
        return (inv?.stock_quantity ?? 0) <= 0;
      }).length;

      const excludedStatuses = new Set(['cancelled', 'refunded', 'failed', 'returned']);
      const revenueOrders = orders.filter((o: any) =>
        o.payment_status === 'paid' && !excludedStatuses.has(String(o.order_status || '').toLowerCase())
      );
      const totalRevenue = revenueOrders.reduce(
        (sum: number, o: any) => sum + ((o.total ?? 0) - (o.delivery_fee ?? 0)),
        0
      );
      const aov = revenueOrders.length > 0 ? totalRevenue / revenueOrders.length : 0;

      const paidOrders = revenueOrders;
      const fulfilledOrders = paidOrders.filter((o: any) =>
        ['shipped', 'delivered', 'completed'].includes(o.order_status)
      );
      const fulfillmentRate = paidOrders.length > 0
        ? (fulfilledOrders.length / paidOrders.length) * 100
        : 0;
      const pendingOrders = orders.filter((o: any) =>
        o.payment_status === 'pending' || (o.order_status === 'pending_payment' && o.payment_status !== 'failed')
      ).length;
      const failedOrders = orders.filter((o: any) =>
        o.payment_status === 'failed' || o.order_status === 'failed'
      ).length;

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
        totalProducts: globallyLiveProducts.length,
        activeProducts,
        lowStockCount,
        outOfStockCount,
        totalOrders: orders.length,
        paidOrders: paidOrders.length,
        pendingOrders,
        failedOrders,
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

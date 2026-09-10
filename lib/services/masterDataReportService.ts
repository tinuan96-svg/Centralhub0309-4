import { supabase } from '../supabase';
import { IntelligenceService } from './intelligenceService';

export type MasterDataEntityType = 'brand' | 'category';
export type MasterDataTimeRange = '7days' | '30days' | '90days' | '6months' | '12months' | 'all';

export interface MasterDataReportOptions {
  storeId?: string | null;
  timeRange: MasterDataTimeRange;
}

export interface EntityMetricSnapshot {
  revenue: number;
  units: number;
  orders: number;
  cost: number;
  grossProfit: number;
  margin: number;
  avgUnitPrice: number;
  revenuePerOrder: number;
  unitsPerOrder: number;
}

export interface MasterDataEntityReport {
  entityType: MasterDataEntityType;
  entity: {
    id: string;
    name: string;
    slug?: string | null;
    logoUrl?: string | null;
    description?: string | null;
    isActive: boolean;
  };
  period: {
    timeRange: MasterDataTimeRange;
    start: string | null;
    end: string | null;
    previousStart: string | null;
    previousEnd: string | null;
    bucket: 'day' | 'week' | 'month';
    days: number;
  };
  metrics: EntityMetricSnapshot & {
    totalProducts: number;
    activeProducts: number;
    sellingProducts: number;
    currentStock: number;
    lowStockProducts: number;
    outOfStockProducts: number;
    storeCount: number;
    contributorCount: number;
    revenuePerActiveSku: number;
    salesBreadth: number;
    stockRiskRate: number;
    stockoutRate: number;
    revenuePerDay: number;
  };
  previous: EntityMetricSnapshot | null;
  growth: {
    revenue: number | null;
    units: number | null;
    orders: number | null;
    grossProfit: number | null;
    marginPoints: number | null;
  } | null;
  indices: {
    topContributorShare: number;
    concentrationIndex: number;
    salesBreadth: number;
    stockRiskRate: number;
    revenuePerActiveSku: number;
    revenuePerDay: number;
  };
  trend: Array<{ date: string; revenue: number; units: number; profit: number; orders: number }>;
  breakdown: Array<{
    id: string;
    name: string;
    revenue: number;
    units: number;
    cost: number;
    grossProfit: number;
    margin: number;
    orders: number;
    share: number;
    activeProducts: number;
    currentStock: number;
  }>;
  breakdownTrend: Array<{
    id: string;
    name: string;
    points: Array<{ date: string; revenue: number; units: number; profit: number }>;
  }>;
  stores: Array<{
    id: string;
    name: string;
    revenue: number;
    units: number;
    cost: number;
    grossProfit: number;
    margin: number;
    orders: number;
    share: number;
  }>;
  products: Array<{
    id: string;
    name: string;
    sku: string | null;
    brandId: string | null;
    brandName: string;
    categoryId: string | null;
    categoryName: string;
    isActive: boolean;
    units: number;
    revenue: number;
    cost: number;
    grossProfit: number;
    margin: number;
    orders: number;
    currentStock: number;
    lowStockThreshold: number;
    avgUnitPrice: number;
    revenueShare: number;
    stockCoverDays: number | null;
  }>;
}

type OrderRow = {
  id: string;
  store_id: string | null;
  created_at: string;
};

type ItemRow = {
  order_id: string;
  product_id: string | null;
  product_name: string | null;
  quantity: number | null;
  total_price: number | null;
  cost_price: number | null;
  brand: string | null;
  sku: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  brand_id: string | null;
  brand: string | null;
  category_id: string | null;
  category: string | null;
  main_category: string | null;
  is_active: boolean | null;
  is_deleted: boolean | null;
  stock: number | null;
  low_stock_threshold: number | null;
  cost_price: number | null;
  enable_stock_tracking: boolean | null;
};

const PAGE_SIZE = 1000;
const ITEM_ORDER_BATCH = 75;

const number = (value: unknown) => Number(value || 0);
const pct = (value: number, total: number) => total > 0 ? (value / total) * 100 : 0;
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

function growth(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return round(((current - previous) / Math.abs(previous)) * 100, 1);
}

function startOfWeekIso(input: Date) {
  const d = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function bucketDate(input: string, bucket: 'day' | 'week' | 'month') {
  const d = new Date(input);
  if (bucket === 'month') return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  if (bucket === 'week') return startOfWeekIso(d);
  return d.toISOString().slice(0, 10);
}

function chooseBucket(timeRange: MasterDataTimeRange): 'day' | 'week' | 'month' {
  if (timeRange === '6months') return 'week';
  if (timeRange === '12months' || timeRange === 'all') return 'month';
  return 'day';
}

function snapshotFrom(items: ItemRow[], ordersById: Map<string, OrderRow>, productMap: Map<string, ProductRow>): EntityMetricSnapshot {
  let revenue = 0;
  let units = 0;
  let cost = 0;
  const orderIds = new Set<string>();

  items.forEach(item => {
    const qty = number(item.quantity);
    const product = item.product_id ? productMap.get(item.product_id) : undefined;
    const itemRevenue = number(item.total_price);
    const unitCost = item.cost_price === null || item.cost_price === undefined ? number(product?.cost_price) : number(item.cost_price);
    revenue += itemRevenue;
    units += qty;
    cost += unitCost * qty;
    if (ordersById.has(item.order_id)) orderIds.add(item.order_id);
  });

  const grossProfit = revenue - cost;
  const orders = orderIds.size;
  return {
    revenue: round(revenue),
    units: round(units),
    orders,
    cost: round(cost),
    grossProfit: round(grossProfit),
    margin: round(revenue > 0 ? (grossProfit / revenue) * 100 : 0, 1),
    avgUnitPrice: round(units > 0 ? revenue / units : 0),
    revenuePerOrder: round(orders > 0 ? revenue / orders : 0),
    unitsPerOrder: round(orders > 0 ? units / orders : 0, 1),
  };
}

export class MasterDataReportService {
  private static async fetchOrders(storeId: string | null | undefined, start?: Date, end?: Date): Promise<OrderRow[]> {
    const all: OrderRow[] = [];
    let offset = 0;

    while (true) {
      let query = supabase
        .from('orders')
        .select('id, store_id, created_at')
        .eq('payment_status', 'paid')
        .not('order_status', 'in', '("cancelled","refunded")')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('created_at', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (storeId && storeId !== 'all') query = query.eq('store_id', storeId);
      if (start) query = query.gte('created_at', start.toISOString());
      if (end) query = query.lte('created_at', end.toISOString());

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data || []) as OrderRow[];
      all.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    return all;
  }

  private static async fetchItems(orderIds: string[]): Promise<ItemRow[]> {
    if (!orderIds.length) return [];
    const all: ItemRow[] = [];

    for (let i = 0; i < orderIds.length; i += ITEM_ORDER_BATCH) {
      const batch = orderIds.slice(i, i + ITEM_ORDER_BATCH);
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from('order_items')
          .select('order_id, product_id, product_name, quantity, total_price, cost_price, brand, sku')
          .in('order_id', batch)
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        const rows = (data || []) as ItemRow[];
        all.push(...rows);
        if (rows.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
    }

    return all;
  }

  private static async fetchProductsByIds(productIds: string[]): Promise<ProductRow[]> {
    if (!productIds.length) return [];
    const all: ProductRow[] = [];
    for (let i = 0; i < productIds.length; i += 250) {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, brand_id, brand, category_id, category, main_category, is_active, is_deleted, stock, low_stock_threshold, cost_price, enable_stock_tracking')
        .in('id', productIds.slice(i, i + 250));
      if (error) throw error;
      all.push(...((data || []) as ProductRow[]));
    }
    return all;
  }

  private static async fetchEntityCatalog(entityType: MasterDataEntityType, entityId: string): Promise<ProductRow[]> {
    const column = entityType === 'brand' ? 'brand_id' : 'category_id';
    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, brand_id, brand, category_id, category, main_category, is_active, is_deleted, stock, low_stock_threshold, cost_price, enable_stock_tracking')
      .eq(column, entityId)
      .eq('is_deleted', false);
    if (error) throw error;
    return (data || []) as ProductRow[];
  }

  static async getReport(entityType: MasterDataEntityType, entityId: string, options: MasterDataReportOptions): Promise<MasterDataEntityReport | null> {
    try {
      const entityTable = entityType === 'brand' ? 'brands' : 'categories';
      const [{ data: entity, error: entityError }, catalogProducts, refs] = await Promise.all([
        supabase.from(entityTable).select('*').eq('id', entityId).single(),
        this.fetchEntityCatalog(entityType, entityId),
        Promise.all([
          supabase.from('brands').select('id, name'),
          supabase.from('categories').select('id, name'),
          supabase.from('stores').select('id, name'),
        ]),
      ]);

      if (entityError || !entity) return null;

      const { start, end } = IntelligenceService.getDateRange(options.timeRange);
      const currentOrders = await this.fetchOrders(options.storeId, start, end);
      const currentItemsAll = await this.fetchItems(currentOrders.map(o => o.id));

      let previousStart: Date | undefined;
      let previousEnd: Date | undefined;
      if (start && end) {
        const duration = end.getTime() - start.getTime();
        previousEnd = new Date(start.getTime() - 1);
        previousStart = new Date(previousEnd.getTime() - duration);
      }

      const previousOrders = previousStart && previousEnd
        ? await this.fetchOrders(options.storeId, previousStart, previousEnd)
        : [];
      const previousItemsAll = await this.fetchItems(previousOrders.map(o => o.id));

      const soldIds = Array.from(new Set([...currentItemsAll, ...previousItemsAll].map(i => i.product_id).filter(Boolean))) as string[];
      const soldProducts = await this.fetchProductsByIds(soldIds);
      const productMap = new Map<string, ProductRow>();
      [...soldProducts, ...catalogProducts].forEach(p => productMap.set(p.id, p));

      const belongs = (item: ItemRow) => {
        const product = item.product_id ? productMap.get(item.product_id) : undefined;
        return entityType === 'brand' ? product?.brand_id === entityId : product?.category_id === entityId;
      };

      const currentItems = currentItemsAll.filter(belongs);
      const previousItems = previousItemsAll.filter(belongs);
      const ordersById = new Map(currentOrders.map(o => [o.id, o]));
      const previousOrdersById = new Map(previousOrders.map(o => [o.id, o]));

      const [brandsRes, categoriesRes, storesRes] = refs;
      const brandMap = new Map<string, string>((brandsRes.data || []).map((r: any) => [r.id, r.name]));
      const categoryMap = new Map<string, string>((categoriesRes.data || []).map((r: any) => [r.id, r.name]));
      const storeMap = new Map<string, string>((storesRes.data || []).map((r: any) => [r.id, r.name]));

      const baseMetrics = snapshotFrom(currentItems, ordersById, productMap);
      const previous = previousStart && previousEnd ? snapshotFrom(previousItems, previousOrdersById, productMap) : null;

      const activeCatalog = catalogProducts.filter(p => p.is_active !== false);
      const stockTracked = activeCatalog.filter(p => p.enable_stock_tracking !== false);
      const sellingProductIds = new Set(currentItems.map(i => i.product_id).filter(Boolean));
      const currentStock = stockTracked.reduce((sum, p) => sum + number(p.stock), 0);
      const outOfStockProducts = stockTracked.filter(p => number(p.stock) <= 0).length;
      const lowStockProducts = stockTracked.filter(p => number(p.stock) > 0 && number(p.stock) <= number(p.low_stock_threshold || 5)).length;
      const currentStoreIds = new Set(currentItems.map(i => ordersById.get(i.order_id)?.store_id).filter(Boolean));

      const effectiveStart = start || (currentOrders[0]?.created_at ? new Date(currentOrders[0].created_at) : new Date());
      const effectiveEnd = end || new Date();
      const periodDays = Math.max(1, Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1);
      const bucket = chooseBucket(options.timeRange);

      type Agg = { revenue: number; units: number; cost: number; orders: Set<string> };
      const makeAgg = (): Agg => ({ revenue: 0, units: 0, cost: 0, orders: new Set<string>() });
      const addToAgg = (agg: Agg, item: ItemRow) => {
        const product = item.product_id ? productMap.get(item.product_id) : undefined;
        const qty = number(item.quantity);
        const unitCost = item.cost_price === null || item.cost_price === undefined ? number(product?.cost_price) : number(item.cost_price);
        agg.revenue += number(item.total_price);
        agg.units += qty;
        agg.cost += unitCost * qty;
        agg.orders.add(item.order_id);
      };

      const breakdownAgg = new Map<string, Agg>();
      const storeAgg = new Map<string, Agg>();
      const trendAgg = new Map<string, Agg>();
      const productAgg = new Map<string, Agg>();
      const dimensionProductCounts = new Map<string, { active: Set<string>; stock: number }>();

      catalogProducts.forEach(p => {
        const dimensionId = entityType === 'category' ? (p.brand_id || 'unassigned') : (p.category_id || 'uncategorized');
        if (!dimensionProductCounts.has(dimensionId)) dimensionProductCounts.set(dimensionId, { active: new Set(), stock: 0 });
        const row = dimensionProductCounts.get(dimensionId)!;
        if (p.is_active !== false) row.active.add(p.id);
        if (p.enable_stock_tracking !== false) row.stock += number(p.stock);
      });

      currentItems.forEach(item => {
        const product = item.product_id ? productMap.get(item.product_id) : undefined;
        const order = ordersById.get(item.order_id);
        if (!product || !order) return;

        const dimensionId = entityType === 'category' ? (product.brand_id || 'unassigned') : (product.category_id || 'uncategorized');
        if (!breakdownAgg.has(dimensionId)) breakdownAgg.set(dimensionId, makeAgg());
        addToAgg(breakdownAgg.get(dimensionId)!, item);

        const storeId = order.store_id || 'unknown';
        if (!storeAgg.has(storeId)) storeAgg.set(storeId, makeAgg());
        addToAgg(storeAgg.get(storeId)!, item);

        const date = bucketDate(order.created_at, bucket);
        if (!trendAgg.has(date)) trendAgg.set(date, makeAgg());
        addToAgg(trendAgg.get(date)!, item);

        if (item.product_id) {
          if (!productAgg.has(item.product_id)) productAgg.set(item.product_id, makeAgg());
          addToAgg(productAgg.get(item.product_id)!, item);
        }
      });

      const breakdownName = (id: string) => {
        if (entityType === 'category') return id === 'unassigned' ? 'Unassigned brand' : brandMap.get(id) || 'Unknown brand';
        return id === 'uncategorized' ? 'Uncategorized' : categoryMap.get(id) || 'Unknown category';
      };

      const breakdown = Array.from(breakdownAgg.entries()).map(([id, agg]) => {
        const grossProfit = agg.revenue - agg.cost;
        const catalog = dimensionProductCounts.get(id);
        return {
          id,
          name: breakdownName(id),
          revenue: round(agg.revenue),
          units: round(agg.units),
          cost: round(agg.cost),
          grossProfit: round(grossProfit),
          margin: round(agg.revenue > 0 ? (grossProfit / agg.revenue) * 100 : 0, 1),
          orders: agg.orders.size,
          share: round(pct(agg.revenue, baseMetrics.revenue), 1),
          activeProducts: catalog?.active.size || 0,
          currentStock: round(catalog?.stock || 0),
        };
      }).sort((a, b) => b.revenue - a.revenue);

      const stores = Array.from(storeAgg.entries()).map(([id, agg]) => {
        const grossProfit = agg.revenue - agg.cost;
        return {
          id,
          name: id === 'unknown' ? 'Unknown store' : storeMap.get(id) || 'Unknown store',
          revenue: round(agg.revenue),
          units: round(agg.units),
          cost: round(agg.cost),
          grossProfit: round(grossProfit),
          margin: round(agg.revenue > 0 ? (grossProfit / agg.revenue) * 100 : 0, 1),
          orders: agg.orders.size,
          share: round(pct(agg.revenue, baseMetrics.revenue), 1),
        };
      }).sort((a, b) => b.revenue - a.revenue);

      const products = catalogProducts.map(product => {
        const agg = productAgg.get(product.id) || makeAgg();
        const grossProfit = agg.revenue - agg.cost;
        const velocity = periodDays > 0 ? agg.units / periodDays : 0;
        const stock = number(product.stock);
        return {
          id: product.id,
          name: product.name,
          sku: product.sku,
          brandId: product.brand_id,
          brandName: product.brand_id ? brandMap.get(product.brand_id) || product.brand || 'Unknown brand' : product.brand || 'No brand',
          categoryId: product.category_id,
          categoryName: product.category_id ? categoryMap.get(product.category_id) || product.category || product.main_category || 'Unknown category' : product.category || product.main_category || 'Uncategorized',
          isActive: product.is_active !== false,
          units: round(agg.units),
          revenue: round(agg.revenue),
          cost: round(agg.cost),
          grossProfit: round(grossProfit),
          margin: round(agg.revenue > 0 ? (grossProfit / agg.revenue) * 100 : 0, 1),
          orders: agg.orders.size,
          currentStock: stock,
          lowStockThreshold: number(product.low_stock_threshold || 5),
          avgUnitPrice: round(agg.units > 0 ? agg.revenue / agg.units : number(product.cost_price)),
          revenueShare: round(pct(agg.revenue, baseMetrics.revenue), 1),
          stockCoverDays: velocity > 0 ? round(Math.max(0, stock) / velocity, 1) : null,
        };
      }).sort((a, b) => b.revenue - a.revenue || b.units - a.units || a.name.localeCompare(b.name));

      const trend = Array.from(trendAgg.entries()).map(([date, agg]) => ({
        date,
        revenue: round(agg.revenue),
        units: round(agg.units),
        profit: round(agg.revenue - agg.cost),
        orders: agg.orders.size,
      })).sort((a, b) => a.date.localeCompare(b.date));

      const topBreakdowns = breakdown.slice(0, 6);
      const breakdownTrend = topBreakdowns.map(row => {
        const byDate = new Map<string, { revenue: number; units: number; profit: number }>();
        currentItems.forEach(item => {
          const product = item.product_id ? productMap.get(item.product_id) : undefined;
          const order = ordersById.get(item.order_id);
          if (!product || !order) return;
          const dimensionId = entityType === 'category' ? (product.brand_id || 'unassigned') : (product.category_id || 'uncategorized');
          if (dimensionId !== row.id) return;
          const date = bucketDate(order.created_at, bucket);
          const existing = byDate.get(date) || { revenue: 0, units: 0, profit: 0 };
          const qty = number(item.quantity);
          const unitCost = item.cost_price === null || item.cost_price === undefined ? number(product.cost_price) : number(item.cost_price);
          existing.revenue += number(item.total_price);
          existing.units += qty;
          existing.profit += number(item.total_price) - unitCost * qty;
          byDate.set(date, existing);
        });
        return {
          id: row.id,
          name: row.name,
          points: Array.from(byDate.entries()).map(([date, value]) => ({
            date,
            revenue: round(value.revenue),
            units: round(value.units),
            profit: round(value.profit),
          })).sort((a, b) => a.date.localeCompare(b.date)),
        };
      });

      const topContributorShare = breakdown[0]?.share || 0;
      const concentrationIndex = round(breakdown.reduce((sum, row) => sum + Math.pow(row.share / 100, 2), 0) * 100, 1);
      const salesBreadth = round(pct(sellingProductIds.size, Math.max(activeCatalog.length, 1)), 1);
      const stockRiskRate = round(pct(outOfStockProducts + lowStockProducts, Math.max(stockTracked.length, 1)), 1);
      const stockoutRate = round(pct(outOfStockProducts, Math.max(stockTracked.length, 1)), 1);
      const revenuePerActiveSku = round(activeCatalog.length > 0 ? baseMetrics.revenue / activeCatalog.length : 0);
      const revenuePerDay = round(baseMetrics.revenue / periodDays);

      const metrics: MasterDataEntityReport['metrics'] = {
        ...baseMetrics,
        totalProducts: catalogProducts.length,
        activeProducts: activeCatalog.length,
        sellingProducts: sellingProductIds.size,
        currentStock: round(currentStock),
        lowStockProducts,
        outOfStockProducts,
        storeCount: currentStoreIds.size,
        contributorCount: breakdown.length,
        revenuePerActiveSku,
        salesBreadth,
        stockRiskRate,
        stockoutRate,
        revenuePerDay,
      };

      return {
        entityType,
        entity: {
          id: entity.id,
          name: entity.name,
          slug: entity.slug,
          logoUrl: entityType === 'brand' ? entity.logo_url : null,
          description: entity.description,
          isActive: entity.is_active !== false,
        },
        period: {
          timeRange: options.timeRange,
          start: start?.toISOString() || null,
          end: end?.toISOString() || null,
          previousStart: previousStart?.toISOString() || null,
          previousEnd: previousEnd?.toISOString() || null,
          bucket,
          days: periodDays,
        },
        metrics,
        previous,
        growth: previous ? {
          revenue: growth(baseMetrics.revenue, previous.revenue),
          units: growth(baseMetrics.units, previous.units),
          orders: growth(baseMetrics.orders, previous.orders),
          grossProfit: growth(baseMetrics.grossProfit, previous.grossProfit),
          marginPoints: round(baseMetrics.margin - previous.margin, 1),
        } : null,
        indices: {
          topContributorShare,
          concentrationIndex,
          salesBreadth,
          stockRiskRate,
          revenuePerActiveSku,
          revenuePerDay,
        },
        trend,
        breakdown,
        breakdownTrend,
        stores,
        products,
      };
    } catch (error) {
      console.error('[MasterDataReportService] Failed to build report:', error);
      return null;
    }
  }
}

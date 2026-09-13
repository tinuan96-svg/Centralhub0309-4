import { supabase } from '../supabase';
import { IntelligenceService } from './intelligenceService';

export type CategoryRollupTimeRange = '7days' | '30days' | '90days' | '6months' | '12months' | 'all';

export interface CategoryRollupOptions {
  storeId?: string | null;
  timeRange: CategoryRollupTimeRange;
}

export interface CategoryRollupPoint {
  date: string;
  revenue: number;
  units: number;
  profit: number;
  orders: number;
}

export interface CategoryRollupContributor {
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
  direct?: boolean;
}

export interface CategoryRollupProduct {
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
  revenueShare: number;
  avgUnitPrice: number;
  unitsPerDay: number;
  stockCoverDays: number | null;
}

export interface CategoryRollupReport {
  entity: {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
  };
  period: {
    timeRange: CategoryRollupTimeRange;
    start: string | null;
    end: string | null;
    previousStart: string | null;
    previousEnd: string | null;
    bucket: 'day' | 'week' | 'month';
    days: number;
  };
  metrics: {
    revenue: number;
    units: number;
    cost: number;
    grossProfit: number;
    margin: number;
    orderCount: number;
    avgUnitPrice: number;
    revenuePerOrder: number;
    revenuePerDay: number;
    totalProducts: number;
    activeProducts: number;
    sellingProducts: number;
    currentStock: number;
    lowStockProducts: number;
    outOfStockProducts: number;
    storeCount: number;
    childCount: number;
    sellingChildCount: number;
    brandCount: number;
    salesBreadth: number;
    stockRiskRate: number;
  };
  previous: {
    revenue: number;
    units: number;
    cost: number;
    grossProfit: number;
    margin: number;
    orderCount: number;
  } | null;
  growth: {
    revenue: number | null;
    units: number | null;
    grossProfit: number | null;
    orderCount: number | null;
    marginPoints: number | null;
  } | null;
  trend: CategoryRollupPoint[];
  children: CategoryRollupContributor[];
  childTrend: Array<{ id: string; name: string; points: CategoryRollupPoint[] }>;
  brands: CategoryRollupContributor[];
  brandTrend: Array<{ id: string; name: string; points: CategoryRollupPoint[] }>;
  stores: Array<{
    id: string;
    name: string;
    revenue: number;
    units: number;
    grossProfit: number;
    margin: number;
    orders: number;
    share: number;
  }>;
  products: CategoryRollupProduct[];
}

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  description: string | null;
  is_active: boolean | null;
};

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  brand_id: string | null;
  category_id: string | null;
  is_active: boolean | null;
  stock: number | null;
  low_stock_threshold: number | null;
  cost_price: number | null;
  enable_stock_tracking: boolean | null;
};

type OrderRow = {
  id: string;
  store_id: string | null;
  created_at: string;
};

type ItemRow = {
  order_id: string;
  product_id: string | null;
  quantity: number | null;
  total_price: number | null;
  cost_price: number | null;
};

type Agg = {
  revenue: number;
  units: number;
  cost: number;
  orders: Set<string>;
};

const PAGE_SIZE = 1000;
const ORDER_BATCH = 75;
const num = (value: unknown) => Number(value || 0);
const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const pct = (value: number, total: number) => total > 0 ? (value / total) * 100 : 0;
const makeAgg = (): Agg => ({ revenue: 0, units: 0, cost: 0, orders: new Set<string>() });

function addItem(agg: Agg, item: ItemRow, product?: ProductRow) {
  const quantity = num(item.quantity);
  const unitCost = item.cost_price === null || item.cost_price === undefined ? num(product?.cost_price) : num(item.cost_price);
  agg.revenue += num(item.total_price);
  agg.units += quantity;
  agg.cost += unitCost * quantity;
  agg.orders.add(item.order_id);
}

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

function chooseBucket(timeRange: CategoryRollupTimeRange): 'day' | 'week' | 'month' {
  if (timeRange === '6months') return 'week';
  if (timeRange === '12months' || timeRange === 'all') return 'month';
  return 'day';
}

function bucketDate(input: string, bucket: 'day' | 'week' | 'month') {
  const date = new Date(input);
  if (bucket === 'month') return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
  if (bucket === 'week') return startOfWeekIso(date);
  return date.toISOString().slice(0, 10);
}

function snapshot(items: ItemRow[], orders: Map<string, OrderRow>, products: Map<string, ProductRow>) {
  const agg = makeAgg();
  items.forEach(item => addItem(agg, item, item.product_id ? products.get(item.product_id) : undefined));
  const grossProfit = agg.revenue - agg.cost;
  return {
    revenue: round(agg.revenue),
    units: round(agg.units),
    cost: round(agg.cost),
    grossProfit: round(grossProfit),
    margin: round(agg.revenue > 0 ? (grossProfit / agg.revenue) * 100 : 0, 1),
    orderCount: Array.from(agg.orders).filter(id => orders.has(id)).length,
  };
}

export class CategoryRollupReportService {
  private static async fetchOrders(storeId: string | null | undefined, start?: Date, end?: Date): Promise<OrderRow[]> {
    const rows: OrderRow[] = [];
    let offset = 0;
    while (true) {
      let query = supabase
        .from('orders')
        .select('id,store_id,created_at')
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
      const page = (data || []) as OrderRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    return rows;
  }

  private static async fetchItems(orderIds: string[]): Promise<ItemRow[]> {
    if (!orderIds.length) return [];
    const rows: ItemRow[] = [];
    for (let i = 0; i < orderIds.length; i += ORDER_BATCH) {
      const batch = orderIds.slice(i, i + ORDER_BATCH);
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from('order_items')
          .select('order_id,product_id,quantity,total_price,cost_price')
          .in('order_id', batch)
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        const page = (data || []) as ItemRow[];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
    }
    return rows;
  }

  static async getReport(entityId: string, options: CategoryRollupOptions): Promise<CategoryRollupReport | null> {
    try {
      const [{ data: categoryData, error: categoryError }, brandsRes, storesRes] = await Promise.all([
        supabase.from('categories').select('id,name,parent_id,description,is_active'),
        supabase.from('brands').select('id,name'),
        supabase.from('stores').select('id,name'),
      ]);
      if (categoryError) throw categoryError;

      const categories = (categoryData || []) as CategoryRow[];
      const entity = categories.find(row => row.id === entityId);
      if (!entity) return null;

      const categoryMap = new Map(categories.map(row => [row.id, row]));
      const descendantIds = new Set<string>([entityId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const category of categories) {
          if (category.parent_id && descendantIds.has(category.parent_id) && !descendantIds.has(category.id)) {
            descendantIds.add(category.id);
            changed = true;
          }
        }
      }

      const directChildren = categories.filter(row => row.parent_id === entityId);
      const topChildByCategory = new Map<string, string>();
      for (const categoryId of descendantIds) {
        if (categoryId === entityId) continue;
        let current = categoryMap.get(categoryId);
        while (current?.parent_id && current.parent_id !== entityId) current = categoryMap.get(current.parent_id);
        if (current?.parent_id === entityId) topChildByCategory.set(categoryId, current.id);
      }

      const { data: catalogData, error: catalogError } = await supabase
        .from('products')
        .select('id,name,sku,brand_id,category_id,is_active,stock,low_stock_threshold,cost_price,enable_stock_tracking')
        .in('category_id', Array.from(descendantIds))
        .or('is_deleted.is.null,is_deleted.eq.false');
      if (catalogError) throw catalogError;
      const catalog = (catalogData || []) as ProductRow[];
      const catalogIds = new Set(catalog.map(product => product.id));
      const productMap = new Map(catalog.map(product => [product.id, product]));

      const { start, end } = IntelligenceService.getDateRange(options.timeRange);
      const currentOrders = await this.fetchOrders(options.storeId, start, end);
      const currentItemsAll = await this.fetchItems(currentOrders.map(order => order.id));
      const currentItems = currentItemsAll.filter(item => item.product_id && catalogIds.has(item.product_id));

      let previousStart: Date | undefined;
      let previousEnd: Date | undefined;
      if (start && end) {
        const duration = end.getTime() - start.getTime();
        previousEnd = new Date(start.getTime() - 1);
        previousStart = new Date(previousEnd.getTime() - duration);
      }
      const previousOrders = previousStart && previousEnd ? await this.fetchOrders(options.storeId, previousStart, previousEnd) : [];
      const previousItemsAll = await this.fetchItems(previousOrders.map(order => order.id));
      const previousItems = previousItemsAll.filter(item => item.product_id && catalogIds.has(item.product_id));

      const ordersById = new Map(currentOrders.map(order => [order.id, order]));
      const previousOrdersById = new Map(previousOrders.map(order => [order.id, order]));
      const brandMap = new Map<string, string>((brandsRes.data || []).map((row: any) => [row.id, row.name]));
      const storeMap = new Map<string, string>((storesRes.data || []).map((row: any) => [row.id, row.name]));

      const currentSnapshot = snapshot(currentItems, ordersById, productMap);
      const previousSnapshot = previousStart && previousEnd ? snapshot(previousItems, previousOrdersById, productMap) : null;
      const activeCatalog = catalog.filter(product => product.is_active !== false);
      const stockTracked = activeCatalog.filter(product => product.enable_stock_tracking !== false);
      const sellingProductIds = new Set(currentItems.map(item => item.product_id).filter(Boolean));
      const currentStock = stockTracked.reduce((sum, product) => sum + num(product.stock), 0);
      const lowStockProducts = stockTracked.filter(product => num(product.stock) > 0 && num(product.stock) <= num(product.low_stock_threshold || 5)).length;
      const outOfStockProducts = stockTracked.filter(product => num(product.stock) <= 0).length;

      const effectiveStart = start || (currentOrders[0]?.created_at ? new Date(currentOrders[0].created_at) : new Date());
      const effectiveEnd = end || new Date();
      const periodDays = Math.max(1, Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1);
      const bucket = chooseBucket(options.timeRange);

      const trendAgg = new Map<string, Agg>();
      const childAgg = new Map<string, Agg>();
      const childTrendAgg = new Map<string, Map<string, Agg>>();
      const brandAgg = new Map<string, Agg>();
      const brandTrendAgg = new Map<string, Map<string, Agg>>();
      const storeAgg = new Map<string, Agg>();
      const productAgg = new Map<string, Agg>();

      currentItems.forEach(item => {
        const product = item.product_id ? productMap.get(item.product_id) : undefined;
        const order = ordersById.get(item.order_id);
        if (!product || !order) return;
        const date = bucketDate(order.created_at, bucket);

        if (!trendAgg.has(date)) trendAgg.set(date, makeAgg());
        addItem(trendAgg.get(date)!, item, product);

        const childId = product.category_id === entityId ? entityId : (product.category_id ? topChildByCategory.get(product.category_id) : undefined);
        if (childId) {
          if (!childAgg.has(childId)) childAgg.set(childId, makeAgg());
          addItem(childAgg.get(childId)!, item, product);
          if (!childTrendAgg.has(childId)) childTrendAgg.set(childId, new Map());
          const byDate = childTrendAgg.get(childId)!;
          if (!byDate.has(date)) byDate.set(date, makeAgg());
          addItem(byDate.get(date)!, item, product);
        }

        const brandId = product.brand_id || 'unassigned';
        if (!brandAgg.has(brandId)) brandAgg.set(brandId, makeAgg());
        addItem(brandAgg.get(brandId)!, item, product);
        if (!brandTrendAgg.has(brandId)) brandTrendAgg.set(brandId, new Map());
        const brandByDate = brandTrendAgg.get(brandId)!;
        if (!brandByDate.has(date)) brandByDate.set(date, makeAgg());
        addItem(brandByDate.get(date)!, item, product);

        const storeId = order.store_id || 'unknown';
        if (!storeAgg.has(storeId)) storeAgg.set(storeId, makeAgg());
        addItem(storeAgg.get(storeId)!, item, product);

        if (item.product_id) {
          if (!productAgg.has(item.product_id)) productAgg.set(item.product_id, makeAgg());
          addItem(productAgg.get(item.product_id)!, item, product);
        }
      });

      const childCatalog = new Map<string, { active: number; stock: number }>();
      const brandCatalog = new Map<string, { active: number; stock: number }>();
      catalog.forEach(product => {
        const childId = product.category_id === entityId ? entityId : (product.category_id ? topChildByCategory.get(product.category_id) : undefined);
        if (childId) {
          const row = childCatalog.get(childId) || { active: 0, stock: 0 };
          if (product.is_active !== false) row.active += 1;
          if (product.enable_stock_tracking !== false) row.stock += num(product.stock);
          childCatalog.set(childId, row);
        }
        const brandId = product.brand_id || 'unassigned';
        const brandRow = brandCatalog.get(brandId) || { active: 0, stock: 0 };
        if (product.is_active !== false) brandRow.active += 1;
        if (product.enable_stock_tracking !== false) brandRow.stock += num(product.stock);
        brandCatalog.set(brandId, brandRow);
      });

      const toContributor = (id: string, name: string, agg: Agg, catalogInfo?: { active: number; stock: number }, direct = false): CategoryRollupContributor => {
        const grossProfit = agg.revenue - agg.cost;
        return {
          id,
          name,
          revenue: round(agg.revenue),
          units: round(agg.units),
          cost: round(agg.cost),
          grossProfit: round(grossProfit),
          margin: round(agg.revenue > 0 ? (grossProfit / agg.revenue) * 100 : 0, 1),
          orders: agg.orders.size,
          share: round(pct(agg.revenue, currentSnapshot.revenue), 1),
          activeProducts: catalogInfo?.active || 0,
          currentStock: round(catalogInfo?.stock || 0),
          direct,
        };
      };

      const children: CategoryRollupContributor[] = directChildren.map(child => {
        const agg = childAgg.get(child.id) || makeAgg();
        return toContributor(child.id, child.name, agg, childCatalog.get(child.id));
      });
      const directCatalogInfo = childCatalog.get(entityId);
      if (directCatalogInfo && directCatalogInfo.active > 0) {
        children.push(toContributor(entityId, `${entity.name} · Direct`, childAgg.get(entityId) || makeAgg(), directCatalogInfo, true));
      }
      children.sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));

      const brands = Array.from(new Set([...brandCatalog.keys(), ...brandAgg.keys()])).map(id => {
        const name = id === 'unassigned' ? 'Unassigned brand' : brandMap.get(id) || 'Unknown brand';
        return toContributor(id, name, brandAgg.get(id) || makeAgg(), brandCatalog.get(id));
      }).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));

      const toTrendSeries = (rows: CategoryRollupContributor[], source: Map<string, Map<string, Agg>>) => rows
        .filter(row => row.revenue > 0)
        .slice(0, 6)
        .map(row => ({
          id: row.id,
          name: row.name,
          points: Array.from((source.get(row.id) || new Map()).entries()).map(([date, agg]) => ({
            date,
            revenue: round(agg.revenue),
            units: round(agg.units),
            profit: round(agg.revenue - agg.cost),
            orders: agg.orders.size,
          })).sort((a, b) => a.date.localeCompare(b.date)),
        }));

      const trend = Array.from(trendAgg.entries()).map(([date, agg]) => ({
        date,
        revenue: round(agg.revenue),
        units: round(agg.units),
        profit: round(agg.revenue - agg.cost),
        orders: agg.orders.size,
      })).sort((a, b) => a.date.localeCompare(b.date));

      const stores = Array.from(storeAgg.entries()).map(([id, agg]) => {
        const grossProfit = agg.revenue - agg.cost;
        return {
          id,
          name: id === 'unknown' ? 'Unknown store' : storeMap.get(id) || 'Unknown store',
          revenue: round(agg.revenue),
          units: round(agg.units),
          grossProfit: round(grossProfit),
          margin: round(agg.revenue > 0 ? (grossProfit / agg.revenue) * 100 : 0, 1),
          orders: agg.orders.size,
          share: round(pct(agg.revenue, currentSnapshot.revenue), 1),
        };
      }).sort((a, b) => b.revenue - a.revenue);

      const products: CategoryRollupProduct[] = catalog.map(product => {
        const agg = productAgg.get(product.id) || makeAgg();
        const grossProfit = agg.revenue - agg.cost;
        const unitsPerDay = periodDays > 0 ? agg.units / periodDays : 0;
        const stock = num(product.stock);
        return {
          id: product.id,
          name: product.name,
          sku: product.sku,
          brandId: product.brand_id,
          brandName: product.brand_id ? brandMap.get(product.brand_id) || 'Unknown brand' : 'No brand',
          categoryId: product.category_id,
          categoryName: product.category_id ? categoryMap.get(product.category_id)?.name || 'Unknown category' : 'Uncategorized',
          isActive: product.is_active !== false,
          units: round(agg.units),
          revenue: round(agg.revenue),
          cost: round(agg.cost),
          grossProfit: round(grossProfit),
          margin: round(agg.revenue > 0 ? (grossProfit / agg.revenue) * 100 : 0, 1),
          orders: agg.orders.size,
          currentStock: stock,
          lowStockThreshold: num(product.low_stock_threshold || 5),
          revenueShare: round(pct(agg.revenue, currentSnapshot.revenue), 1),
          avgUnitPrice: round(agg.units > 0 ? agg.revenue / agg.units : 0),
          unitsPerDay: round(unitsPerDay, 3),
          stockCoverDays: unitsPerDay > 0 ? round(Math.max(0, stock) / unitsPerDay, 1) : null,
        };
      }).sort((a, b) => b.revenue - a.revenue || b.units - a.units || a.name.localeCompare(b.name));

      const metrics: CategoryRollupReport['metrics'] = {
        revenue: currentSnapshot.revenue,
        units: currentSnapshot.units,
        cost: currentSnapshot.cost,
        grossProfit: currentSnapshot.grossProfit,
        margin: currentSnapshot.margin,
        orderCount: currentSnapshot.orderCount,
        avgUnitPrice: round(currentSnapshot.units > 0 ? currentSnapshot.revenue / currentSnapshot.units : 0),
        revenuePerOrder: round(currentSnapshot.orderCount > 0 ? currentSnapshot.revenue / currentSnapshot.orderCount : 0),
        revenuePerDay: round(currentSnapshot.revenue / periodDays),
        totalProducts: catalog.length,
        activeProducts: activeCatalog.length,
        sellingProducts: sellingProductIds.size,
        currentStock: round(currentStock),
        lowStockProducts,
        outOfStockProducts,
        storeCount: stores.length,
        childCount: children.length,
        sellingChildCount: children.filter(row => row.revenue > 0).length,
        brandCount: brands.filter(row => row.revenue > 0).length,
        salesBreadth: round(pct(sellingProductIds.size, Math.max(activeCatalog.length, 1)), 1),
        stockRiskRate: round(pct(lowStockProducts + outOfStockProducts, Math.max(stockTracked.length, 1)), 1),
      };

      return {
        entity: {
          id: entity.id,
          name: entity.name,
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
        previous: previousSnapshot,
        growth: previousSnapshot ? {
          revenue: growth(currentSnapshot.revenue, previousSnapshot.revenue),
          units: growth(currentSnapshot.units, previousSnapshot.units),
          grossProfit: growth(currentSnapshot.grossProfit, previousSnapshot.grossProfit),
          orderCount: growth(currentSnapshot.orderCount, previousSnapshot.orderCount),
          marginPoints: round(currentSnapshot.margin - previousSnapshot.margin, 1),
        } : null,
        trend,
        children,
        childTrend: toTrendSeries(children, childTrendAgg),
        brands,
        brandTrend: toTrendSeries(brands, brandTrendAgg),
        stores,
        products,
      };
    } catch (error) {
      console.error('[CategoryRollupReportService] Failed to build category rollup:', error);
      return null;
    }
  }
}

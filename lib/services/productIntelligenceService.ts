import { supabase } from '../supabase';
import type {
  BIFilterOptions,
  MetricSet,
  ProductIntelligenceGroup,
  ProductIntelligenceReport,
  ProductIntelligenceTrendPoint,
  ProductPerformance,
} from './intelligenceService';

type TimeRange = '7days' | '30days' | '90days' | '6months' | '12months' | 'all';

type GroupWithOrders = ProductIntelligenceGroup & { orders: Set<string> };
type MatrixGroup = GroupWithOrders & { brandId: string; brandName: string; categoryId: string; categoryName: string };
type RiceGroup = GroupWithOrders & { trend: Map<string, ProductIntelligenceTrendPoint> };

function emptyMetrics(): MetricSet {
  return {
    totalProducts: 0,
    activeProducts: 0,
    outOfStockProducts: 0,
    lowStockProducts: 0,
    unitsSold: 0,
    revenue: 0,
    cost: 0,
    grossProfit: 0,
    margin: 0,
    orderCount: 0,
    storeCount: 0,
  };
}

function relationName(value: any): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  const name = row?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizedKey(prefix: string, value: string) {
  return `${prefix}:${value.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

function productBrand(product: any, item: any) {
  return relationName(product?.brands) || clean(product?.brand) || clean(item?.brand) || 'No Brand';
}

function productCategory(product: any) {
  return relationName(product?.categories)
    || clean(product?.category)
    || clean(product?.main_category)
    || clean(product?.department)
    || 'Uncategorized';
}

function currentUnitCost(product: any) {
  const value = Number(product?.cost_price || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function finalize<T extends ProductIntelligenceGroup & { orders?: Set<string> }>(rows: T[]) {
  return rows.map(row => {
    const orderCount = row.orders?.size || row.orderCount || 0;
    const margin = row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0;
    const { orders: _orders, ...rest } = row as any;
    return { ...rest, orderCount, margin };
  });
}

export class ProductIntelligenceService {
  static getDateRange(range: TimeRange): { start?: Date; end?: Date } {
    const now = new Date();
    const end = new Date(now);
    const start = new Date(now);
    switch (range) {
      case '7days': start.setDate(now.getDate() - 7); break;
      case '30days': start.setDate(now.getDate() - 30); break;
      case '90days': start.setDate(now.getDate() - 90); break;
      case '6months': start.setMonth(now.getMonth() - 6); break;
      case '12months': start.setFullYear(now.getFullYear() - 1); break;
      case 'all': return {};
      default: start.setDate(now.getDate() - 30);
    }
    return { start, end };
  }

  static async getProductIntelligence(options: BIFilterOptions): Promise<ProductIntelligenceReport> {
    try {
      const current = await this.buildSlice(options);
      const previous = await this.buildSlice(this.previousPeriod(options));
      const delta = (now: number, before: number) => before > 0 ? ((now - before) / before) * 100 : now > 0 ? 100 : 0;

      return {
        current: {
          metrics: current.metrics,
          products: current.products,
          brandCategory: current.brandCategory,
          brands: current.brands,
          categories: current.categories,
          daily: current.daily,
          riceBrandTrends: current.riceBrandTrends,
          doubleHorseCategories: current.doubleHorseCategories,
        },
        previous: { metrics: previous.metrics, products: previous.products },
        comparison: {
          revenue: delta(current.metrics.revenue, previous.metrics.revenue),
          units: delta(current.metrics.unitsSold, previous.metrics.unitsSold),
          profit: delta(current.metrics.grossProfit, previous.metrics.grossProfit),
          orderCount: delta(current.metrics.orderCount, previous.metrics.orderCount),
          margin: current.metrics.margin - previous.metrics.margin,
        },
        quality: current.quality,
      };
    } catch (error) {
      console.error('[ProductIntelligenceService] Failed:', error);
      const metrics = emptyMetrics();
      return {
        current: { metrics, products: [], brandCategory: [], brands: [], categories: [], daily: [], riceBrandTrends: [], doubleHorseCategories: [] },
        previous: { metrics: emptyMetrics(), products: [] },
        comparison: { revenue: 0, units: 0, profit: 0, orderCount: 0, margin: 0 },
        quality: { unmappedItems: 0, zeroCostItems: 0, productsWithoutBrand: 0, productsWithoutCategory: 0 },
      };
    }
  }

  private static async buildSlice(options: BIFilterOptions): Promise<ProductIntelligenceReport['current'] & { quality: ProductIntelligenceReport['quality'] }> {
    const metrics = emptyMetrics();
    const quality = { unmappedItems: 0, zeroCostItems: 0, productsWithoutBrand: 0, productsWithoutCategory: 0 };

    let orderQuery = supabase
      .from('orders')
      .select('id, store_id, created_at, order_status, payment_status')
      .eq('payment_status', 'paid')
      .eq('is_deleted', false)
      .not('order_status', 'in', '("cancelled","refunded","failed","returned")');

    if (options.storeId && options.storeId !== 'all') orderQuery = orderQuery.eq('store_id', options.storeId);
    if (options.startDate) orderQuery = orderQuery.gte('created_at', options.startDate.toISOString());
    if (options.endDate) orderQuery = orderQuery.lte('created_at', options.endDate.toISOString());

    const { data: orders, error: orderError } = await orderQuery;
    if (orderError) throw orderError;
    if (!orders?.length) return { metrics, products: [], brandCategory: [], brands: [], categories: [], daily: [], riceBrandTrends: [], doubleHorseCategories: [], quality };

    const orderIds = orders.map(order => order.id);
    const orderMap = new Map(orders.map((order: any) => [order.id, order]));
    const { data: items, error: itemError } = await supabase
      .from('order_items')
      .select('product_id, product_name, quantity, total_price, cost_price, order_id, brand, sku')
      .in('order_id', orderIds);
    if (itemError) throw itemError;

    const productIds = Array.from(new Set((items || []).map((item: any) => item.product_id).filter(Boolean))) as string[];
    const { data: products, error: productError } = productIds.length
      ? await supabase
        .from('products')
        .select('id,name,sku,is_active,brand_id,category_id,brand,category,main_category,department,sub_category,stock,cost_price,brands(id,name),categories(id,name)')
        .in('id', productIds)
      : { data: [] as any[], error: null };
    if (productError) throw productError;

    const productMap = new Map((products || []).map((product: any) => [product.id, product]));
    const productPerformance = new Map<string, ProductPerformance & { orders: Set<string> }>();
    const brandGroups = new Map<string, GroupWithOrders>();
    const categoryGroups = new Map<string, GroupWithOrders>();
    const matrixGroups = new Map<string, MatrixGroup>();
    const dailyGroups = new Map<string, ProductIntelligenceTrendPoint>();
    const riceTrendGroups = new Map<string, RiceGroup>();
    const doubleHorseGroups = new Map<string, GroupWithOrders>();
    const orderSet = new Set<string>();
    const storeSet = new Set<string>();
    const missingBrandProducts = new Set<string>();
    const missingCategoryProducts = new Set<string>();

    const ensureGroup = <T extends GroupWithOrders>(map: Map<string, T>, id: string, name: string, extra: Omit<T, keyof ProductIntelligenceGroup | 'orders'> = {} as any): T => {
      if (!map.has(id)) {
        map.set(id, { id, name, revenue: 0, units: 0, profit: 0, orderCount: 0, margin: 0, orders: new Set<string>(), ...extra } as T);
      }
      return map.get(id)!;
    };
    const addToGroup = (group: GroupWithOrders, revenue: number, units: number, profit: number, orderId: string) => {
      group.revenue += revenue;
      group.units += units;
      group.profit += profit;
      group.orders.add(orderId);
    };

    for (const item of items || []) {
      const product = item.product_id ? productMap.get(item.product_id) : null;
      const order = orderMap.get(item.order_id);
      const quantity = Number(item.quantity || 0);
      const revenue = Number(item.total_price || 0);
      const snapshotUnitCost = Number(item.cost_price || 0);
      const fallbackUnitCost = currentUnitCost(product);
      const effectiveUnitCost = snapshotUnitCost > 0 ? snapshotUnitCost : fallbackUnitCost;
      const cost = effectiveUnitCost * quantity;
      const profit = revenue - cost;
      const date = order?.created_at ? new Date(order.created_at).toISOString().slice(0, 10) : 'unknown';

      if (!item.product_id || !product) quality.unmappedItems++;
      if (!(snapshotUnitCost > 0)) quality.zeroCostItems++;
      if (product && !relationName(product.brands) && !clean(product.brand) && !clean(item.brand)) missingBrandProducts.add(product.id);
      if (product && !relationName(product.categories) && !clean(product.category) && !clean(product.main_category) && !clean(product.department)) missingCategoryProducts.add(product.id);

      metrics.revenue += revenue;
      metrics.cost += cost;
      metrics.unitsSold += quantity;
      orderSet.add(item.order_id);
      if (order?.store_id) storeSet.add(order.store_id);

      const day = dailyGroups.get(date) || { date, revenue: 0, units: 0, profit: 0 };
      day.revenue += revenue;
      day.units += quantity;
      day.profit += profit;
      dailyGroups.set(date, day);

      if (item.product_id) {
        if (!productPerformance.has(item.product_id)) {
          productPerformance.set(item.product_id, {
            id: item.product_id,
            name: product?.name || item.product_name || 'Unknown product',
            sku: product?.sku || item.sku || null,
            category_name: product ? productCategory(product) : null,
            brand_name: productBrand(product, item),
            unitsSold: 0,
            orderCount: 0,
            revenue: 0,
            cost: 0,
            grossProfit: 0,
            margin: 0,
            stock: Number(product?.stock || 0),
            status: product?.is_active === false ? 'inactive' : 'active',
            orders: new Set<string>(),
          });
        }
        const performance = productPerformance.get(item.product_id)!;
        performance.unitsSold += quantity;
        performance.revenue += revenue;
        performance.cost += cost;
        performance.grossProfit += profit;
        performance.orders.add(item.order_id);
      }

      const brandName = productBrand(product, item);
      const categoryName = product ? productCategory(product) : 'Uncategorized';
      const brandId = product?.brand_id || normalizedKey('brand', brandName);
      const categoryId = product?.category_id || normalizedKey('category', categoryName);

      addToGroup(ensureGroup(brandGroups, brandId, brandName), revenue, quantity, profit, item.order_id);
      addToGroup(ensureGroup(categoryGroups, categoryId, categoryName), revenue, quantity, profit, item.order_id);
      addToGroup(ensureGroup(matrixGroups, `${brandId}:${categoryId}`, `${brandName} / ${categoryName}`, { brandId, brandName, categoryId, categoryName }), revenue, quantity, profit, item.order_id);

      const haystack = `${product?.name || item.product_name || ''} ${categoryName} ${product?.main_category || ''} ${product?.sub_category || ''}`.toLowerCase();
      if (haystack.includes('rice') || haystack.includes('matta') || haystack.includes('ponni') || haystack.includes('palakkadan')) {
        const rice = ensureGroup(riceTrendGroups, brandId, brandName, { trend: new Map<string, ProductIntelligenceTrendPoint>() });
        addToGroup(rice, revenue, quantity, profit, item.order_id);
        const point = rice.trend.get(date) || { date, revenue: 0, units: 0, profit: 0 };
        point.revenue += revenue;
        point.units += quantity;
        point.profit += profit;
        rice.trend.set(date, point);
      }

      if (brandName.toLowerCase() === 'double horse' || brandName.toLowerCase().includes('double horse')) {
        addToGroup(ensureGroup(doubleHorseGroups, categoryId, categoryName), revenue, quantity, profit, item.order_id);
      }
    }

    quality.productsWithoutBrand = missingBrandProducts.size;
    quality.productsWithoutCategory = missingCategoryProducts.size;
    metrics.orderCount = orderSet.size;
    metrics.storeCount = storeSet.size;
    metrics.grossProfit = metrics.revenue - metrics.cost;
    metrics.margin = metrics.revenue > 0 ? (metrics.grossProfit / metrics.revenue) * 100 : 0;

    const productsOut = Array.from(productPerformance.values()).map(product => {
      const { orders: productOrders, ...rest } = product;
      return { ...rest, orderCount: productOrders.size, margin: product.revenue > 0 ? (product.grossProfit / product.revenue) * 100 : 0 };
    }).sort((a, b) => b.revenue - a.revenue);

    metrics.totalProducts = productsOut.length;
    metrics.activeProducts = productsOut.filter(product => product.status === 'active').length;
    metrics.outOfStockProducts = productsOut.filter(product => product.stock <= 0).length;

    const riceBrandTrends = Array.from(riceTrendGroups.values()).map(row => {
      const base = finalize([row])[0];
      return { ...base, trend: Array.from(row.trend.values()).sort((a, b) => a.date.localeCompare(b.date)) };
    }).sort((a, b) => b.revenue - a.revenue);

    return {
      metrics,
      products: productsOut,
      brandCategory: finalize(Array.from(matrixGroups.values())).sort((a, b) => b.revenue - a.revenue),
      brands: finalize(Array.from(brandGroups.values())).sort((a, b) => b.revenue - a.revenue),
      categories: finalize(Array.from(categoryGroups.values())).sort((a, b) => b.revenue - a.revenue),
      daily: Array.from(dailyGroups.values()).sort((a, b) => a.date.localeCompare(b.date)),
      riceBrandTrends,
      doubleHorseCategories: finalize(Array.from(doubleHorseGroups.values())).sort((a, b) => b.revenue - a.revenue),
      quality,
    };
  }

  private static previousPeriod(options: BIFilterOptions): BIFilterOptions {
    if (!options.startDate || !options.endDate) return { ...options };
    const duration = options.endDate.getTime() - options.startDate.getTime();
    if (!Number.isFinite(duration) || duration <= 0) return { ...options };
    return {
      ...options,
      startDate: new Date(options.startDate.getTime() - duration - 1),
      endDate: new Date(options.startDate.getTime() - 1),
    };
  }
}

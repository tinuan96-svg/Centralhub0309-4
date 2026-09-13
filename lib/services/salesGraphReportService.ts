import { supabase } from '../supabase';

export type SalesGraphTimeRange = '7days' | '30days' | '90days' | '6months' | '12months' | 'all';

export interface SalesGraphPoint {
  date: string;
  revenue: number;
  units: number;
  profit: number;
}

export interface SalesGraphGroup {
  id: string;
  name: string;
  revenue: number;
  units: number;
  profit: number;
  margin: number;
  orders: number;
  share: number;
  trend: SalesGraphPoint[];
}

export interface SalesGraphMatrixCell {
  categoryId: string;
  categoryName: string;
  brandId: string;
  brandName: string;
  revenue: number;
  units: number;
  profit: number;
}

export interface SalesGraphReport {
  period: {
    timeRange: SalesGraphTimeRange;
    start: string | null;
    end: string;
    bucket: 'day' | 'week' | 'month';
  };
  totals: {
    revenue: number;
    units: number;
    profit: number;
    margin: number;
    orders: number;
    categories: number;
    brands: number;
  };
  categories: SalesGraphGroup[];
  brands: SalesGraphGroup[];
  matrix: SalesGraphMatrixCell[];
}

type GroupBuilder = Omit<SalesGraphGroup, 'margin' | 'orders' | 'share' | 'trend'> & {
  orderIds: Set<string>;
  points: Map<string, SalesGraphPoint>;
};

type ProductMeta = {
  id: string;
  brand_id: string | null;
  category_id: string | null;
  brand: string | null;
  category: string | null;
  main_category: string | null;
  cost_price: number | null;
  brands?: { id?: string; name?: string } | Array<{ id?: string; name?: string }> | null;
  categories?: { id?: string; name?: string } | Array<{ id?: string; name?: string }> | null;
};

type CategoryMeta = { id: string; name: string; parent_id: string | null };

const PAGE = 75;
const PRODUCT_PAGE = 400;

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function relation(value: ProductMeta['brands']): { id: string | null; name: string | null } {
  const row = Array.isArray(value) ? value[0] : value;
  return {
    id: clean(row?.id) || null,
    name: clean(row?.name) || null,
  };
}

function fallbackId(prefix: string, name: string) {
  return `${prefix}:${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'unknown'}`;
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function getRange(range: SalesGraphTimeRange) {
  const end = new Date();
  const start = new Date(end);
  if (range === 'all') return { start: null as Date | null, end, bucket: 'month' as const };
  if (range === '7days') start.setUTCDate(start.getUTCDate() - 7);
  if (range === '30days') start.setUTCDate(start.getUTCDate() - 30);
  if (range === '90days') start.setUTCDate(start.getUTCDate() - 90);
  if (range === '6months') start.setUTCMonth(start.getUTCMonth() - 6);
  if (range === '12months') start.setUTCFullYear(start.getUTCFullYear() - 1);
  const bucket = range === '90days' ? 'week' : (range === '6months' || range === '12months' ? 'month' : 'day');
  return { start, end, bucket } as const;
}

function bucketDate(value: string, bucket: 'day' | 'week' | 'month') {
  const date = new Date(value);
  if (bucket === 'month') {
    date.setUTCDate(1);
  } else if (bucket === 'week') {
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
  }
  return date.toISOString().slice(0, 10);
}

function ensureGroup(map: Map<string, GroupBuilder>, id: string, name: string) {
  if (!map.has(id)) {
    map.set(id, { id, name, revenue: 0, units: 0, profit: 0, orderIds: new Set<string>(), points: new Map<string, SalesGraphPoint>() });
  }
  return map.get(id)!;
}

function addGroup(group: GroupBuilder, date: string, orderId: string, revenue: number, units: number, profit: number) {
  group.revenue += revenue;
  group.units += units;
  group.profit += profit;
  group.orderIds.add(orderId);
  const point = group.points.get(date) || { date, revenue: 0, units: 0, profit: 0 };
  point.revenue += revenue;
  point.units += units;
  point.profit += profit;
  group.points.set(date, point);
}

function finalize(groups: Map<string, GroupBuilder>, totalRevenue: number): SalesGraphGroup[] {
  return Array.from(groups.values()).map(group => ({
    id: group.id,
    name: group.name,
    revenue: round(group.revenue),
    units: round(group.units, 1),
    profit: round(group.profit),
    margin: group.revenue > 0 ? round((group.profit / group.revenue) * 100, 1) : 0,
    orders: group.orderIds.size,
    share: totalRevenue > 0 ? round((group.revenue / totalRevenue) * 100, 1) : 0,
    trend: Array.from(group.points.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(point => ({ date: point.date, revenue: round(point.revenue), units: round(point.units, 1), profit: round(point.profit) })),
  })).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
}

function rootCategory(categoryId: string | null, categoryName: string, categories: Map<string, CategoryMeta>) {
  if (!categoryId || !categories.has(categoryId)) return { id: categoryId || fallbackId('category', categoryName), name: categoryName };
  let current = categories.get(categoryId)!;
  const seen = new Set<string>();
  while (current.parent_id && categories.has(current.parent_id) && !seen.has(current.id)) {
    seen.add(current.id);
    current = categories.get(current.parent_id)!;
  }
  return { id: current.id, name: current.name };
}

export class SalesGraphReportService {
  static async getReport(options: { storeId?: string | null; timeRange: SalesGraphTimeRange }): Promise<SalesGraphReport> {
    const { start, end, bucket } = getRange(options.timeRange);

    let orderQuery = supabase
      .from('orders')
      .select('id,store_id,created_at')
      .eq('payment_status', 'paid')
      .eq('is_deleted', false)
      .not('order_status', 'in', '("cancelled","refunded","failed","returned")');
    if (options.storeId && options.storeId !== 'all') orderQuery = orderQuery.eq('store_id', options.storeId);
    if (start) orderQuery = orderQuery.gte('created_at', start.toISOString());
    orderQuery = orderQuery.lte('created_at', end.toISOString());

    const [{ data: orders, error: orderError }, { data: categoryRows, error: categoryError }] = await Promise.all([
      orderQuery,
      supabase.from('categories').select('id,name,parent_id'),
    ]);
    if (orderError) throw orderError;
    if (categoryError) throw categoryError;

    const orderList = orders || [];
    const categoryMap = new Map<string, CategoryMeta>((categoryRows || []).map((row: any) => [row.id, row as CategoryMeta]));
    if (!orderList.length) {
      return {
        period: { timeRange: options.timeRange, start: start?.toISOString() || null, end: end.toISOString(), bucket },
        totals: { revenue: 0, units: 0, profit: 0, margin: 0, orders: 0, categories: 0, brands: 0 },
        categories: [], brands: [], matrix: [],
      };
    }

    const orderMap = new Map(orderList.map((order: any) => [order.id, order]));
    const items: any[] = [];
    for (let offset = 0; offset < orderList.length; offset += PAGE) {
      const ids = orderList.slice(offset, offset + PAGE).map((order: any) => order.id);
      const { data, error } = await supabase
        .from('order_items')
        .select('order_id,product_id,product_name,quantity,total_price,cost_price,brand,sku')
        .in('order_id', ids);
      if (error) throw error;
      items.push(...(data || []));
    }

    const productIds = Array.from(new Set(items.map(item => item.product_id).filter(Boolean))) as string[];
    const products: ProductMeta[] = [];
    for (let offset = 0; offset < productIds.length; offset += PRODUCT_PAGE) {
      const ids = productIds.slice(offset, offset + PRODUCT_PAGE);
      const { data, error } = await supabase
        .from('products')
        .select('id,brand_id,category_id,brand,category,main_category,cost_price,brands(id,name),categories(id,name)')
        .in('id', ids);
      if (error) throw error;
      products.push(...((data || []) as ProductMeta[]));
    }
    const productMap = new Map(products.map(product => [product.id, product]));

    const categoryGroups = new Map<string, GroupBuilder>();
    const brandGroups = new Map<string, GroupBuilder>();
    const matrix = new Map<string, SalesGraphMatrixCell>();
    const allOrders = new Set<string>();
    let totalRevenue = 0;
    let totalUnits = 0;
    let totalProfit = 0;

    for (const item of items) {
      const order = orderMap.get(item.order_id) as any;
      if (!order?.created_at) continue;
      const product = item.product_id ? productMap.get(item.product_id) : undefined;
      const brandRelation = relation(product?.brands || null);
      const categoryRelation = relation(product?.categories || null);
      const brandName = brandRelation.name || clean(product?.brand) || clean(item.brand) || 'No Brand';
      const brandId = clean(product?.brand_id) || brandRelation.id || fallbackId('brand', brandName);
      const directCategoryName = categoryRelation.name || clean(product?.category) || clean(product?.main_category) || 'Uncategorized';
      const directCategoryId = clean(product?.category_id) || categoryRelation.id;
      const category = rootCategory(directCategoryId, directCategoryName, categoryMap);

      const units = Number(item.quantity || 0);
      const revenue = Number(item.total_price || 0);
      const snapshotUnitCost = Number(item.cost_price || 0);
      const fallbackUnitCost = Number(product?.cost_price || 0);
      const unitCost = snapshotUnitCost > 0 ? snapshotUnitCost : (fallbackUnitCost > 0 ? fallbackUnitCost : 0);
      const profit = revenue - unitCost * units;
      const date = bucketDate(order.created_at, bucket);

      totalRevenue += revenue;
      totalUnits += units;
      totalProfit += profit;
      allOrders.add(item.order_id);

      addGroup(ensureGroup(categoryGroups, category.id, category.name), date, item.order_id, revenue, units, profit);
      addGroup(ensureGroup(brandGroups, brandId, brandName), date, item.order_id, revenue, units, profit);

      const matrixKey = `${category.id}::${brandId}`;
      const cell = matrix.get(matrixKey) || {
        categoryId: category.id,
        categoryName: category.name,
        brandId,
        brandName,
        revenue: 0,
        units: 0,
        profit: 0,
      };
      cell.revenue += revenue;
      cell.units += units;
      cell.profit += profit;
      matrix.set(matrixKey, cell);
    }

    const categories = finalize(categoryGroups, totalRevenue);
    const brands = finalize(brandGroups, totalRevenue);

    return {
      period: { timeRange: options.timeRange, start: start?.toISOString() || null, end: end.toISOString(), bucket },
      totals: {
        revenue: round(totalRevenue),
        units: round(totalUnits, 1),
        profit: round(totalProfit),
        margin: totalRevenue > 0 ? round((totalProfit / totalRevenue) * 100, 1) : 0,
        orders: allOrders.size,
        categories: categories.filter(row => row.revenue > 0).length,
        brands: brands.filter(row => row.revenue > 0).length,
      },
      categories,
      brands,
      matrix: Array.from(matrix.values())
        .map(cell => ({ ...cell, revenue: round(cell.revenue), units: round(cell.units, 1), profit: round(cell.profit) }))
        .sort((a, b) => b.revenue - a.revenue),
    };
  }
}

import { supabase } from '../supabase';
import { OrderStatus, PaymentStatus } from '../types';

export interface BIFilterOptions {
  storeId?: string | 'all';
  startDate?: Date;
  endDate?: Date;
  brandId?: string;
  categoryId?: string;
  productId?: string;
}

export interface MetricSet {
  totalProducts: number;
  activeProducts: number;
  outOfStockProducts: number;
  lowStockProducts: number;
  unitsSold: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  margin: number;
  orderCount: number;
  storeCount: number;
  subcategories?: number;
  brandCount?: number;
}

export interface BrandIntelligence {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  metrics: MetricSet;
  growth?: {
    revenue: number;
    units: number;
    profit: number;
  };
  trend?: number[]; // Simple revenue trend for sparklines
}

export interface CategoryIntelligence {
  id: string;
  name: string;
  slug: string;
  metrics: MetricSet;
  growth?: {
    revenue: number;
    units: number;
    profit: number;
  };
  trend?: number[];
}

export interface ProductPerformance {
  id: string;
  name: string;
  sku: string | null;
  category_name: string | null;
  brand_name: string | null;
  unitsSold: number;
  orderCount: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  margin: number;
  stock: number;
  status: 'active' | 'inactive';
}

export interface ProductIntelligenceTrendPoint {
  date: string;
  revenue: number;
  units: number;
  profit: number;
}

export interface ProductIntelligenceGroup {
  id: string;
  name: string;
  revenue: number;
  units: number;
  profit: number;
  orderCount: number;
  margin: number;
}

export interface ProductIntelligenceReport {
  current: {
    metrics: MetricSet;
    products: ProductPerformance[];
    brandCategory: Array<ProductIntelligenceGroup & { brandId: string; brandName: string; categoryId: string; categoryName: string }>;
    brands: ProductIntelligenceGroup[];
    categories: ProductIntelligenceGroup[];
    daily: ProductIntelligenceTrendPoint[];
    riceBrandTrends: Array<ProductIntelligenceGroup & { trend: ProductIntelligenceTrendPoint[] }>;
    doubleHorseCategories: ProductIntelligenceGroup[];
  };
  previous: {
    metrics: MetricSet;
    products: ProductPerformance[];
  };
  comparison: {
    revenue: number;
    units: number;
    profit: number;
    orderCount: number;
    margin: number;
  };
  quality: {
    unmappedItems: number;
    zeroCostItems: number;
    productsWithoutBrand: number;
    productsWithoutCategory: number;
  };
}

export class IntelligenceService {
  /**
   * Helper to get common order query with BI filters applied
   */
  private static getBaseOrderQuery(options: BIFilterOptions) {
    let query = supabase
      .from('orders')
      .select('id, store_id, total, delivery_fee, created_at, order_status, payment_status')
      .eq('payment_status', 'paid')
      .not('order_status', 'in', '("cancelled","refunded")');

    if (options.storeId && options.storeId !== 'all') {
      query = query.eq('store_id', options.storeId);
    }
    if (options.startDate) {
      query = query.gte('created_at', options.startDate.toISOString());
    }
    if (options.endDate) {
      query = query.lte('created_at', options.endDate.toISOString());
    }

    return query;
  }

  /**
   * Get intelligence for all brands
   */
  static async getBrandsIntelligence(options: BIFilterOptions): Promise<BrandIntelligence[]> {
    try {
      // 1. Fetch all brands and their product stats
      const { data: brands, error: brandError } = await supabase
        .from('brands')
        .select(`
          id, name, slug, logo_url,
          products (
            id, is_active, is_deleted,
            central_inventory(stock_quantity, low_stock_threshold)
          )
        `);

      if (brandError) throw brandError;
      if (!brands) return [];

      // 2. Fetch all orders within range
      const ordersQuery = this.getBaseOrderQuery(options);
      const { data: orders, error: orderError } = await ordersQuery;

      if (orderError) throw orderError;

      const brandMap = new Map<string, BrandIntelligence>();

      // Initialize brands with product counts
      brands.forEach((b: any) => {
        const productStats = {
          totalProducts: 0,
          activeProducts: 0,
          outOfStockProducts: 0,
          lowStockProducts: 0,
        };

        (b.products || []).forEach((p: any) => {
          if (p.is_deleted) return;
          productStats.totalProducts++;
          if (p.is_active) productStats.activeProducts++;

          const inv = p.central_inventory?.[0];
          if (inv) {
            const stock = inv.stock_quantity || 0;
            const threshold = inv.low_stock_threshold || 5;
            if (stock <= 0) productStats.outOfStockProducts++;
            else if (stock <= threshold) productStats.lowStockProducts++;
          }
        });

        brandMap.set(b.id, {
          id: b.id,
          name: b.name,
          slug: b.slug,
          logo_url: b.logo_url,
          metrics: {
            ...this.emptyMetrics(),
            ...productStats
          }
        });
      });

      if (!orders || orders.length === 0) {
        return Array.from(brandMap.values());
      }

      const orderIds = orders.map(o => o.id);

      // 3. Fetch order items for these orders
      // Note: We might need to fetch in batches if orderIds is very large (> 1000)
      const { data: items, error: itemError } = await supabase
        .from('order_items')
        .select('product_id, quantity, total_price, cost_price, order_id')
        .in('order_id', orderIds);

      if (itemError) throw itemError;

      // 4. Fetch product brand mappings for products sold in these orders
      const soldProductIds = Array.from(new Set(items?.map(i => i.product_id).filter(Boolean))) as string[];
      const { data: soldProducts, error: prodError } = await supabase
        .from('products')
        .select('id, brand_id')
        .in('id', soldProductIds);

      if (prodError) throw prodError;

      const productBrandMap = new Map(soldProducts?.map(p => [p.id, p.brand_id]));

      // 5. Aggregate sales metrics per brand
      const storeCountsByBrand = new Map<string, Set<string>>();
      const orderCountsByBrand = new Map<string, Set<string>>();

      (items || []).forEach(item => {
        const brandId = item.product_id ? productBrandMap.get(item.product_id) : null;
        if (brandId && brandMap.has(brandId)) {
          const b = brandMap.get(brandId)!;
          const m = b.metrics;
          const revenue = Number(item.total_price || 0);
          const cost = Number(item.cost_price || 0) * Number(item.quantity || 0);

          m.unitsSold += Number(item.quantity || 0);
          m.revenue += revenue;
          m.cost += cost;

          // Track unique orders and stores
          const order = orders.find(o => o.id === item.order_id);
          if (order) {
            if (!orderCountsByBrand.has(brandId)) orderCountsByBrand.set(brandId, new Set());
            orderCountsByBrand.get(brandId)!.add(order.id);

            if (order.store_id) {
              if (!storeCountsByBrand.has(brandId)) storeCountsByBrand.set(brandId, new Set());
              storeCountsByBrand.get(brandId)!.add(order.store_id);
            }
          }
        }
      });

      // 6. Calculate final metrics and simplified trends
      return Array.from(brandMap.values()).map(b => {
        const m = b.metrics;
        m.orderCount = orderCountsByBrand.get(b.id)?.size || 0;
        m.storeCount = storeCountsByBrand.get(b.id)?.size || 0;
        m.grossProfit = m.revenue - m.cost;
        m.margin = m.revenue > 0 ? (m.grossProfit / m.revenue) * 100 : 0;

        // Simple 7-point trend for sparklines
        const brandItems = items?.filter(i => productBrandMap.get(i.product_id) === b.id);
        const trendMap: Record<string, number> = {};
        brandItems?.forEach(i => {
           const o = orders.find(ord => ord.id === i.order_id);
           if (o) {
             const date = new Date(o.created_at).toISOString().split('T')[0];
             trendMap[date] = (trendMap[date] || 0) + Number(i.total_price || 0);
           }
        });
        b.trend = Object.values(trendMap).slice(-7);
        if (b.trend.length < 2) b.trend = [0, b.metrics.revenue];

        return b;
      });

    } catch (err) {
      console.error('[IntelligenceService] Error in getBrandsIntelligence:', err);
      return [];
    }
  }

  /**
   * Get intelligence for all categories
   */
  static async getCategoriesIntelligence(options: BIFilterOptions): Promise<CategoryIntelligence[]> {
    try {
      // 1. Fetch categories
      const { data: categories, error: catError } = await supabase
        .from('categories')
        .select(`
          id, name, slug, parent_id,
          products (
            id, is_active, is_deleted, brand_id,
            central_inventory(stock_quantity, low_stock_threshold)
          )
        `);

      if (catError) throw catError;
      if (!categories) return [];

      // 2. Fetch orders
      const ordersQuery = this.getBaseOrderQuery(options);
      const { data: orders, error: orderError } = await ordersQuery;

      if (orderError) throw orderError;

      const catMap = new Map<string, CategoryIntelligence>();

      // Initialize categories
      categories.forEach((c: any) => {
        const productStats = {
          totalProducts: 0,
          activeProducts: 0,
        };

        (c.products || []).forEach((p: any) => {
          if (p.is_deleted) return;
          productStats.totalProducts++;
          if (p.is_active) productStats.activeProducts++;
        });

        catMap.set(c.id, {
          id: c.id,
          name: c.name,
          slug: c.slug,
          metrics: {
            ...this.emptyMetrics(),
            ...productStats,
            subcategories: categories.filter(child => child.parent_id === c.id).length
          }
        });
      });

      if (!orders || orders.length === 0) {
        return Array.from(catMap.values());
      }

      const orderIds = orders.map(o => o.id);

      // 3. Fetch order items
      const { data: items, error: itemError } = await supabase
        .from('order_items')
        .select('product_id, quantity, total_price, cost_price, order_id')
        .in('order_id', orderIds);

      if (itemError) throw itemError;

      // 4. Fetch product category mappings
      const soldProductIds = Array.from(new Set(items?.map(i => i.product_id).filter(Boolean))) as string[];
      const { data: soldProducts, error: prodError } = await supabase
        .from('products')
        .select('id, category_id, brand_id')
        .in('id', soldProductIds);

      if (prodError) throw prodError;

      const productCatMap = new Map(soldProducts?.map(p => [p.id, p.category_id]));
      const productBrandMap = new Map(soldProducts?.map(p => [p.id, p.brand_id]));

      // 5. Aggregate
      const brandsByCat = new Map<string, Set<string>>();
      const ordersByCat = new Map<string, Set<string>>();

      (items || []).forEach(item => {
        const catId = item.product_id ? productCatMap.get(item.product_id) : null;
        if (catId && catMap.has(catId)) {
          const c = catMap.get(catId)!;
          const m = c.metrics;
          const revenue = Number(item.total_price || 0);
          const cost = Number(item.cost_price || 0) * Number(item.quantity || 0);

          m.unitsSold += Number(item.quantity || 0);
          m.revenue += revenue;
          m.cost += cost;

          if (!ordersByCat.has(catId)) ordersByCat.set(catId, new Set());
          ordersByCat.get(catId)!.add(item.order_id);

          const brandId = item.product_id ? productBrandMap.get(item.product_id) : null;
          if (brandId) {
            if (!brandsByCat.has(catId)) brandsByCat.set(catId, new Set());
            brandsByCat.get(catId)!.add(brandId);
          }
        }
      });

      return Array.from(catMap.values()).map(c => {
        const m = c.metrics;
        m.orderCount = ordersByCat.get(c.id)?.size || 0;
        m.brandCount = brandsByCat.get(c.id)?.size || 0;
        m.grossProfit = m.revenue - m.cost;
        m.margin = m.revenue > 0 ? (m.grossProfit / m.revenue) * 100 : 0;

        // Simplified trend
        const catItems = items?.filter(i => productCatMap.get(i.product_id) === c.id);
        const trendMap: Record<string, number> = {};
        catItems?.forEach(i => {
           const o = orders.find(ord => ord.id === i.order_id);
           if (o) {
             const date = new Date(o.created_at).toISOString().split('T')[0];
             trendMap[date] = (trendMap[date] || 0) + Number(i.total_price || 0);
           }
        });
        c.trend = Object.values(trendMap).slice(-7);
        if (c.trend.length < 2) c.trend = [0, c.metrics.revenue];

        return c;
      });

    } catch (err) {
      console.error('[IntelligenceService] Error in getCategoriesIntelligence:', err);
      return [];
    }
  }

  static async getProductPerformance(options: BIFilterOptions): Promise<ProductPerformance[]> {
    try {
      const ordersQuery = this.getBaseOrderQuery(options);
      const { data: orders, error: orderError } = await ordersQuery;
      if (orderError || !orders || orders.length === 0) return [];

      const orderIds = orders.map(o => o.id);
      const { data: items, error: itemError } = await supabase
        .from('order_items')
        .select('product_id, product_name, quantity, total_price, cost_price, order_id')
        .in('order_id', orderIds);

      if (itemError || !items) throw itemError;

      const perfMap = new Map<string, ProductPerformance>();

      // 1. Initial aggregation from items
      items.forEach(item => {
        if (!item.product_id) return;
        if (!perfMap.has(item.product_id)) {
          perfMap.set(item.product_id, {
            id: item.product_id,
            name: item.product_name,
            sku: null,
            category_name: null,
            brand_name: null,
            unitsSold: 0,
            orderCount: 0,
            revenue: 0,
            cost: 0,
            grossProfit: 0,
            margin: 0,
            stock: 0,
            status: 'active'
          });
        }

        const p = perfMap.get(item.product_id)!;
        p.unitsSold += Number(item.quantity || 0);
        p.revenue += Number(item.total_price || 0);
        p.cost += Number(item.cost_price || 0) * Number(item.quantity || 0);
        p.orderCount++; // Items are unique per order usually, but we could use a set for precision
      });

      // 2. Enrich with product metadata
      const productIds = Array.from(perfMap.keys());
      const { data: products } = await supabase
        .from('products')
        .select(`
          id, sku, is_active,
          brands(name),
          categories(name),
          central_inventory(stock_quantity)
        `)
        .in('id', productIds);

      products?.forEach((p: any) => {
        const perf = perfMap.get(p.id);
        if (perf) {
          perf.sku = p.sku;
          perf.brand_name = p.brands?.name || null;
          perf.category_name = p.categories?.name || null;
          perf.status = p.is_active ? 'active' : 'inactive';
          perf.stock = p.central_inventory?.[0]?.stock_quantity || 0;
        }
      });

      return Array.from(perfMap.values()).map(p => {
        p.grossProfit = p.revenue - p.cost;
        p.margin = p.revenue > 0 ? (p.grossProfit / p.revenue) * 100 : 0;
        return p;
      }).sort((a, b) => b.revenue - a.revenue);

    } catch (err) {
      console.error('[IntelligenceService] Error in getProductPerformance:', err);
      return [];
    }
  }

  static async getProductIntelligence(options: BIFilterOptions): Promise<ProductIntelligenceReport> {
    try {
      const current = await this.buildProductIntelligenceSlice(options);
      const previousOptions = this.getPreviousPeriodOptions(options);
      const previous = await this.buildProductIntelligenceSlice(previousOptions);

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
          doubleHorseCategories: current.doubleHorseCategories
        },
        previous: {
          metrics: previous.metrics,
          products: previous.products
        },
        comparison: {
          revenue: delta(current.metrics.revenue, previous.metrics.revenue),
          units: delta(current.metrics.unitsSold, previous.metrics.unitsSold),
          profit: delta(current.metrics.grossProfit, previous.metrics.grossProfit),
          orderCount: delta(current.metrics.orderCount, previous.metrics.orderCount),
          margin: current.metrics.margin - previous.metrics.margin
        },
        quality: current.quality
      };
    } catch (err) {
      console.error('[IntelligenceService] Error in getProductIntelligence:', err);
      return this.emptyProductIntelligenceReport();
    }
  }

  static async getBrandDetail(brandId: string, options: BIFilterOptions): Promise<any | null> {
    try {
      const { data: brand, error: bErr } = await supabase
        .from('brands')
        .select('*')
        .eq('id', brandId)
        .single();

      if (bErr || !brand) return null;

      // 1. Get current period metrics
      const ordersQuery = this.getBaseOrderQuery(options);
      const { data: orders } = await ordersQuery;

      const orderIds = (orders || []).map(o => o.id);

      // Fetch items for this brand only
      const { data: items } = await supabase
        .from('order_items')
        .select(`
          quantity, total_price, cost_price, order_id,
          products!inner(id, name, sku, brand_id, category_id, is_active)
        `)
        .in('order_id', orderIds)
        .eq('products.brand_id', brandId);

      const metrics = this.emptyMetrics();
      const storePerformance = new Map<string, any>();
      const categoryDistribution = new Map<string, any>();
      const productPerformanceMap = new Map<string, any>();

      (items || []).forEach((item: any) => {
        const rev = Number(item.total_price || 0);
        const cost = Number(item.cost_price || 0) * Number(item.quantity || 0);
        const qty = Number(item.quantity || 0);

        metrics.revenue += rev;
        metrics.cost += cost;
        metrics.unitsSold += qty;

        const order = orders?.find(o => o.id === item.order_id);
        if (order?.store_id) {
          if (!storePerformance.has(order.store_id)) {
            storePerformance.set(order.store_id, { revenue: 0, units: 0, orders: new Set() });
          }
          const sp = storePerformance.get(order.store_id);
          sp.revenue += rev;
          sp.units += qty;
          sp.orders.add(order.id);
        }

        const catId = item.products?.category_id || 'uncategorized';
        if (!categoryDistribution.has(catId)) {
          categoryDistribution.set(catId, { revenue: 0, units: 0 });
        }
        categoryDistribution.get(catId).revenue += rev;
        categoryDistribution.get(catId).units += qty;

        const prodId = item.products?.id;
        if (prodId) {
          if (!productPerformanceMap.has(prodId)) {
            productPerformanceMap.set(prodId, { ...item.products, unitsSold: 0, revenue: 0, cost: 0, orderCount: 0 });
          }
          const pp = productPerformanceMap.get(prodId);
          pp.unitsSold += qty;
          pp.revenue += rev;
          pp.cost += cost;
          pp.orderCount++;
        }
      });

      metrics.orderCount = new Set((items || []).map(i => i.order_id)).size;
      metrics.storeCount = storePerformance.size;

      // 1b. Fetch Reference Data (Stores and Categories)
      const [storesRes, categoriesRes] = await Promise.all([
        supabase.from('stores').select('id, name'),
        supabase.from('categories').select('id, name')
      ]);
      const storeMap = new Map(storesRes.data?.map(s => [s.id, s.name]));
      const catMap = new Map(categoriesRes.data?.map(c => [c.id, c.name]));

      // 2. Get product counts
      const { data: products } = await supabase
        .from('products')
        .select('id, is_active, is_deleted, central_inventory(stock_quantity, low_stock_threshold)')
        .eq('brand_id', brandId)
        .eq('is_deleted', false);

      metrics.totalProducts = products?.length || 0;
      metrics.activeProducts = products?.filter(p => p.is_active).length || 0;
      products?.forEach(p => {
        const inv = p.central_inventory?.[0];
        if (inv) {
          const stock = inv.stock_quantity || 0;
          if (stock <= 0) metrics.outOfStockProducts++;
          else if (stock <= (inv.low_stock_threshold || 5)) metrics.lowStockProducts++;
        }
      });

      return {
        brand,
        metrics,
        storePerformance: Array.from(storePerformance.entries()).map(([id, data]) => ({
          storeId: id,
          storeName: storeMap.get(id) || 'Unknown Store',
          ...data,
          orderCount: data.orders.size
        })),
        categoryDistribution: Array.from(categoryDistribution.entries()).map(([id, data]) => ({
          categoryId: id,
          categoryName: catMap.get(id) || 'Uncategorized',
          ...data
        })),
        products: Array.from(productPerformanceMap.values()).map(p => ({
          ...p,
          categoryName: p.category_id ? catMap.get(p.category_id) : 'Uncategorized',
          grossProfit: p.revenue - p.cost,
          margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0
        })).sort((a, b) => b.revenue - a.revenue)
      };
    } catch (err) {
      console.error('[IntelligenceService] Error in getBrandDetail:', err);
      return null;
    }
  }

  static async getCategoryDetail(categoryId: string, options: BIFilterOptions): Promise<any | null> {
    try {
      const { data: category, error: cErr } = await supabase
        .from('categories')
        .select('*')
        .eq('id', categoryId)
        .single();

      if (cErr || !category) return null;

      const ordersQuery = this.getBaseOrderQuery(options);
      const { data: orders } = await ordersQuery;
      const orderIds = (orders || []).map(o => o.id);

      const { data: items } = await supabase
        .from('order_items')
        .select(`
          quantity, total_price, cost_price, order_id,
          products!inner(id, name, sku, brand_id, category_id, is_active)
        `)
        .in('order_id', orderIds)
        .eq('products.category_id', categoryId);

      const metrics = this.emptyMetrics();
      const brandContribution = new Map<string, any>();
      const productPerformanceMap = new Map<string, any>();

      (items || []).forEach((item: any) => {
        const rev = Number(item.total_price || 0);
        const cost = Number(item.cost_price || 0) * Number(item.quantity || 0);
        const qty = Number(item.quantity || 0);

        metrics.revenue += rev;
        metrics.cost += cost;
        metrics.unitsSold += qty;

        const brandId = item.products?.brand_id || 'unknown';
        if (!brandContribution.has(brandId)) {
          brandContribution.set(brandId, { revenue: 0, units: 0 });
        }
        brandContribution.get(brandId).revenue += rev;
        brandContribution.get(brandId).units += qty;

        const prodId = item.products?.id;
        if (prodId) {
          if (!productPerformanceMap.has(prodId)) {
            productPerformanceMap.set(prodId, { ...item.products, unitsSold: 0, revenue: 0, cost: 0, orderCount: 0 });
          }
          const pp = productPerformanceMap.get(prodId);
          pp.unitsSold += qty;
          pp.revenue += rev;
          pp.cost += cost;
          pp.orderCount++;
        }
      });

      metrics.orderCount = new Set((items || []).map(i => i.order_id)).size;

      // Fetch Brand names
      const brandIds = Array.from(brandContribution.keys());
      const { data: brandData } = await supabase.from('brands').select('id, name').in('id', brandIds);
      const brandMap = new Map(brandData?.map(b => [b.id, b.name]));

      const { data: products } = await supabase
        .from('products')
        .select('id, is_active, is_deleted, central_inventory(stock_quantity, low_stock_threshold)')
        .eq('category_id', categoryId)
        .eq('is_deleted', false);

      metrics.totalProducts = products?.length || 0;
      metrics.activeProducts = products?.filter(p => p.is_active).length || 0;

      return {
        category,
        metrics,
        brandContribution: Array.from(brandContribution.entries()).map(([id, data]) => ({
          brandId: id,
          brandName: brandMap.get(id) || 'Unknown Brand',
          ...data
        })),
        products: Array.from(productPerformanceMap.values()).map(p => ({
          ...p,
          brandName: p.brand_id ? brandMap.get(p.brand_id) : 'No Brand',
          grossProfit: p.revenue - p.cost,
          margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0
        })).sort((a, b) => b.revenue - a.revenue)
      };
    } catch (err) {
      console.error('[IntelligenceService] Error in getCategoryDetail:', err);
      return null;
    }
  }

  static async getTrendData(options: BIFilterOptions, entityId?: string, type?: 'brand' | 'category'): Promise<{ date: string; revenue: number; units: number; profit: number }[]> {
    try {
      const ordersQuery = this.getBaseOrderQuery(options);
      const { data: orders } = await ordersQuery;
      if (!orders || orders.length === 0) return [];

      const orderIds = orders.map(o => o.id);

      let itemsQuery = supabase
        .from('order_items')
        .select(`
          quantity, total_price, cost_price, order_id,
          products!inner(id, brand_id, category_id)
        `)
        .in('order_id', orderIds);

      if (type === 'brand' && entityId) {
        itemsQuery = itemsQuery.eq('products.brand_id', entityId);
      } else if (type === 'category' && entityId) {
        itemsQuery = itemsQuery.eq('products.category_id', entityId);
      }

      const { data: items } = await itemsQuery;
      if (!items || items.length === 0) return [];

      const groupedByDate: Record<string, { revenue: number; units: number; profit: number }> = {};

      items.forEach((item: any) => {
        const order = orders.find(o => o.id === item.order_id);
        if (!order) return;

        const date = new Date(order.created_at).toISOString().split('T')[0];
        if (!groupedByDate[date]) {
          groupedByDate[date] = { revenue: 0, units: 0, profit: 0 };
        }

        const rev = Number(item.total_price || 0);
        const cost = Number(item.cost_price || 0) * Number(item.quantity || 0);

        groupedByDate[date].revenue += rev;
        groupedByDate[date].units += Number(item.quantity || 0);
        groupedByDate[date].profit += rev - cost;
      });

      return Object.entries(groupedByDate).map(([date, data]) => ({
        date,
        ...data
      })).sort((a, b) => a.date.localeCompare(b.date));

    } catch (err) {
      console.error('[IntelligenceService] Error in getTrendData:', err);
      return [];
    }
  }

  static async getSpecialInsights(options: BIFilterOptions): Promise<{ type: string; title: string; products: any[] }[]> {
    try {
      const performance = await this.getProductPerformance(options);
      if (!performance || performance.length === 0) return [];

      const avgRevenue = performance.reduce((sum, p) => sum + p.revenue, 0) / performance.length;
      const avgMargin = performance.reduce((sum, p) => sum + p.margin, 0) / performance.length;

      const stars = performance.filter(p => p.revenue > avgRevenue && p.margin > avgMargin).slice(0, 5);
      const volumeDrivers = performance.filter(p => p.revenue > avgRevenue && p.margin <= avgMargin).slice(0, 5);
      const hiddenWinners = performance.filter(p => p.revenue <= avgRevenue && p.margin > avgMargin && p.unitsSold > 0).slice(0, 5);
      const problemProducts = performance.filter(p => p.revenue > 0 && p.margin < 10).slice(0, 5);

      return [
        { type: 'star', title: 'Stars (High Sales, High Margin)', products: stars },
        { type: 'volume', title: 'Volume Drivers (High Sales, Low Margin)', products: volumeDrivers },
        { type: 'hidden', title: 'Hidden Winners (Low Sales, High Margin)', products: hiddenWinners },
        { type: 'problem', title: 'Problem Products (Low Margin)', products: problemProducts },
      ];
    } catch (err) {
      console.error('[IntelligenceService] Error in getSpecialInsights:', err);
      return [];
    }
  }

  static async getDataQualityReport(): Promise<{ issues: string[]; counts: Record<string, number> }> {
    try {
      // Fetch product IDs that ARE in inventory to exclude them
      const { data: invData } = await supabase.from('central_inventory').select('product_id');
      const invIds = (invData || []).map(i => i.product_id);

      const [
        { count: noBrand },
        { count: noCategory },
        { count: noCost },
        { count: noPrice },
        { count: noInventory }
      ] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }).is('brand_id', null).is('is_deleted', false),
        supabase.from('products').select('*', { count: 'exact', head: true }).is('category_id', null).is('is_deleted', false),
        supabase.from('products').select('*', { count: 'exact', head: true }).is('cost_price', null).is('is_deleted', false),
        supabase.from('products').select('*', { count: 'exact', head: true }).lte('price', 0).is('is_deleted', false),
        supabase.from('products').select('id', { count: 'exact', head: true })
          .not('id', 'in', `(${invIds.length > 0 ? invIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
          .is('is_deleted', false)
      ]);

      const counts = {
        noBrand: noBrand || 0,
        noCategory: noCategory || 0,
        noCost: noCost || 0,
        noPrice: noPrice || 0,
        noInventory: noInventory || 0
      };

      const issues: string[] = [];
      if (counts.noBrand > 0) issues.push(`${counts.noBrand} products are missing brand assignment.`);
      if (counts.noCategory > 0) issues.push(`${counts.noCategory} products are missing category assignment.`);
      if (counts.noCost > 0) issues.push(`${counts.noCost} products are missing purchase cost data.`);
      if (counts.noPrice > 0) issues.push(`${counts.noPrice} products have zero or negative price.`);
      if (counts.noInventory > 0) issues.push(`${counts.noInventory} products have no inventory record.`);

      return { issues, counts };
    } catch (err) {
      console.error('[IntelligenceService] Error in getDataQualityReport:', err);
      return { issues: [], counts: {} as any };
    }
  }

  static getDateRange(range: string): { start?: Date; end?: Date } {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    let start = new Date();

    switch (range) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        break;
      case '7days':
        start.setDate(now.getDate() - 7);
        break;
      case '30days':
        start.setDate(now.getDate() - 30);
        break;
      case '90days':
        start.setDate(now.getDate() - 90);
        break;
      case '6months':
        start.setMonth(now.getMonth() - 6);
        break;
      case '12months':
        start.setFullYear(now.getFullYear() - 1);
        break;
      case 'all':
        return {};
      default:
        start.setDate(now.getDate() - 30);
    }

    return { start, end };
  }

  private static async buildProductIntelligenceSlice(options: BIFilterOptions): Promise<ProductIntelligenceReport['current'] & { quality: ProductIntelligenceReport['quality'] }> {
    const metrics = this.emptyMetrics();
    const quality = { unmappedItems: 0, zeroCostItems: 0, productsWithoutBrand: 0, productsWithoutCategory: 0 };

    const ordersQuery = this.getBaseOrderQuery(options);
    const { data: orders, error: orderError } = await ordersQuery;
    if (orderError || !orders || orders.length === 0) {
      return {
        metrics,
        products: [],
        brandCategory: [],
        brands: [],
        categories: [],
        daily: [],
        riceBrandTrends: [],
        doubleHorseCategories: [],
        quality
      };
    }

    const orderIds = orders.map(o => o.id);
    const orderMap = new Map(orders.map((order: any) => [order.id, order]));

    const { data: items, error: itemError } = await supabase
      .from('order_items')
      .select('product_id, product_name, quantity, total_price, cost_price, order_id, brand, sku')
      .in('order_id', orderIds);

    if (itemError || !items) throw itemError;

    const productIds = Array.from(new Set(items.map((item: any) => item.product_id).filter(Boolean))) as string[];
    const { data: products } = productIds.length
      ? await supabase
        .from('products')
        .select(`
          id, name, sku, is_active, brand_id, category_id, brand, category, category_name,
          brands(id, name),
          categories(id, name),
          central_inventory(stock_quantity)
        `)
        .in('id', productIds)
      : { data: [] as any[] };

    const productMap = new Map((products || []).map((product: any) => [product.id, product]));
    const productPerformance = new Map<string, ProductPerformance & { orders: Set<string> }>();
    const brandGroups = new Map<string, ProductIntelligenceGroup & { orders: Set<string> }>();
    const categoryGroups = new Map<string, ProductIntelligenceGroup & { orders: Set<string> }>();
    const matrixGroups = new Map<string, ProductIntelligenceGroup & { brandId: string; brandName: string; categoryId: string; categoryName: string; orders: Set<string> }>();
    const dailyGroups = new Map<string, ProductIntelligenceTrendPoint>();
    const riceTrendGroups = new Map<string, ProductIntelligenceGroup & { trend: Map<string, ProductIntelligenceTrendPoint>; orders: Set<string> }>();
    const doubleHorseGroups = new Map<string, ProductIntelligenceGroup & { orders: Set<string> }>();
    const orderSet = new Set<string>();
    const storeSet = new Set<string>();

    const ensureGroup = <T extends ProductIntelligenceGroup & { orders: Set<string> }>(map: Map<string, T>, id: string, name: string, extra: Omit<T, keyof ProductIntelligenceGroup | 'orders'> = {} as any): T => {
      if (!map.has(id)) {
        map.set(id, {
          id,
          name,
          revenue: 0,
          units: 0,
          profit: 0,
          orderCount: 0,
          margin: 0,
          orders: new Set<string>(),
          ...extra
        } as T);
      }
      return map.get(id)!;
    };

    const addToGroup = (group: ProductIntelligenceGroup & { orders: Set<string> }, revenue: number, units: number, profit: number, orderId: string) => {
      group.revenue += revenue;
      group.units += units;
      group.profit += profit;
      group.orders.add(orderId);
    };

    items.forEach((item: any) => {
      const product = item.product_id ? productMap.get(item.product_id) : null;
      const order = orderMap.get(item.order_id);
      const quantity = Number(item.quantity || 0);
      const revenue = Number(item.total_price || 0);
      const cost = Number(item.cost_price || 0) * quantity;
      const profit = revenue - cost;
      const date = order?.created_at ? new Date(order.created_at).toISOString().slice(0, 10) : 'unknown';

      if (!item.product_id || !product) quality.unmappedItems++;
      if (!Number(item.cost_price || 0)) quality.zeroCostItems++;
      if (product && !product.brand_id && !product.brand && !product.brands?.name) quality.productsWithoutBrand++;
      if (product && !product.category_id && !product.category && !product.category_name && !product.categories?.name) quality.productsWithoutCategory++;

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
            category_name: product?.categories?.name || product?.category_name || product?.category || null,
            brand_name: product?.brands?.name || product?.brand || item.brand || null,
            unitsSold: 0,
            orderCount: 0,
            revenue: 0,
            cost: 0,
            grossProfit: 0,
            margin: 0,
            stock: Number(product?.central_inventory?.[0]?.stock_quantity || 0),
            status: product?.is_active === false ? 'inactive' : 'active',
            orders: new Set<string>()
          });
        }
        const performance = productPerformance.get(item.product_id)!;
        performance.unitsSold += quantity;
        performance.revenue += revenue;
        performance.cost += cost;
        performance.grossProfit += profit;
        performance.orders.add(item.order_id);
      }

      const brandId = product?.brand_id || `brand:${product?.brand || item.brand || 'No Brand'}`;
      const brandName = product?.brands?.name || product?.brand || item.brand || 'No Brand';
      const categoryId = product?.category_id || `category:${product?.category_name || product?.category || 'Uncategorized'}`;
      const categoryName = product?.categories?.name || product?.category_name || product?.category || 'Uncategorized';

      addToGroup(ensureGroup(brandGroups, brandId, brandName), revenue, quantity, profit, item.order_id);
      addToGroup(ensureGroup(categoryGroups, categoryId, categoryName), revenue, quantity, profit, item.order_id);
      addToGroup(ensureGroup(matrixGroups, `${brandId}:${categoryId}`, `${brandName} / ${categoryName}`, { brandId, brandName, categoryId, categoryName }), revenue, quantity, profit, item.order_id);

      const haystack = `${product?.name || item.product_name || ''} ${categoryName}`.toLowerCase();
      if (haystack.includes('rice') || haystack.includes('matta') || haystack.includes('ponni') || haystack.includes('palakkadan')) {
        const rice = ensureGroup(riceTrendGroups, brandId, brandName, { trend: new Map<string, ProductIntelligenceTrendPoint>() });
        addToGroup(rice, revenue, quantity, profit, item.order_id);
        const trendPoint = rice.trend.get(date) || { date, revenue: 0, units: 0, profit: 0 };
        trendPoint.revenue += revenue;
        trendPoint.units += quantity;
        trendPoint.profit += profit;
        rice.trend.set(date, trendPoint);
      }

      if (brandName.toLowerCase().includes('double horse')) {
        addToGroup(ensureGroup(doubleHorseGroups, categoryId, categoryName), revenue, quantity, profit, item.order_id);
      }
    });

    metrics.orderCount = orderSet.size;
    metrics.storeCount = storeSet.size;
    metrics.grossProfit = metrics.revenue - metrics.cost;
    metrics.margin = metrics.revenue > 0 ? (metrics.grossProfit / metrics.revenue) * 100 : 0;

    const finalize = <T extends ProductIntelligenceGroup & { orders?: Set<string> }>(rows: T[]) => rows.map(row => {
      const orderCount = row.orders?.size || row.orderCount || 0;
      const margin = row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0;
      const { orders: _orders, ...rest } = row as any;
      return { ...rest, orderCount, margin };
    });

    const productsOut = Array.from(productPerformance.values()).map(product => {
      const { orders, ...rest } = product;
      return {
        ...rest,
        orderCount: orders.size,
        margin: product.revenue > 0 ? (product.grossProfit / product.revenue) * 100 : 0
      };
    }).sort((a, b) => b.revenue - a.revenue);

    const riceBrandTrends = Array.from(riceTrendGroups.values()).map(row => {
      const finalized = finalize([row])[0];
      return {
        ...finalized,
        trend: Array.from(row.trend.values()).sort((a, b) => a.date.localeCompare(b.date))
      };
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
      quality
    };
  }

  private static getPreviousPeriodOptions(options: BIFilterOptions): BIFilterOptions {
    if (!options.startDate || !options.endDate) return { ...options };
    const duration = options.endDate.getTime() - options.startDate.getTime();
    if (!Number.isFinite(duration) || duration <= 0) return { ...options };
    return {
      ...options,
      startDate: new Date(options.startDate.getTime() - duration - 1),
      endDate: new Date(options.startDate.getTime() - 1)
    };
  }

  private static emptyProductIntelligenceReport(): ProductIntelligenceReport {
    const metrics = this.emptyMetrics();
    return {
      current: {
        metrics,
        products: [],
        brandCategory: [],
        brands: [],
        categories: [],
        daily: [],
        riceBrandTrends: [],
        doubleHorseCategories: []
      },
      previous: {
        metrics: this.emptyMetrics(),
        products: []
      },
      comparison: {
        revenue: 0,
        units: 0,
        profit: 0,
        orderCount: 0,
        margin: 0
      },
      quality: {
        unmappedItems: 0,
        zeroCostItems: 0,
        productsWithoutBrand: 0,
        productsWithoutCategory: 0
      }
    };
  }

  private static emptyMetrics(): MetricSet {
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
      storeCount: 0
    };
  }
}

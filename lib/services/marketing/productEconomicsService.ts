import { supabase } from '@/lib/supabase';

export type MarginHealth = 'healthy' | 'watch' | 'low' | 'negative';
export type ProductRole = 'traffic_driver' | 'profit_driver' | 'repeat_driver' | 'basket_builder' | 'clearance' | 'strategic';

export interface ProductEconomics {
  product_id: string;
  name: string;
  current_price: number;
  cost_price: number;
  gross_profit: number;
  margin_percent: number;
  health: MarginHealth;
  role: ProductRole;
  score: number;
  sales_30d: number;
  store_id?: string | null;
}

export const productEconomicsService = {
  /**
   * Calculate full economics for a specific product.
   * Sales and price are store-scoped when a store is selected. Cost remains the
   * canonical CentralHub product cost until a store-specific cost model exists.
   */
  async calculateEconomics(productId: string, storeId?: string | null): Promise<ProductEconomics | null> {
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, name, price, cost_price, min_margin, target_margin')
      .eq('id', productId)
      .maybeSingle();

    if (productError || !product) return null;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let salesQuery = supabase
      .from('order_items')
      .select('quantity, total_price, orders!inner(payment_status, order_status, created_at, store_id)')
      .eq('product_id', productId)
      .eq('orders.payment_status', 'paid')
      .not('orders.order_status', 'in', '("cancelled","refunded")')
      .gte('orders.created_at', thirtyDaysAgo.toISOString());

    if (storeId) {
      salesQuery = salesQuery.eq('orders.store_id', storeId);
    }

    const [{ data: sales, error: salesError }, storeProductResult] = await Promise.all([
      salesQuery,
      storeId
        ? supabase
            .from('store_products')
            .select('price_override, is_active')
            .eq('product_id', productId)
            .eq('store_id', storeId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
    ]);

    if (salesError) {
      console.error('[ProductEconomics] Error fetching sales:', salesError);
      return null;
    }

    const unitsSold = (sales || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);

    const basePrice = Number(product.price || 0);
    const overridePrice = Number(storeProductResult.data?.price_override || 0);
    const price = storeId && overridePrice > 0 ? overridePrice : basePrice;
    const cost = Number(product.cost_price || 0);

    const grossProfit = price - cost;
    const marginPercent = price > 0 ? (grossProfit / price) * 100 : 0;

    const minMargin = Number(product.min_margin || 15);
    let health: MarginHealth = 'healthy';
    if (grossProfit < 0) health = 'negative';
    else if (marginPercent < minMargin) health = 'low';
    else if (marginPercent < minMargin + 5) health = 'watch';

    let role: ProductRole = 'strategic';
    if (unitsSold > 50 && marginPercent < 20) role = 'traffic_driver';
    else if (marginPercent > 40) role = 'profit_driver';
    else if (unitsSold < 5 && marginPercent < 15) role = 'clearance';

    const marginComponent = Math.max(0, Math.min(1, marginPercent / 50)) * 40;
    const volumeComponent = Math.min(1, unitsSold / 100) * 30;
    const gpComponent = Math.max(0, Math.min(1, grossProfit / 10)) * 30;
    const score = Math.round(marginComponent + volumeComponent + gpComponent);

    return {
      product_id: product.id,
      name: product.name,
      current_price: price,
      cost_price: cost,
      gross_profit: grossProfit,
      margin_percent: marginPercent,
      health,
      role,
      score,
      sales_30d: unitsSold,
      store_id: storeId || null,
    };
  },

  /** Refresh the economics cache using the live store-aware uniqueness model. */
  async refreshCache(limit: number = 1000, storeId?: string | null) {
    let productQuery = supabase
      .from('products')
      .select('id')
      .eq('is_deleted', false)
      .eq('is_active', true)
      .order('id')
      .limit(limit);

    if (storeId) {
      const { data: scopedProducts, error: scopeError } = await supabase
        .from('store_products')
        .select('product_id')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .limit(limit);

      if (scopeError) throw scopeError;
      const productIds = (scopedProducts || []).map((row: any) => row.product_id).filter(Boolean);
      if (productIds.length === 0) return { processed: 0, failed: 0 };
      productQuery = productQuery.in('id', productIds);
    }

    const { data: products, error: productsError } = await productQuery;
    if (productsError) throw productsError;
    if (!products) return { processed: 0, failed: 0 };

    let processed = 0;
    let failed = 0;

    for (const p of products) {
      const econ = await this.calculateEconomics(p.id, storeId);
      if (!econ) {
        failed += 1;
        continue;
      }

      const { error } = await supabase.from('product_economics').upsert({
        product_id: p.id,
        store_id: storeId || null,
        current_price: econ.current_price,
        cost_price: econ.cost_price,
        gross_profit_per_unit: econ.gross_profit,
        margin_percent: econ.margin_percent,
        units_sold_30d: econ.sales_30d,
        profitability_score: econ.score,
        margin_health: econ.health,
        product_role: econ.role,
        last_calculated_at: new Date().toISOString(),
      }, { onConflict: 'product_id,store_id' });

      if (error) {
        console.error('[ProductEconomics] Cache upsert failed:', error);
        failed += 1;
      } else {
        processed += 1;
      }
    }

    return { processed, failed };
  },
};

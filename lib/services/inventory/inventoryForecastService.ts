import { supabase } from '@/lib/supabase';

export type RiskLevel = 'healthy' | 'risk' | 'critical' | 'overstock' | 'slow_moving';

export interface ForecastSnapshot {
  product_id: string;
  avg_daily_sales: number;
  days_of_cover: number;
  risk_level: RiskLevel;
  confidence: 'high' | 'medium' | 'low';
  stock_quantity: number;
  store_id?: string | null;
}

export const inventoryForecastService = {
  /**
   * Calculate forecast for a product using paid, non-cancelled sales.
   * Sales are strictly store-scoped when requested. Stock remains the canonical
   * CentralHub inventory because CentralHub currently has one master stock row per product.
   */
  async calculateForecast(productId: string, storeId?: string | null): Promise<ForecastSnapshot | null> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let query = supabase
      .from('order_items')
      .select('quantity, orders!inner(payment_status, order_status, created_at, store_id)')
      .eq('product_id', productId)
      .eq('orders.payment_status', 'paid')
      .not('orders.order_status', 'in', '("cancelled","refunded")')
      .gte('orders.created_at', thirtyDaysAgo.toISOString());

    if (storeId) {
      query = query.eq('orders.store_id', storeId);
    }

    const { data: sales, error } = await query;

    if (error) {
      console.error('[InventoryForecast] Error fetching sales:', error);
      return null;
    }

    const totalSold = (sales || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
    const avgDailySales = totalSold / 30;

    const { data: inv, error: inventoryError } = await supabase
      .from('central_inventory')
      .select('stock_quantity, low_stock_threshold')
      .eq('product_id', productId)
      .maybeSingle();

    if (inventoryError) {
      console.error('[InventoryForecast] Error fetching inventory:', inventoryError);
      return null;
    }

    const currentStock = Number(inv?.stock_quantity || 0);
    const threshold = Number(inv?.low_stock_threshold || 5);
    const daysOfCover = avgDailySales > 0 ? currentStock / avgDailySales : (currentStock > 0 ? 999 : 0);

    let risk_level: RiskLevel = 'healthy';
    if (currentStock <= 0) {
      risk_level = 'critical';
    } else if (daysOfCover < 7 || currentStock <= threshold) {
      risk_level = 'risk';
    } else if (daysOfCover > 90) {
      risk_level = 'overstock';
    } else if (avgDailySales < 0.1) {
      risk_level = 'slow_moving';
    }

    const salesCount = sales?.length || 0;
    const confidence: ForecastSnapshot['confidence'] = salesCount > 5 ? 'high' : salesCount > 0 ? 'medium' : 'low';

    return {
      product_id: productId,
      avg_daily_sales: avgDailySales,
      days_of_cover: daysOfCover,
      risk_level,
      confidence,
      stock_quantity: currentStock,
      store_id: storeId || null,
    };
  },

  /** Refresh the forecast cache using the live store-aware uniqueness model. */
  async refreshAllForecasts(limit: number = 1000, storeId?: string | null) {
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
      const snapshot = await this.calculateForecast(p.id, storeId);
      if (!snapshot) {
        failed += 1;
        continue;
      }

      const { error: upsertError } = await supabase.from('inventory_forecasts').upsert({
        product_id: p.id,
        store_id: storeId || null,
        avg_daily_sales: snapshot.avg_daily_sales,
        sales_velocity_30d: snapshot.avg_daily_sales * 30,
        days_of_cover: snapshot.days_of_cover,
        risk_level: snapshot.risk_level,
        confidence_level: snapshot.confidence,
        calculated_at: new Date().toISOString(),
      }, { onConflict: 'product_id,store_id' });

      if (upsertError) {
        console.error('[InventoryForecast] Cache upsert failed:', upsertError);
        failed += 1;
      } else {
        processed += 1;
      }
    }

    return { processed, failed };
  },
};

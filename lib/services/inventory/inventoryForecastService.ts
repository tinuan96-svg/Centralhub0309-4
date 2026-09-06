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
   * Calculate forecast for a specific product based on last 30 days of paid orders.
   * Hardened: Supports strict store-scoping.
   */
  async calculateForecast(productId: string, storeId?: string | null): Promise<ForecastSnapshot | null> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Fetch items sold in the last 30 days
    let query = supabase
      .from('order_items')
      .select('quantity, orders!inner(payment_status, created_at, store_id)')
      .eq('product_id', productId)
      .eq('orders.payment_status', 'paid')
      .gte('orders.created_at', thirtyDaysAgo.toISOString());

    if (storeId) {
      query = query.eq('orders.store_id', storeId);
    }

    const { data: sales, error } = await query;

    if (error) {
      console.error('[InventoryForecast] Error fetching sales:', error);
      return null;
    }

    const totalSold = sales?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
    const avgDailySales = totalSold / 30;

    // 2. Get current stock from the canonical CentralHub inventory.
    const { data: inv } = await supabase.from('central_inventory').select('stock_quantity, low_stock_threshold').eq('product_id', productId).maybeSingle();
    const currentStock = inv?.stock_quantity || 0;
    const threshold = inv?.low_stock_threshold || 5;

    // 3. Days of cover
    const daysOfCover = avgDailySales > 0 ? Math.floor(currentStock / avgDailySales) : (currentStock > 0 ? 999 : 0);

    // 4. Determine Risk
    let risk_level: RiskLevel = 'healthy';
    if (currentStock <= 0) {
      risk_level = 'critical';
    } else if (daysOfCover < 7 || currentStock <= threshold) {
      risk_level = 'risk';
    } else if (daysOfCover > 90) {
      risk_level = 'overstock';
    } else if (avgDailySales < 0.1 && currentStock > 0) {
      risk_level = 'slow_moving';
    }

    // 5. Confidence logic
    const confidence = sales && sales.length > 5 ? 'high' : sales && sales.length > 0 ? 'medium' : 'low';

    return {
      product_id: productId,
      avg_daily_sales: avgDailySales,
      days_of_cover: daysOfCover,
      risk_level,
      confidence,
      stock_quantity: currentStock,
      store_id: storeId || null
    };
  },

  /**
   * Refresh all forecasts (Phase 3C background-compatible)
   */
  async refreshAllForecasts(limit: number = 20, storeId?: string | null) {
    const { data: products } = await supabase.from('products').select('id').limit(limit);
    if (!products) return;

    for (const p of products) {
      const snapshot = await this.calculateForecast(p.id, storeId);
      if (snapshot) {
        await supabase.from('inventory_forecasts').upsert({
          product_id: p.id,
          avg_daily_sales: snapshot.avg_daily_sales,
          sales_velocity_30d: snapshot.avg_daily_sales * 30,
          days_of_cover: snapshot.days_of_cover,
          risk_level: snapshot.risk_level,
          confidence_level: snapshot.confidence,
          calculated_at: new Date().toISOString()
        }, { onConflict: 'product_id' });
      }
    }
  }
};

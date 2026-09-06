import { supabase } from '@/lib/supabase';
import { ProfitAnalysisService } from '../profitAnalysisService';

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
   * Hardened: Supports strict store-scoping.
   */
  async calculateEconomics(productId: string, storeId?: string | null): Promise<ProductEconomics | null> {
    // 1. Fetch product basic info
    const { data: product } = await supabase
      .from('products')
      .select('id, name, price, cost_price, min_margin, target_margin')
      .eq('id', productId)
      .single();

    if (!product) return null;

    // 2. Fetch sales history (30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let salesQuery = supabase
      .from('order_items')
      .select('quantity, total_price, orders!inner(payment_status, created_at, store_id)')
      .eq('product_id', productId)
      .eq('orders.payment_status', 'paid')
      .gte('orders.created_at', thirtyDaysAgo.toISOString());

    if (storeId) {
      salesQuery = salesQuery.eq('orders.store_id', storeId);
    }

    const { data: sales } = await salesQuery;

    const unitsSold = sales?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
    const revenue30d = sales?.reduce((sum, item) => sum + (item.total_price || 0), 0) || 0;

    // 3. Financial Calculations (Reuse core logic)
    // Hardening: Use store-specific price/cost if available (for future multi-store pricing)
    let price = product.price || 0;
    let cost = product.cost_price || 0;


    const grossProfit = price - cost;
    const marginPercent = price > 0 ? (grossProfit / price) * 100 : 0;

    // 4. Margin Health Classification
    const minMargin = product.min_margin || 15;
    let health: MarginHealth = 'healthy';
    if (grossProfit < 0) health = 'negative';
    else if (marginPercent < minMargin) health = 'low';
    else if (marginPercent < (minMargin + 5)) health = 'watch';

    // 5. Product Role Heuristics
    let role: ProductRole = 'strategic';
    if (unitsSold > 50 && marginPercent < 20) role = 'traffic_driver';
    else if (marginPercent > 40) role = 'profit_driver';
    else if (unitsSold < 5 && marginPercent < 15) role = 'clearance';

    // 6. Profitability Score (0-100)
    const marginComponent = Math.min(1, marginPercent / 50) * 40;
    const volumeComponent = Math.min(1, unitsSold / 100) * 30;
    const gpComponent = Math.min(1, grossProfit / 10) * 30;
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
      store_id: storeId || null
    };
  },

  /**
   * Refresh the economics cache for multiple products.
   */
  async refreshCache(limit: number = 20, storeId?: string | null) {
    const { data: products } = await supabase.from('products').select('id').limit(limit);
    if (!products) return;

    for (const p of products) {
      const econ = await this.calculateEconomics(p.id, storeId);
      if (econ) {
        await supabase.from('product_economics').upsert({
          product_id: p.id,
          current_price: econ.current_price,
          cost_price: econ.cost_price,
          gross_profit_per_unit: econ.gross_profit,
          margin_percent: econ.margin_percent,
          units_sold_30d: econ.sales_30d,
          profitability_score: econ.score,
          margin_health: econ.health,
          product_role: econ.role,
          last_calculated_at: new Date().toISOString()
        }, { onConflict: 'product_id' });
      }
    }
  }
};

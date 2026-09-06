import { supabase } from '@/lib/supabase';
import { ProfitAnalysisService } from '../profitAnalysisService';
import { inventoryForecastService } from '../inventory/inventoryForecastService';
import { productEconomicsService } from './productEconomicsService';
import { intelligenceService } from './intelligenceService';

export interface DecisionSnapshot {
  product_id: string;
  store_id: string;

  // Financials
  current_price: number;
  cost_price: number;
  margin_percent: number;
  units_sold_30d: number;

  // Inventory
  stock_quantity: number;
  days_of_cover: number;
  stock_risk: string;

  // Competitor
  lowest_competitor_price?: number;
  price_gap_percent?: number;

  // Marketing
  active_campaign_id?: string;
  attribution_revenue_30d: number;

  // Metadata
  freshness_score: number;
  generated_at: string;
}

export const decisionSnapshotService = {
  /**
   * Construct a coordinated business snapshot for a product across all systems.
   */
  async getSnapshot(productId: string, storeId: string): Promise<DecisionSnapshot | null> {
    const [
      econ,
      forecast,
      { data: competitor },
      { data: campaign }
    ] = await Promise.all([
      productEconomicsService.calculateEconomics(productId),
      inventoryForecastService.calculateForecast(productId),
      supabase.from('competitor_prices').select('price').eq('product_id', productId).order('price', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('campaign_stores').select('campaign_id').eq('store_id', storeId).limit(1).maybeSingle()
    ]);

    if (!econ || !forecast) return null;

    const compPrice = competitor?.price;
    const priceGap = compPrice ? ((econ.current_price - compPrice) / compPrice) * 100 : undefined;

    return {
      product_id: productId,
      store_id: storeId,
      current_price: econ.current_price,
      cost_price: econ.cost_price,
      margin_percent: econ.margin_percent,
      units_sold_30d: econ.sales_30d,
      stock_quantity: forecast.product_id ? (forecast as any).currentStock : 0, // Fallback if interface differs slightly
      days_of_cover: forecast.days_of_cover,
      stock_risk: forecast.risk_level,
      lowest_competitor_price: compPrice,
      price_gap_percent: priceGap,
      active_campaign_id: campaign?.campaign_id,
      attribution_revenue_30d: econ.sales_30d * econ.current_price, // Approximation for Phase 4
      freshness_score: 1.0, // Logic for decay would go here
      generated_at: new Date().toISOString()
    };
  }
};

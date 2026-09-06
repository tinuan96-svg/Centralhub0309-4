import { supabase } from '@/lib/supabase';
import { inventoryForecastService } from '../inventory/inventoryForecastService';

export interface CampaignInventoryImpact {
  campaign_id: string;
  product_id: string;
  current_stock: number;
  expected_uplift_percent: number;
  expected_campaign_demand: number;
  projected_stock_after: number;
  stockout_risk: 'LOW' | 'MEDIUM' | 'HIGH';
  safety_score: number;
  recommended_purchase_qty: number;
}

export const campaignInventoryImpactService = {
  /**
   * Calculate the stock impact for a specific campaign and product.
   */
  async calculateImpact(campaignId: string, productId: string, upliftPercent: number): Promise<CampaignInventoryImpact | null> {
    // 1. Get base forecast
    const forecast = await inventoryForecastService.calculateForecast(productId);
    if (!forecast) return null;

    // 2. Get current stock
    const { data: inv } = await supabase
      .from('central_inventory')
      .select('stock_quantity')
      .eq('product_id', productId)
      .maybeSingle();

    const currentStock = inv?.stock_quantity || 0;

    // 3. Estimate campaign demand (assuming 30 day campaign window)
    const base30DayDemand = forecast.avg_daily_sales * 30;
    const expectedCampaignDemand = base30DayDemand * (1 + upliftPercent / 100);
    const projectedStockAfter = currentStock - expectedCampaignDemand;

    // 4. Calculate Safety Score (0-100)
    // Score = (Current Stock / Expected Demand) * 100, capped at 100
    let safetyScore = 0;
    if (expectedCampaignDemand > 0) {
      safetyScore = Math.min(100, Math.max(0, (currentStock / expectedCampaignDemand) * 100));
    } else {
      safetyScore = 100;
    }

    // 5. Stockout Risk
    let stockoutRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (safetyScore < 50 || projectedStockAfter < 0) {
      stockoutRisk = 'HIGH';
    } else if (safetyScore < 80) {
      stockoutRisk = 'MEDIUM';
    }

    // 6. Recommended Purchase Qty
    const recommendedPurchaseQty = projectedStockAfter < 20 ? Math.ceil(Math.abs(projectedStockAfter) + 20) : 0;

    return {
      campaign_id: campaignId,
      product_id: productId,
      current_stock: currentStock,
      expected_uplift_percent: upliftPercent,
      expected_campaign_demand: Math.ceil(expectedCampaignDemand),
      projected_stock_after: Math.ceil(projectedStockAfter),
      stockout_risk: stockoutRisk,
      safety_score: Math.round(safetyScore),
      recommended_purchase_qty: recommendedPurchaseQty
    };
  }
};

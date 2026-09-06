import { supabase } from '@/lib/supabase';
import { campaignInventoryImpactService } from './campaignInventoryImpactService';
import { inventoryForecastService } from '../inventory/inventoryForecastService';

export type OpportunityType = 'SAFE_TO_PROMOTE' | 'PROMOTE_WITH_REPLENISHMENT' | 'DO_NOT_PROMOTE' | 'CLEARANCE_OPPORTUNITY';

export interface MarketingOpportunity {
  product_id: string;
  product_name: string;
  opportunity_type: OpportunityType;
  stock: number;
  forecast_30d: number;
  margin_percent: number;
  safety_score: number;
  recommended_qty: number;
}

export const campaignOpportunityService = {
  /**
   * Classify a product for marketing opportunities.
   */
  async getOpportunity(productId: string): Promise<MarketingOpportunity | null> {
    // 1. Get product info
    const { data: product } = await supabase
      .from('products')
      .select('name, price, cost_price')
      .eq('id', productId)
      .single();

    if (!product) return null;

    const marginPercent = product.price > 0 ? ((product.price - (product.cost_price || 0)) / product.price) * 100 : 0;

    // 2. Get impact for a hypothetical 25% uplift campaign
    const impact = await campaignInventoryImpactService.calculateImpact('hypothetical', productId, 25);
    if (!impact) return null;

    // 3. Classification logic
    let type: OpportunityType = 'SAFE_TO_PROMOTE';

    if (impact.current_stock > impact.expected_campaign_demand * 3) {
      // Overstock condition (roughly 3x campaign demand)
      type = 'CLEARANCE_OPPORTUNITY';
    } else if (impact.safety_score < 40 || marginPercent < 5) {
      type = 'DO_NOT_PROMOTE';
    } else if (impact.safety_score < 80) {
      type = 'PROMOTE_WITH_REPLENISHMENT';
    }

    return {
      product_id: productId,
      product_name: product.name,
      opportunity_type: type,
      stock: impact.current_stock,
      forecast_30d: impact.expected_campaign_demand,
      margin_percent: Math.round(marginPercent),
      safety_score: impact.safety_score,
      recommended_qty: impact.recommended_purchase_qty
    };
  },

  /**
   * Scan products for all opportunities.
   */
  async getAllOpportunities(limit: number = 20, storeId?: string | null): Promise<MarketingOpportunity[]> {
    let query = supabase.from('products').select('id');

    const { data: products } = await query.limit(limit);
    if (!products) return [];

    const opportunities: MarketingOpportunity[] = [];
    for (const p of products) {
      const opp = await this.getOpportunity(p.id);
      if (opp) opportunities.push(opp);
    }

    return opportunities;
  }
};

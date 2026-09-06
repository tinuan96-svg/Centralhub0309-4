import { supabase } from '@/lib/supabase';
import { productEconomicsService } from './productEconomicsService';

export interface PriceOpportunity {
  product_id: string;
  product_name: string;
  type: 'INCREASE' | 'DECREASE' | 'MAINTAIN' | 'PROTECT_MARGIN';
  reason: string;
  current_price: number;
  proposed_price: number;
  margin_impact_percent: number;
  competitor_gap_percent?: number;
}

export const priceOpportunityService = {
  /**
   * Evaluate pricing opportunities for a product.
   */
  async getOpportunity(productId: string): Promise<PriceOpportunity | null> {
    // 1. Get Economics
    const econ = await productEconomicsService.calculateEconomics(productId);
    if (!econ) return null;

    // 2. Get Competitor Context
    const { data: competitor } = await supabase
      .from('competitor_prices')
      .select('price')
      .eq('product_id', productId)
      .order('price', { ascending: true })
      .limit(1)
      .maybeSingle();

    const compPrice = competitor?.price;
    const currentPrice = econ.current_price;
    const margin = econ.margin_percent;

    // 3. Pricing Logic
    let opportunity: PriceOpportunity = {
      product_id: productId,
      product_name: econ.name,
      type: 'MAINTAIN',
      reason: 'Current positioning aligns with market and margin targets.',
      current_price: currentPrice,
      proposed_price: currentPrice,
      margin_impact_percent: 0
    };

    if (compPrice && compPrice > currentPrice * 1.15 && margin < 40) {
      // Competitor is 15% higher and we have room to grow margin
      const proposed = currentPrice * 1.05; // 5% increase
      opportunity = {
        ...opportunity,
        type: 'INCREASE',
        proposed_price: proposed,
        margin_impact_percent: 5,
        reason: `Lowest competitor is ${Math.round(((compPrice - currentPrice) / currentPrice) * 100)}% more expensive. Potential to increase margin.`
      };
    } else if (compPrice && compPrice < currentPrice * 0.9 && margin > 25) {
      // Competitor is 10% cheaper and we have enough margin to compete
      const proposed = currentPrice * 0.95; // 5% decrease to close gap
      opportunity = {
        ...opportunity,
        type: 'DECREASE',
        proposed_price: proposed,
        margin_impact_percent: -5,
        reason: `Competitor is undercutting by ${Math.round(((currentPrice - compPrice) / currentPrice) * 100)}%. Recommend narrowing the gap.`
      };
    } else if (margin < 10) {
      opportunity = {
        ...opportunity,
        type: 'PROTECT_MARGIN',
        reason: 'Critical margin levels. Avoid any further discounting.'
      };
    }

    return opportunity;
  },

  /**
   * Generate recommendations for the UI.
   */
  async generateRecommendations(limit: number = 20) {
    const { data: products } = await supabase.from('products').select('id').limit(limit);
    if (!products) return;

    for (const p of products) {
      const opp = await this.getOpportunity(p.id);
      if (opp && (opp.type === 'INCREASE' || opp.type === 'DECREASE' || opp.type === 'PROTECT_MARGIN')) {
        await supabase.from('intelligence_recommendations').upsert({
          recommendation_type: 'pricing_opportunity',
          entity_type: 'product',
          entity_id: p.id,
          title: `Pricing Action: ${opp.type} for ${opp.product_name}`,
          description: opp.reason,
          proposed_action: `Change price from £${opp.current_price.toFixed(2)} to £${opp.proposed_price.toFixed(2)}`,
          reason: opp.reason,
          confidence: 0.85,
          status: 'recommended',
          metadata: {
             proposed_price: opp.proposed_price,
             margin_impact: opp.margin_impact_percent
          }
        }, { onConflict: 'recommendation_type, entity_id' });
      }
    }
  }
};

import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils/currency';

export interface PromotionSimulation {
  product_id: string;
  store_id: string | null;
  discount_percent: number;
  current_price: number;
  cost_price: number;
  duration_days: number;
  inventory_quantity: number;
  // Canonical unit: average units sold per day.
  sales_velocity: number;
  competitor_median?: number | null;
  min_margin: number;
}

export interface SimulationResult {
  promotional_price: number;
  current_unit_profit: number;
  promotional_unit_profit: number;
  current_margin_percent: number;
  promotional_margin_percent: number;
  profit_reduction_per_unit: number;
  required_volume_multiplier: number;
  required_volume_uplift_percent: number;
  break_even_units: number;
  expected_revenue: number;
  expected_gross_profit: number;
  expected_margin: number;
  inventory_consumption: number;
  projected_days_of_cover: number;
  market_position: 'MUCH CHEAPER' | 'CHEAPER' | 'COMPETITIVE' | 'PREMIUM' | 'OVERPRICED';
  competitor_median: number | null;
  classification: 'SAFE' | 'COMPETITIVE OPPORTUNITY' | 'CAUTION' | 'HIGH RISK' | 'INVENTORY RISK' | 'DO NOT PROMOTE';
  reason: string;
}

export const simulationService = {
  /** Run a deterministic promotion simulation using per-day sales velocity. */
  calculate(params: PromotionSimulation): SimulationResult {
    const {
      current_price,
      cost_price,
      discount_percent,
      duration_days,
      inventory_quantity,
      sales_velocity,
      min_margin,
      competitor_median,
    } = params;

    const discountAmount = current_price * (discount_percent / 100);
    const promotionalPrice = Math.round(Math.max(0, current_price - discountAmount) * 100) / 100;
    const currentUnitProfit = current_price - cost_price;
    const promotionalUnitProfit = promotionalPrice - cost_price;
    const currentMarginPercent = current_price > 0 ? (currentUnitProfit / current_price) * 100 : 0;
    const promotionalMarginPercent = promotionalPrice > 0 ? (promotionalUnitProfit / promotionalPrice) * 100 : 0;
    const profitReductionPerUnit = currentUnitProfit - promotionalUnitProfit;

    let requiredVolumeMultiplier = 0;
    if (promotionalUnitProfit > 0) {
      requiredVolumeMultiplier = currentUnitProfit / promotionalUnitProfit;
    } else {
      requiredVolumeMultiplier = 99.9;
    }

    const requiredVolumeUpliftPercent = (requiredVolumeMultiplier - 1) * 100;
    const currentTotalUnits = Math.max(0, sales_velocity) * Math.max(1, duration_days);
    const breakEvenUnits = currentTotalUnits * requiredVolumeMultiplier;

    let marketPosition: SimulationResult['market_position'] = 'COMPETITIVE';
    if (competitor_median && competitor_median > 0) {
      const diffPct = ((promotionalPrice - competitor_median) / competitor_median) * 100;
      if (diffPct < -15) marketPosition = 'MUCH CHEAPER';
      else if (diffPct < -3) marketPosition = 'CHEAPER';
      else if (diffPct > 15) marketPosition = 'OVERPRICED';
      else if (diffPct > 3) marketPosition = 'PREMIUM';
    }

    const projectedDaysOfCover = inventory_quantity > 0 && sales_velocity > 0 && requiredVolumeMultiplier > 0
      ? inventory_quantity / (sales_velocity * requiredVolumeMultiplier)
      : 0;
    const expectedRevenue = breakEvenUnits * promotionalPrice;
    const expectedGrossProfit = breakEvenUnits * promotionalUnitProfit;
    const expectedMargin = expectedRevenue > 0 ? (expectedGrossProfit / expectedRevenue) * 100 : 0;

    let classification: SimulationResult['classification'] = 'SAFE';
    let reason = '';

    // Data-quality gates come before commercial classifications. Never approve a
    // promotion from missing cost, missing demand history, or absent stock.
    if (current_price <= 0) {
      classification = 'DO NOT PROMOTE';
      reason = 'DATA NOT READY: Current selling price is missing or invalid.';
    } else if (cost_price <= 0) {
      classification = 'DO NOT PROMOTE';
      reason = 'DATA NOT READY: Product cost is missing, so margin and break-even calculations are not reliable.';
    } else if (sales_velocity <= 0) {
      classification = 'DO NOT PROMOTE';
      reason = 'DATA NOT READY: No recent paid-sales velocity is available for this scope.';
    } else if (inventory_quantity <= 0) {
      classification = 'DO NOT PROMOTE';
      reason = 'INVENTORY BLOCK: No stock is available for the proposed promotion.';
    } else if (promotionalPrice <= cost_price) {
      classification = 'DO NOT PROMOTE';
      reason = 'LOSS-MAKING: Unit price is below or equal to product cost.';
    } else if (promotionalMarginPercent < min_margin) {
      classification = 'DO NOT PROMOTE';
      reason = `MARGIN FAILURE: Projected margin (${promotionalMarginPercent.toFixed(1)}%) is below safety floor (${min_margin}%).`;
    } else if (inventory_quantity < breakEvenUnits) {
      classification = 'INVENTORY RISK';
      reason = `INSUFFICIENT STOCK: Current inventory (${inventory_quantity}) cannot support the ${Math.ceil(breakEvenUnits)} units required to break even.`;
    } else if (projectedDaysOfCover < duration_days) {
      classification = 'INVENTORY RISK';
      reason = `STOCKOUT IMMINENT: Projected stock will run out in ${projectedDaysOfCover.toFixed(1)} days, which is less than the promotion duration.`;
    } else if (requiredVolumeUpliftPercent > 100) {
      classification = 'HIGH RISK';
      reason = `UNREALISTIC UPLIFT: Requires +${requiredVolumeUpliftPercent.toFixed(0)}% sales increase to maintain profit.`;
    } else if (competitor_median && promotionalPrice < competitor_median && requiredVolumeUpliftPercent < 40) {
      classification = 'COMPETITIVE OPPORTUNITY';
      reason = `STRATEGIC ADVANTAGE: Creates meaningful price advantage against market median (${formatCurrency(competitor_median)}) with achievable uplift.`;
    } else if (requiredVolumeUpliftPercent > 30) {
      classification = 'CAUTION';
      reason = `MODERATE RISK: Requires ${requiredVolumeUpliftPercent.toFixed(0)}% uplift. Ensure marketing support is available.`;
    } else {
      classification = 'SAFE';
      reason = `FINANCIALLY SAFE: Healthy margin (${promotionalMarginPercent.toFixed(1)}%) and realistic volume uplift (+${requiredVolumeUpliftPercent.toFixed(0)}%).`;
    }

    return {
      promotional_price: promotionalPrice,
      current_unit_profit: currentUnitProfit,
      promotional_unit_profit: promotionalUnitProfit,
      current_margin_percent: currentMarginPercent,
      promotional_margin_percent: promotionalMarginPercent,
      profit_reduction_per_unit: profitReductionPerUnit,
      required_volume_multiplier: requiredVolumeMultiplier,
      required_volume_uplift_percent: requiredVolumeUpliftPercent,
      break_even_units: Math.ceil(breakEvenUnits),
      expected_revenue: expectedRevenue,
      expected_gross_profit: expectedGrossProfit,
      expected_margin: expectedMargin,
      inventory_consumption: Math.ceil(breakEvenUnits),
      projected_days_of_cover: projectedDaysOfCover,
      market_position: marketPosition,
      competitor_median: competitor_median ?? null,
      classification,
      reason,
    };
  },

  async saveSimulation(params: PromotionSimulation) {
    const result = this.calculate(params);
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('promotion_simulations')
      .upsert({
        product_id: params.product_id,
        store_id: params.store_id || null,
        base_price: params.current_price,
        proposed_price: result.promotional_price,
        cost_price: params.cost_price,
        discount_percent: params.discount_percent,
        current_margin: result.current_margin_percent,
        promotional_margin: result.promotional_margin_percent,
        required_volume_uplift: result.required_volume_uplift_percent,
        break_even_uplift: result.required_volume_uplift_percent,
        projected_revenue: result.expected_revenue,
        projected_profit: result.expected_gross_profit,
        inventory_at_simulation: params.inventory_quantity,
        sales_velocity: params.sales_velocity,
        competitor_median: params.competitor_median || null,
        classification: result.classification,
        duration_days: params.duration_days,
        created_by: user?.id,
        created_at: new Date().toISOString(),
      }, { onConflict: 'product_id,store_id' })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getAiExplanation(params: PromotionSimulation, result: SimulationResult, productName: string): Promise<string> {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/marketing-intelligence-ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          action: 'explain_promotion',
          simulation_params: { ...params, product_name: productName },
          simulation_result: result,
        }),
      });

      if (!response.ok) return '';
      const data = await response.json();
      return data.text || '';
    } catch (e) {
      console.warn('[Simulator] AI explanation failed:', e);
      return '';
    }
  },
};

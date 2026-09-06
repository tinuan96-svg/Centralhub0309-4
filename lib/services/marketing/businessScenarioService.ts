import { DecisionSnapshot } from './decisionSnapshotService';
import { simulationService } from './simulationService';

export interface ScenarioResult {
  profit_delta: number;
  revenue_delta: number;
  stockout_risk_delta: number;
  recommendation: string;
}

export const businessScenarioService = {
  /**
   * Run a coordinated multi-system simulation.
   */
  async runPromotionScenario(snapshot: DecisionSnapshot, discountPercent: number, expectedUplift: number): Promise<ScenarioResult> {
    // 1. Financial Simulation
    const financial = simulationService.calculate({
      product_id: snapshot.product_id,
      store_id: snapshot.store_id || null,
      discount_percent: discountPercent,
      current_price: snapshot.current_price,
      cost_price: snapshot.cost_price,
      duration_days: 30,
      inventory_quantity: snapshot.stock_quantity,
      sales_velocity: snapshot.units_sold_30d / 30,
      min_margin: 8
    });

    // 2. Inventory Simulation
    const currentMonthlySales = snapshot.units_sold_30d;
    const projectedMonthlySales = currentMonthlySales * (1 + expectedUplift / 100);
    const stockImpact = projectedMonthlySales - currentMonthlySales;

    // 3. Resolve trade-offs
    let recommendation = 'PROCEED';
    if (snapshot.stock_quantity < projectedMonthlySales) {
      recommendation = 'DO NOT LAUNCH: Insufficient stock for projected demand';
    } else if (financial.expected_gross_profit < 0) {
      recommendation = 'REVIEW: Uplift does not compensate for margin reduction';
    }

    return {
      profit_delta: financial.expected_gross_profit,
      revenue_delta: financial.expected_revenue,
      stockout_risk_delta: stockImpact,
      recommendation
    };
  }
};

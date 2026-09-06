import { DecisionSnapshot } from './decisionSnapshotService';

export type BusinessDecisionType = 'REPLENISH' | 'PROMOTE' | 'PROTECT_MARGIN' | 'CLEARANCE' | 'MAINTAIN' | 'WAIT';

export interface BusinessDecision {
  type: BusinessDecisionType;
  priority: number; // 0-100
  title: string;
  reason: string;
  expected_impact: string;
  confidence: 'high' | 'medium' | 'low';
}

export const decisionPriorityService = {
  /**
   * Resolve conflicts and prioritize business actions based on a coordinated snapshot.
   */
  resolveDecision(snapshot: DecisionSnapshot): BusinessDecision {
    // 1. SAFETY & CONSTRAINTS (Highest Priority)
    if (snapshot.stock_risk === 'critical' || snapshot.days_of_cover < 5) {
      return {
        type: 'REPLENISH',
        priority: 95,
        title: 'Immediate Replenishment Required',
        reason: 'Critical stock levels detected. Risk of stockout within 5 days.',
        expected_impact: 'Prevent revenue loss and customer disappointment.',
        confidence: 'high'
      };
    }

    // 2. PROFITABILITY VS GROWTH
    const isHighDemand = snapshot.units_sold_30d > 20;
    const isLowMargin = snapshot.margin_percent < 15;
    const isCompetitorCheaper = snapshot.price_gap_percent && snapshot.price_gap_percent > 10;

    if (isHighDemand && isLowMargin) {
      return {
        type: 'PROTECT_MARGIN',
        priority: 85,
        title: 'Protect Margin on High Demand SKU',
        reason: 'Demand is strong despite low margins. Avoid any further discounting.',
        expected_impact: 'Stabilize unit profitability.',
        confidence: 'high'
      };
    }

    // 3. OVERSTOCK OPPORTUNITY
    if (snapshot.stock_risk === 'overstock' || snapshot.days_of_cover > 120) {
      return {
        type: 'CLEARANCE',
        priority: 70,
        title: 'Clearance Opportunity',
        reason: 'High inventory levels with low relative sales velocity.',
        expected_impact: 'Recover tied-up working capital.',
        confidence: 'medium'
      };
    }

    // 4. GROWTH OPPORTUNITY
    if (snapshot.margin_percent > 35 && snapshot.stock_risk === 'healthy' && isCompetitorCheaper) {
      return {
        type: 'PROMOTE',
        priority: 60,
        title: 'Strategic Promotion Opportunity',
        reason: 'Healthy stock and strong margins allow for competitive discounting.',
        expected_impact: 'Capture market share from cheaper competitors.',
        confidence: 'medium'
      };
    }

    // 5. DEFAULT
    return {
      type: 'MAINTAIN',
      priority: 10,
      title: 'Maintain Current Position',
      reason: 'Product metrics are stable and within target thresholds.',
      expected_impact: 'Stable steady-state performance.',
      confidence: 'high'
    };
  }
};

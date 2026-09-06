import { supabase } from '@/lib/supabase';
import { Order } from '@/lib/types';

export interface ChurnRiskProfile {
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  probability: number;
  avg_interval_days: number;
  days_since_last: number;
  deviation_ratio: number;
}

export const customerChurnService = {
  /**
   * Predict churn risk based on reorder intervals.
   */
  calculateChurnRisk(customerOrders: Order[]): ChurnRiskProfile | null {
    if (customerOrders.length < 2) return null;

    // 1. Calculate average interval between orders
    const dates = customerOrders
      .map(o => new Date(o.created_at).getTime())
      .sort((a, b) => a - b);

    const intervals = [];
    for (let i = 1; i < dates.length; i++) {
      intervals.push((dates[i] - dates[i-1]) / (1000 * 60 * 60 * 24));
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

    // 2. Calculate days since last order
    const lastOrderDate = dates[dates.length - 1];
    const daysSinceLast = (Date.now() - lastOrderDate) / (1000 * 60 * 60 * 24);

    // 3. Deviation Ratio: How much have they exceeded their normal window?
    const deviationRatio = avgInterval > 0 ? daysSinceLast / avgInterval : 0;

    let risk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    let probability = 0;

    if (deviationRatio > 2.5) {
      risk = 'HIGH';
      probability = Math.min(0.95, 0.5 + (deviationRatio / 10));
    } else if (deviationRatio > 1.5) {
      risk = 'MEDIUM';
      probability = 0.3 + (deviationRatio / 5);
    } else {
      risk = 'LOW';
      probability = deviationRatio * 0.1;
    }

    return {
      risk_level: risk,
      probability: Number(probability.toFixed(2)),
      avg_interval_days: Number(avgInterval.toFixed(1)),
      days_since_last: Math.floor(daysSinceLast),
      deviation_ratio: Number(deviationRatio.toFixed(2))
    };
  }
};

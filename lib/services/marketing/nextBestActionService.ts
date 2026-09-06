import { supabase } from '@/lib/supabase';
import { Order, OrderWithItems } from '@/lib/types';
import { customerChurnService } from './customerChurnService';
import { customerValueService } from './customerValueService';

export type NBAAction = 'REORDER_REMINDER' | 'CROSS_SELL' | 'RETENTION_OFFER' | 'WIN_BACK' | 'NO_ACTION' | 'UPSELL';

export interface NextBestAction {
  action: NBAAction;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
  expected_value: number;
  confidence: number;
}

export const nextBestActionService = {
  /**
   * Determine the single best action for a customer.
   */
  async determineNBA(customerOrders: Order[]): Promise<NextBestAction> {
    if (customerOrders.length === 0) return { action: 'NO_ACTION', priority: 'LOW', reason: 'No purchase history', expected_value: 0, confidence: 0 };

    const churn = customerChurnService.calculateChurnRisk(customerOrders);
    const value = await customerValueService.calculateMetrics(customerOrders);

    if (!value) return { action: 'NO_ACTION', priority: 'LOW', reason: 'Could not calculate metrics', expected_value: 0, confidence: 0 };

    // 1. Check for Win-Back (Dormant)
    if (value.lifecycle_stage === 'churned' || (churn?.deviation_ratio || 0) > 4) {
      return {
        action: 'WIN_BACK',
        priority: value.total_revenue > 500 ? 'HIGH' : 'MEDIUM',
        reason: 'Customer is dormant. High historical value suggests win-back potential.',
        expected_value: value.aov * 0.5,
        confidence: 0.65
      };
    }

    // 2. Check for Retention (At Risk)
    if (churn?.risk_level === 'HIGH' || value.lifecycle_stage === 'at_risk') {
      return {
        action: 'RETENTION_OFFER',
        priority: 'CRITICAL',
        reason: `Churn probability is ${Math.round(churn?.probability! * 100)}%. Immediate intervention recommended.`,
        expected_value: value.aov,
        confidence: 0.85
      };
    }

    // 3. Check for Reorder Reminder
    if (churn?.deviation_ratio && churn.deviation_ratio > 0.8 && churn.deviation_ratio < 1.2) {
      return {
        action: 'REORDER_REMINDER',
        priority: 'HIGH',
        reason: 'Customer is within their typical reorder window.',
        expected_value: value.aov,
        confidence: 0.92
      };
    }

    // 4. Upsell for VIPs
    if (value.lifecycle_stage === 'vip') {
      return {
        action: 'UPSELL',
        priority: 'MEDIUM',
        reason: 'VIP customer. Eligible for premium bundle or early access.',
        expected_value: value.aov * 1.5,
        confidence: 0.75
      };
    }

    // 5. Default: No Action (Protect Margin)
    return {
      action: 'NO_ACTION',
      priority: 'LOW',
      reason: 'Customer is healthy and likely to purchase naturally. No discount required.',
      expected_value: 0,
      confidence: 0.95
    };
  }
};

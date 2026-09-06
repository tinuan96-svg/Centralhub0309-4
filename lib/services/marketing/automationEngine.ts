import { supabase } from '@/lib/supabase';
import { intelligenceService } from './intelligenceService';
import { campaignOpportunityService } from './campaignOpportunityService';
import { productEconomicsService } from './productEconomicsService';
import { priceOpportunityService } from './priceOpportunityService';

export type AutomationStatus = 'pending' | 'executing' | 'executed' | 'skipped' | 'stale' | 'failed' | 'duplicate_prevented' | 'policy_blocked';

export interface AutomationTrigger {
  action_type: string;
  entity_type: 'product' | 'customer' | 'order' | 'campaign';
  entity_id: string;
  idempotency_key: string;
  event_data?: any;
}

export const automationEngine = {
  /**
   * Orchestrate an automated action via the server-side hardened worker.
   * Client-side only handles the initial trigger and local logging if needed.
   */
  async execute(trigger: AutomationTrigger) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    // Canonical Mapping for Phase 3 Consistency
    const actionMap: Record<string, string> = {
       'generate_inventory_reorder': 'inventory:reorder',
       'refresh_customer_intelligence': 'lifecycle:refresh',
       'refresh_product_economics': 'product:economics_refresh',
       'generate_pricing_recommendations': 'pricing:recommendation_generation',
       'marketing_opportunity_scan': 'marketing:opportunity_scan'
    };

    const canonicalAction = actionMap[trigger.action_type] || trigger.action_type;

    try {
      const response = await supabase.functions.invoke('automation-worker', {
        body: {
          action_type: canonicalAction,
          entity_id: trigger.entity_id,
          idempotency_key: trigger.idempotency_key,
          trigger_event: trigger.event_data,
          metadata: {
             triggered_by: user.id,
             original_action: trigger.action_type
          }
        }
      });

      if (response.error) {
         console.error('[AutomationEngine] Worker error:', response.error);
         return { status: 'failed', error: response.error.message };
      }

      return response.data;
    } catch (err: any) {
       console.error('[AutomationEngine] Execution failed:', err);
       return { status: 'failed', error: err.message };
    }
  },

  async logSkipped(trigger: AutomationTrigger, reason: string) {
    console.log(`Automation Skipped: ${trigger.action_type} - ${reason}`);
    return { status: 'skipped', reason };
  }
};

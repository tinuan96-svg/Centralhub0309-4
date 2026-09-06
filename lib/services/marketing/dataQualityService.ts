import { supabase } from '@/lib/supabase';

export interface QualityIssue {
  module: string;
  issue: string;
  severity: 'warning' | 'critical';
}

export const dataQualityService = {
  /**
   * Scan system for missing data that impacts intelligence confidence.
   */
  async checkDataQuality(): Promise<QualityIssue[]> {
    const issues: QualityIssue[] = [];

    // 1. Check for missing product costs
    const { count: missingCosts } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .is('cost_price', null);

    if (missingCosts && missingCosts > 0) {
      issues.push({ module: 'Finance', issue: `${missingCosts} products missing cost price`, severity: 'critical' });
    }

    // 2. Check for stale inventory
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count: staleInventory } = await supabase
      .from('central_inventory')
      .select('*', { count: 'exact', head: true })
      .lt('updated_at', thirtyDaysAgo.toISOString());

    if (staleInventory && staleInventory > 0) {
      issues.push({ module: 'Inventory', issue: `${staleInventory} items have not been updated in 30 days`, severity: 'warning' });
    }

    // 3. Check for unlinked campaign stores
    try {
      const { data: campaigns, error: campErr } = await supabase.from('campaigns').select('id');
      const { data: links, error: linkErr } = await supabase.from('campaign_stores').select('campaign_id');

      if (!campErr && !linkErr) {
        const linkedIds = new Set(links?.map(l => l.campaign_id));
        const unlinkedCount = campaigns?.filter(c => !linkedIds.has(c.id)).length || 0;

        if (unlinkedCount > 0) {
          issues.push({ module: 'Marketing', issue: `${unlinkedCount} campaigns are not linked to any store`, severity: 'warning' });
        }
      }
    } catch (err) {
      console.warn('[DataQuality] Skipping campaign check as table may be missing');
    }

    return issues;
  }
};

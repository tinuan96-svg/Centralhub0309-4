import { supabase } from '@/lib/supabase';

export interface QualityIssue {
  module: string;
  issue: string;
  severity: 'warning' | 'critical';
}

export const dataQualityService = {
  /** Scan the source and derived data that materially affects BI decisions. */
  async checkDataQuality(): Promise<QualityIssue[]> {
    const issues: QualityIssue[] = [];
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Product cost must be strictly positive for margin/pricing decisions.
    const { count: missingCosts } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', false)
      .eq('is_active', true)
      .or('cost_price.is.null,cost_price.lte.0');

    if ((missingCosts || 0) > 0) {
      issues.push({ module: 'Finance', issue: `${missingCosts} active products have missing or zero cost price`, severity: 'critical' });
    }

    // Paid orders must have an authoritative order-level COGS snapshot.
    const { count: paidOrdersMissingCost } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('payment_status', 'paid')
      .eq('is_deleted', false)
      .gt('total', 0)
      .or('product_cost_net.is.null,product_cost_net.lte.0');

    if ((paidOrdersMissingCost || 0) > 0) {
      issues.push({
        module: 'Finance',
        issue: `${paidOrdersMissingCost} paid orders do not have a positive authoritative product-cost snapshot`,
        severity: 'critical',
      });
    }

    const { count: staleInventory } = await supabase
      .from('central_inventory')
      .select('*', { count: 'exact', head: true })
      .lt('updated_at', thirtyDaysAgo);

    if ((staleInventory || 0) > 0) {
      issues.push({ module: 'Inventory', issue: `${staleInventory} inventory rows have not been updated in 30 days`, severity: 'warning' });
    }

    // Global intelligence cache must cover the complete active catalogue.
    const [activeProductResult, economicsResult, forecastResult, staleEconomicsResult, staleForecastResult] = await Promise.all([
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_deleted', false).eq('is_active', true),
      supabase.from('product_economics').select('*', { count: 'exact', head: true }).is('store_id', null),
      supabase.from('inventory_forecasts').select('*', { count: 'exact', head: true }).is('store_id', null),
      supabase.from('product_economics').select('*', { count: 'exact', head: true }).is('store_id', null).lt('last_calculated_at', fortyEightHoursAgo),
      supabase.from('inventory_forecasts').select('*', { count: 'exact', head: true }).is('store_id', null).lt('calculated_at', fortyEightHoursAgo),
    ]);

    const activeProducts = activeProductResult.count || 0;
    const economicsRows = economicsResult.count || 0;
    const forecastRows = forecastResult.count || 0;

    if (activeProducts > 0 && economicsRows < activeProducts) {
      issues.push({
        module: 'Product Economics',
        issue: `Economics cache covers ${economicsRows}/${activeProducts} active products`,
        severity: 'critical',
      });
    }

    if (activeProducts > 0 && forecastRows < activeProducts) {
      issues.push({
        module: 'Inventory Intelligence',
        issue: `Forecast cache covers ${forecastRows}/${activeProducts} active products`,
        severity: 'critical',
      });
    }

    if ((staleEconomicsResult.count || 0) > 0) {
      issues.push({ module: 'Product Economics', issue: `${staleEconomicsResult.count} global economics rows are older than 48 hours`, severity: 'warning' });
    }

    if ((staleForecastResult.count || 0) > 0) {
      issues.push({ module: 'Inventory Intelligence', issue: `${staleForecastResult.count} global forecasts are older than 48 hours`, severity: 'warning' });
    }

    // Ready pricing advice should not survive beyond the normal competitor freshness window.
    const { count: staleReadyPricing } = await supabase
      .from('pricing_suggestions')
      .select('*', { count: 'exact', head: true })
      .eq('recommendation_status', 'ready')
      .lt('generated_at', new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString());

    if ((staleReadyPricing || 0) > 0) {
      issues.push({
        module: 'Pricing',
        issue: `${staleReadyPricing} ready pricing suggestions are older than the 72-hour market-data window`,
        severity: 'critical',
      });
    }

    // Campaign linkage is useful but non-blocking for core financial decisions.
    try {
      const { data: campaigns, error: campaignError } = await supabase.from('campaigns').select('id');
      const { data: links, error: linkError } = await supabase.from('campaign_stores').select('campaign_id');

      if (!campaignError && !linkError) {
        const linkedIds = new Set((links || []).map((link: any) => link.campaign_id));
        const unlinkedCount = (campaigns || []).filter((campaign: any) => !linkedIds.has(campaign.id)).length;
        if (unlinkedCount > 0) {
          issues.push({ module: 'Marketing', issue: `${unlinkedCount} campaigns are not linked to any store`, severity: 'warning' });
        }
      }
    } catch {
      console.warn('[DataQuality] Campaign linkage check unavailable');
    }

    return issues;
  },
};

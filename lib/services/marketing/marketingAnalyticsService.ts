import { supabase } from '@/lib/supabase';

const defaultWindow = () => ({
  start: new Date(Date.now() - 30 * 86400000).toISOString(),
  end: new Date().toISOString(),
});

export const marketingAnalyticsService = {
  async getPerformanceByStore(dateRange?: { start: string; end: string }) {
    let query = supabase.from('campaign_performance').select('store_id, spend, revenue, conversions, stores(name)');
    if (dateRange) query = query.gte('date', dateRange.start).lte('date', dateRange.end);
    const { data, error } = await query;
    if (error) throw error;
    const storeMap: Record<string, any> = {};
    (data || []).forEach((p: any) => {
      const storeName = Array.isArray(p.stores) ? (p.stores[0]?.name || 'Unknown') : (p.stores?.name || 'Unknown');
      if (!storeMap[p.store_id]) storeMap[p.store_id] = { name: storeName, spend: 0, revenue: 0, conversions: 0 };
      storeMap[p.store_id].spend += Number(p.spend || 0); storeMap[p.store_id].revenue += Number(p.revenue || 0); storeMap[p.store_id].conversions += Number(p.conversions || 0);
    });
    return Object.values(storeMap);
  },

  async getCampaignRanking(storeId?: string, sortBy: 'revenue' | 'roas' | 'conversions' = 'revenue') {
    let query = supabase.from('campaign_performance').select('campaign_id, spend, revenue, conversions, campaigns(name)');
    if (storeId) query = query.eq('store_id', storeId);
    const { data, error } = await query;
    if (error) throw error;
    const campaignMap: Record<string, any> = {};
    (data || []).forEach((p: any) => {
      const name = Array.isArray(p.campaigns) ? (p.campaigns[0]?.name || 'Unknown') : (p.campaigns?.name || 'Unknown');
      if (!campaignMap[p.campaign_id]) campaignMap[p.campaign_id] = { id: p.campaign_id, name, spend: 0, revenue: 0, conversions: 0 };
      campaignMap[p.campaign_id].spend += Number(p.spend || 0); campaignMap[p.campaign_id].revenue += Number(p.revenue || 0); campaignMap[p.campaign_id].conversions += Number(p.conversions || 0);
    });
    return Object.values(campaignMap).map((c: any) => ({ ...c, roas: c.spend > 0 ? c.revenue / c.spend : 0 })).sort((a, b) => b[sortBy] - a[sortBy]);
  },

  async getTrafficChannels(storeId?: string, start?: string, end?: string) {
    const w = start && end ? { start, end } : defaultWindow();
    const { data, error } = await supabase.rpc('analytics_get_channel_performance', {
      p_store_id: storeId || null, p_start: w.start, p_end: w.end,
    });
    if (error) throw error;
    return data || [];
  },

  async getProductPerformance(storeId?: string, start?: string, end?: string) {
    const w = start && end ? { start, end } : defaultWindow();
    const { data, error } = await supabase.rpc('analytics_get_product_performance', {
      p_store_id: storeId || null, p_start: w.start, p_end: w.end,
    });
    if (error) throw error;
    return data || [];
  },

  async getCampaignROI(storeId: string, start?: string, end?: string) {
    const w = start && end ? { start, end } : defaultWindow();
    const { data, error } = await supabase.rpc('analytics_get_campaign_roi', {
      p_store_id: storeId, p_start: w.start, p_end: w.end,
    });
    if (error) throw error;
    return data || [];
  },

  async getProductROI(storeId: string, start?: string, end?: string) {
    const w = start && end ? { start, end } : defaultWindow();
    const { data, error } = await supabase.rpc('analytics_get_product_roi', {
      p_store_id: storeId, p_start: w.start, p_end: w.end,
    });
    if (error) throw error;
    return data || [];
  },

  async getAttributionSummary(storeId: string, start?: string, end?: string) {
    const w = start && end ? { start, end } : defaultWindow();
    const { data, error } = await supabase.rpc('analytics_get_attribution_summary', {
      p_store_id: storeId, p_start: w.start, p_end: w.end,
    });
    if (error) throw error;
    return data || [];
  },

  async getMultiTouchOrders(storeId: string, start?: string, end?: string) {
    const w = start && end ? { start, end } : defaultWindow();
    const { data, error } = await supabase.rpc('analytics_get_multitouch_attribution', {
      p_store_id: storeId, p_start: w.start, p_end: w.end,
    });
    if (error) throw error;
    return data || [];
  },
};
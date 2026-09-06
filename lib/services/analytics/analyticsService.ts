import { supabase } from '@/lib/supabase';
import type { AnalyticsRealtimeStore, AnalyticsStoreConfig } from '@/lib/types/analytics';

const scoped = (storeId?: string | null) => storeId && storeId !== 'all' ? storeId : undefined;

export const analyticsService = {
  async getConfigs(storeId?: string) {
    let query = supabase.from('analytics_store_configs').select('*').order('created_at');
    const id = scoped(storeId);
    if (id) query = query.eq('store_id', id);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as AnalyticsStoreConfig[];
  },
  async getRealtime(storeId?: string) {
    const { data, error } = await supabase.rpc('analytics_get_realtime', { p_store_id: scoped(storeId) || null });
    if (error) throw error;
    return (data || []) as AnalyticsRealtimeStore[];
  },
  async getActiveVisitors(storeId?: string) {
    const { data, error } = await supabase.rpc('analytics_get_active_visitors', { p_store_id: scoped(storeId) || null });
    if (error) throw error;
    return data || [];
  },
  async getDailyMetrics(storeId: string, start: string, end: string) {
    const { data, error } = await supabase.from('analytics_daily_metrics').select('*').eq('store_id', storeId).gte('metric_date', start).lte('metric_date', end).order('metric_date');
    if (error) throw error;
    return data || [];
  },
  async getDailySummary(storeId: string, start: string, end: string) {
    const rows = await this.getDailyMetrics(storeId, start, end);
    return rows.reduce((acc: { users: number; sessions: number; pageViews: number; productViews: number; carts: number; checkouts: number; purchases: number; revenue: number }, row: any) => ({
      users: acc.users + Number(row.users || 0),
      sessions: acc.sessions + Number(row.sessions || 0),
      pageViews: acc.pageViews + Number(row.page_views || 0),
      productViews: acc.productViews + Number(row.product_views || 0),
      carts: acc.carts + Number(row.add_to_carts || 0),
      checkouts: acc.checkouts + Number(row.checkouts || 0),
      purchases: acc.purchases + Number(row.purchases || 0),
      revenue: acc.revenue + Number(row.revenue || 0),
    }), { users: 0, sessions: 0, pageViews: 0, productViews: 0, carts: 0, checkouts: 0, purchases: 0, revenue: 0 });
  },
  async getCampaignAttribution(storeId?: string, start?: string, end?: string) {
    let query = supabase.from('analytics_campaign_attribution').select('*').order('updated_at', { ascending: false });
    const id = scoped(storeId);
    if (id) query = query.eq('store_id', id);
    if (start) query = query.gte('updated_at', start);
    if (end) query = query.lte('updated_at', end);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },
  async recordEvent(input: Record<string, unknown>) {
    const { store_id, ...event } = input;
    return supabase.from('analytics_events').insert({ store_id, ...event });
  },
};

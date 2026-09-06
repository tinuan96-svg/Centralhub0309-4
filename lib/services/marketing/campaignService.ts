import { supabase } from '@/lib/supabase';
import { Campaign } from '@/lib/types/marketing';

export const campaignService = {
  async createCampaign(data: Partial<Campaign>, storeIds?: string[]) {
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        ...data,
        status: data.status || 'draft',
        targeting: data.targeting || {},
        creative: data.creative || {},
        config: data.config || {}
      })
      .select()
      .single();

    if (campaignError) throw campaignError;

    if (storeIds && storeIds.length > 0) {
      const storeLinks = storeIds.map(storeId => ({
        campaign_id: campaign.id,
        store_id: storeId
      }));

      const { error: storeError } = await supabase
        .from('campaign_stores')
        .insert(storeLinks);

      if (storeError) throw storeError;
    }

    return campaign;
  },

  async updateStatus(campaignId: string, status: Campaign['status']) {
    const { error } = await supabase
      .from('campaigns')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', campaignId);

    if (error) throw error;
  }
};

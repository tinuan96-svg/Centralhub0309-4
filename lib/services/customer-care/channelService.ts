import { supabase } from '@/lib/supabase';

export interface WhatsAppChannel {
  id: string;
  store_id: string | null;
  waba_id: string | null;
  phone_number_id: string | null;
  display_phone_number: string | null;
  business_name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  store?: { name: string; slug: string };
}

export const channelService = {
  async getChannels() {
    const { data, error } = await supabase
      .from('whatsapp_channels')
      .select('id, store_id, waba_id, phone_number_id, display_phone_number, business_name, status, created_at, updated_at, store:stores(name, slug)')
      .order('business_name', { ascending: true });

    if (error) throw error;
    return (data as any[])?.map(d => ({ ...d, store: Array.isArray(d.store) ? d.store[0] : d.store })) as WhatsAppChannel[];
  },

  async updateChannel(id: string, updates: Partial<WhatsAppChannel>) {
    const { data, error } = await supabase
      .from('whatsapp_channels')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, store_id, waba_id, phone_number_id, display_phone_number, business_name, status, created_at, updated_at')
      .single();

    if (error) throw error;
    return data as WhatsAppChannel;
  },

  async updateVerifyToken(id: string, verifyToken: string) {
    const { error } = await supabase
      .from('whatsapp_channels')
      .update({ verify_token: verifyToken, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  },

  async updateAppSecret(id: string, appSecret: string) {
    const { error } = await supabase
      .from('whatsapp_channels')
      .update({ app_secret: appSecret, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  },

  async testWebhook(webhookUrl: string, verifyToken: string) {
    const testUrl = `${webhookUrl}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=test123`;
    const res = await fetch(testUrl, { method: 'GET' });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body, verified: res.ok && body === 'test123' };
  }
};

import { supabase } from '@/lib/supabase';

export const customerCareAIService = {
  async processMessage(params: {
    message: string;
    conversationId: string;
    storeId: string;
    contactId: string;
  }) {
    const { data, error } = await supabase.functions.invoke('customer-care-ai', {
      body: params
    });

    if (error) throw error;
    return data;
  }
};

import { supabase } from '@/lib/supabase';

export const purchasingService = {
  /**
   * Create a PO Draft for replenishment
   */
  async createDraftPO(data: {
    supplier_id: string;
    store_id?: string;
    items: any[];
    trigger_reason?: string;
  }) {
    const { data: draft, error } = await supabase
      .from('po_drafts')
      .insert({
        supplier_id: data.supplier_id,
        store_id: data.store_id || null,
        draft_items: data.items,
        trigger_reason: data.trigger_reason,
        status: 'draft',
        total_amount: data.items.reduce((sum, item) => sum + (Number(item.cost_price || 0) * Number(item.quantity || 1)), 0)
      })
      .select()
      .single();

    if (error) {
      console.error('[PurchasingService] Error creating PO draft:', error);
      throw error;
    }

    return draft;
  }
};

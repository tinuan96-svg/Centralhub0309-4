import { supabase } from '@/lib/supabase';
import { SupportTicket, TicketCategory, TicketPriority, TicketStatus } from '@/lib/types';

export const ticketService = {
  async getTickets(filters?: { store_id?: string; status?: TicketStatus; customer_id?: string }) {
    let query = supabase.from('support_tickets').select('*, conversation:whatsapp_conversations(*)').order('created_at', { ascending: false });

    if (filters?.store_id) query = query.eq('store_id', filters.store_id);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.customer_id) query = query.eq('customer_id', filters.customer_id);

    const { data, error } = await query;
    if (error) throw error;
    return data as SupportTicket[];
  },

  async createTicket(ticket: Partial<SupportTicket>) {
    const { data, error } = await supabase
      .from('support_tickets')
      .insert(ticket)
      .select()
      .single();

    if (error) throw error;
    return data as SupportTicket;
  },

  async updateTicket(id: string, updates: Partial<SupportTicket>) {
    const { data, error } = await supabase
      .from('support_tickets')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as SupportTicket;
  }
};

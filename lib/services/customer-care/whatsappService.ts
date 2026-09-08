import { supabase } from '@/lib/supabase';
import { WhatsAppConversation, WhatsAppMessage, WhatsAppContact, HandlingMode } from '@/lib/types';
import { normalizePhoneNumber, stripPhoneFormatting } from '@/lib/utils/phone-normalization';

async function getFreshSession() {
  const refreshed = await supabase.auth.refreshSession();
  if (refreshed.error) console.warn('[WhatsAppService] refreshSession:', refreshed.error.message);
  if (refreshed.data.session) return refreshed.data.session;
  const current = await supabase.auth.getSession();
  if (current.error) throw new Error(`WhatsApp authentication unavailable: ${current.error.message}`);
  return current.data.session;
}

async function invokeWhatsAppSend(body: Record<string, any>) {
  const session = await getFreshSession();
  if (!session?.access_token) throw new Error('WhatsApp authentication unavailable. Please sign in again.');

  // Use fetch rather than supabase.functions.invoke so Bolt's preview wrapper
  // cannot silently substitute a stale Authorization header.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured.');
  if (!supabaseAnonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.');

  const response = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { error: raw }; }
  if (!response.ok) {
    const error: any = new Error(payload?.error || `WhatsApp send failed (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function invokeWhatsAppMedia(messageId: string) {
  const session = await getFreshSession();
  if (!session?.access_token) throw new Error('WhatsApp authentication unavailable. Please sign in again.');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured.');
  if (!supabaseAnonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.');

  const response = await fetch(`${supabaseUrl}/functions/v1/whatsapp-media?message_id=${encodeURIComponent(messageId)}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  const raw = await response.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { error: raw }; }
  if (!response.ok) throw new Error(payload?.error || `WhatsApp media request failed (${response.status})`);
  return payload;
}

export const whatsappService = {
  async getConversations(storeId?: string) {
    let query = supabase.from('whatsapp_conversations').select('*, contact:whatsapp_contacts(*)').order('last_message_at', { ascending: false });
    if (storeId) query = query.eq('store_id', storeId);
    const { data, error } = await query;
    if (error) throw error;
    return data as WhatsAppConversation[];
  },

  async getMessages(conversationId: string) {
    const { data, error } = await supabase.from('whatsapp_messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true });
    if (error) throw error;
    return data as WhatsAppMessage[];
  },

  async getMediaUrl(messageId: string) {
    return invokeWhatsAppMedia(messageId);
  },

  async updateHandlingMode(conversationId: string, mode: HandlingMode, agentId?: string) {
    const { data, error } = await supabase.from('whatsapp_conversations').update({ handling_mode: mode, assigned_agent_id: agentId || null, updated_at: new Date().toISOString() }).eq('id', conversationId).select().single();
    if (error) throw error;
    return data as WhatsAppConversation;
  },

  async sendMessage(params: { to: string; text?: string; type?: 'text' | 'template'; template?: any; conversationId: string; storeId?: string; notificationId?: string }) {
    let finalStoreId = params.storeId;
    if (!finalStoreId) {
      const { data: conv, error: convErr } = await supabase.from('whatsapp_conversations').select('store_id').eq('id', params.conversationId).maybeSingle();
      if (convErr) console.warn('[WhatsAppService] Could not resolve storeId:', convErr.message);
      finalStoreId = conv?.store_id;
    }
    if (!finalStoreId) throw new Error('Store ID missing. Please ensure the conversation is linked to a store.');

    try {
      const payload = await invokeWhatsAppSend({
        to: params.to, type: params.type || 'text', text: params.text, template: params.template,
        conversationId: params.conversationId, storeId: finalStoreId, notificationId: params.notificationId || null,
      });
      const sendSuccess = payload?.success === true || payload?.message_id != null;
      if (params.conversationId) {
        const insertData: any = { conversation_id: params.conversationId, direction: 'outbound', message_type: params.type || 'text', message_text: params.text || null, status: sendSuccess ? 'sent' : 'failed', ai_generated: false };
        if (payload?.message_id) insertData.wa_message_id = payload.message_id;
        const { error: dbError } = await supabase.from('whatsapp_messages').insert(insertData);
        if (dbError) console.error('[WhatsAppService] Failed to log outbound message:', dbError.message);
      }
      if (!sendSuccess) return { success: false, error: payload?.error || 'Meta API rejected the message' };
      return { success: true, data: payload };
    } catch (error: any) {
      const detail = error?.payload?.error || error?.message || 'Failed to communicate with WhatsApp service.';
      console.error('[WhatsAppService] Edge Function Error:', detail, error);
      if (params.conversationId) {
        await supabase.from('whatsapp_messages').insert({ conversation_id: params.conversationId, direction: 'outbound', message_type: params.type || 'text', message_text: params.text || null, status: 'failed', ai_generated: false });
      }
      return { success: false, error: detail };
    }
  },

  async getCustomerContext(phoneNumber: string) {
    const cleanPhone = stripPhoneFormatting(phoneNumber); const normalizedPhone = normalizePhoneNumber(phoneNumber);
    let { data: customer } = await supabase.from('customers').select('*').eq('phone', normalizedPhone).maybeSingle();
    if (!customer && cleanPhone) { const { data: fallback } = await supabase.from('customers').select('*').ilike('phone', `%${cleanPhone}%`).limit(1).maybeSingle(); customer = fallback; }
    const { data: orders, error: orderError } = await supabase.from('orders').select('*').or(`customer_phone.ilike.%${cleanPhone}%,customer_phone.eq.${normalizedPhone}`).order('created_at', { ascending: false });
    if (orderError) throw orderError; if (!customer && (!orders || orders.length === 0)) return null;
    const latestOrder = orders?.[0]; const totalOrders = customer?.order_count || orders?.length || 0; const totalSpend = Number(customer?.total_spend) || orders?.reduce((sum, o) => sum + (Number(o.total) || 0), 0) || 0;
    return { customer: customer || { name: latestOrder?.customer_name, email: latestOrder?.customer_email, phone: latestOrder?.customer_phone, created_at: latestOrder?.created_at }, stats: { total_orders: totalOrders, total_spend: totalSpend }, latest_order: latestOrder, all_orders: orders?.slice(0, 5) || [] };
  },

  async getTemplates(storeId?: string) { try { let query = supabase.from('whatsapp_template_registry').select('*').order('name'); if (storeId) query = query.eq('store_id', storeId); const { data, error } = await query; if (error) throw error; return data; } catch { return []; } },
  async getKnowledgeBase(storeId?: string) { try { let query = supabase.from('kb_articles').select('*, category:kb_categories(name)').eq('is_published', true).order('created_at', { ascending: false }); if (storeId) query = query.eq('store_id', storeId); const { data } = await query; return data; } catch { return []; } },
  async createArticle(article: any) { const { data, error } = await supabase.from('kb_articles').insert(article).select().single(); if (error) throw error; return data; },
  async updateArticle(id: string, updates: any) { const { data, error } = await supabase.from('kb_articles').update(updates).eq('id', id).select().single(); if (error) throw error; return data; },
  async deleteArticle(id: string) { const { error } = await supabase.from('kb_articles').delete().eq('id', id); if (error) throw error; },
  async getCustomerCareStats(storeId?: string) {
    try { let convQuery = supabase.from('whatsapp_conversations').select('id, status, handling_mode, last_message_at'); let ticketQuery = supabase.from('support_tickets').select('id, status, created_at, resolved_at'); let msgQuery = supabase.from('whatsapp_messages').select('id, direction, created_at'); let salesQuery = supabase.from('sales_recommendations').select('id, status, created_at'); let interestQuery = supabase.from('customer_product_interest').select('id, interest_type, created_at'); if (storeId) { convQuery = convQuery.eq('store_id', storeId); ticketQuery = ticketQuery.eq('store_id', storeId); } const [convs, tickets, msgs, sales, interests] = await Promise.all([convQuery, ticketQuery, msgQuery, salesQuery, interestQuery]); if (convs.error) throw convs.error; const now = new Date(); const todayStart = new Date(now.setHours(0,0,0,0)).toISOString(); return { openConversations: convs.data?.filter(c => c.status === 'open').length || 0, humanTakeover: convs.data?.filter(c => c.handling_mode === 'HUMAN').length || 0, openTickets: tickets.data?.filter(t => t.status === 'open' || t.status === 'in_progress').length || 0, resolvedToday: tickets.data?.filter(t => t.resolved_at && t.resolved_at >= todayStart).length || 0, messagesReceivedToday: msgs.data?.filter(m => m.direction === 'inbound' && m.created_at >= todayStart).length || 0, messagesSentToday: msgs.data?.filter(m => m.direction === 'outbound' && m.created_at >= todayStart).length || 0, recommendationsToday: sales.data?.filter(s => s.created_at >= todayStart).length || 0, clicksToday: interests.data?.filter(i => i.interest_type === 'clicked' && i.created_at >= todayStart).length || 0, conversionsToday: interests.data?.filter(i => i.interest_type === 'purchased' && i.created_at >= todayStart).length || 0 }; } catch { return { openConversations:0,humanTakeover:0,openTickets:0,resolvedToday:0,messagesReceivedToday:0,messagesSentToday:0,recommendationsToday:0,clicksToday:0,conversionsToday:0 }; }
  }
};

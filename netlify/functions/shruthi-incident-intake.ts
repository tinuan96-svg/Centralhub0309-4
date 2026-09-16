import { createClient } from '@supabase/supabase-js';

export const config = {
  schedule: '* * * * *',
};

const OPEN_TICKET_STATUSES = ['open', 'assigned', 'in_progress', 'waiting_customer', 'waiting_internal'];
const LOOKBACK_MS = 2 * 60 * 60 * 1000;
const env = (key: string) => String((globalThis as any).Netlify?.env?.get?.(key) || '').trim();

function isWebsiteIncident(value: unknown) {
  const text = String(value || '').toLowerCase().replace(/[’‘]/g, "'");
  if (!text) return false;
  const mentionsSite = /(website|web site|storefront|site\b|page\b|malluspices|keralagrocery|pocketgrocery|tamilretail|\.com\b)/i.test(text);
  const mentionsProblem = /(\berror\b|\bissue\b|\bproblem\b|503|50[0-9]|unavailable|down\b|not opening|won't open|cannot open|can't open|cannot access|can't access|not loading|loading error|blank page|safari can't open|fetchandcacheonce|response not ok)/i.test(text);
  return mentionsSite && mentionsProblem;
}

function ticketLooksLikeWebsiteIncident(ticket: any) {
  const text = [ticket?.subject, ticket?.description, ticket?.ai_summary].filter(Boolean).join(' ');
  return isWebsiteIncident(text) || String(ticket?.ai_summary || '').includes('Shruthi incident classification: website error reported');
}

export default async function shruthiIncidentIntake() {
  const supabaseUrl = env('NEXT_PUBLIC_SUPABASE_URL') || env('SUPABASE_URL');
  const serviceRoleKey = env('CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY');
  if (!supabaseUrl || !serviceRoleKey) return;

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: globalSetting } = await db.from('system_intelligence_settings').select('value').eq('key', 'automation_global_enabled').maybeSingle();
  if (globalSetting && globalSetting.value === false) return;

  const { data: messages } = await db.from('whatsapp_messages')
    .select('id,conversation_id,message_text,media_caption,created_at')
    .eq('direction', 'inbound')
    .gte('created_at', new Date(Date.now() - LOOKBACK_MS).toISOString())
    .order('created_at', { ascending: false })
    .limit(150);

  const incidents = (messages || []).filter((message: any) =>
    isWebsiteIncident([message.message_text, message.media_caption].filter(Boolean).join(' ')),
  );
  if (!incidents.length) return;

  const latestByConversation = new Map<string, any>();
  for (const message of incidents) {
    if (message.conversation_id && !latestByConversation.has(String(message.conversation_id))) {
      latestByConversation.set(String(message.conversation_id), message);
    }
  }

  const conversationIds = [...latestByConversation.keys()];
  const { data: conversations } = await db.from('whatsapp_conversations')
    .select('id,store_id,contact_id')
    .in('id', conversationIds);
  const conversationById = new Map((conversations || []).map((row: any) => [String(row.id), row]));

  for (const [conversationId, message] of latestByConversation.entries()) {
    const conversation: any = conversationById.get(conversationId);
    if (!conversation?.store_id) continue;

    // Look at recent tickets of every status. A complaint that was already
    // verified and resolved must not create a fresh ticket on the next scan.
    const { data: recentTickets } = await db.from('support_tickets')
      .select('id,ai_summary,status,subject,description,created_at,resolved_at')
      .eq('conversation_id', conversationId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    const relevantTickets = (recentTickets || []).filter(ticketLooksLikeWebsiteIncident);
    const messageAt = Date.parse(String(message.created_at || '')) || 0;
    const alreadyHandled = relevantTickets.find((ticket: any) => {
      if (!['resolved', 'closed'].includes(String(ticket.status || '').toLowerCase())) return false;
      const resolvedAt = Date.parse(String(ticket.resolved_at || '')) || 0;
      return resolvedAt >= messageAt;
    });

    if (alreadyHandled?.id) {
      await db.from('whatsapp_conversations').update({
        status: 'open',
        handling_mode: 'AI',
        updated_at: new Date().toISOString(),
      }).eq('id', conversationId).eq('handling_mode', 'AI_DRAFT');
      continue;
    }

    const existing = relevantTickets.find((ticket: any) => OPEN_TICKET_STATUSES.includes(String(ticket.status || '')));
    const reported = String(message.message_text || message.media_caption || 'Customer reported a website problem.').slice(0, 1500);
    let ticketId = existing?.id || null;
    if (existing?.id) {
      const currentSummary = String(existing.ai_summary || '').trim();
      const marker = 'Shruthi incident classification: website error reported; live verification required.';
      await db.from('support_tickets').update({
        subject: 'Website error / access issue reported by customer',
        priority: 'high',
        ai_summary: currentSummary.includes(marker) ? currentSummary : `${currentSummary}${currentSummary ? '\n\n' : ''}${marker}`,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      const { data: ticket } = await db.from('support_tickets').insert({
        store_id: conversation.store_id,
        contact_id: conversation.contact_id || null,
        conversation_id: conversationId,
        category: 'other',
        priority: 'high',
        status: 'open',
        subject: 'Website error / access issue reported by customer',
        description: reported,
        ai_summary: `Customer reported a website error or access issue. Shruthi incident classification: website error reported; live verification required. Report: ${reported}`,
      }).select('id').single();
      ticketId = ticket?.id || null;
    }
    if (!ticketId) continue;

    await db.from('whatsapp_conversations').update({
      status: 'waiting',
      handling_mode: 'AI_DRAFT',
      updated_at: new Date().toISOString(),
    }).eq('id', conversationId);

    const dedupeKey = `SHRUTHI_INCIDENT_INTAKE:${message.id}`;
    const { data: prior } = await db.from('system_notifications')
      .select('id')
      .contains('metadata', { dedupe_key: dedupeKey })
      .limit(1)
      .maybeSingle();
    if (!prior?.id) {
      await db.from('system_notifications').insert({
        user_id: null,
        store_id: conversation.store_id,
        title: 'Shruthi is checking a live website complaint',
        message: 'A customer reported a website error or access problem. Shruthi has linked it to a support ticket and queued live verification.',
        severity: 'warning',
        category: 'support',
        action_url: `/customer-care/tickets/chat?conversation=${encodeURIComponent(conversationId)}&ticket=${encodeURIComponent(ticketId)}`,
        is_read: false,
        metadata: {
          source: 'shruthi-incident-intake',
          dedupe_key: dedupeKey,
          message_id: message.id,
          ticket_id: ticketId,
          conversation_id: conversationId,
        },
      });
    }
  }
}

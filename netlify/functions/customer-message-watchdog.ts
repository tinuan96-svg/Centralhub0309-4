import { createClient } from '@supabase/supabase-js';

export const config = {
  schedule: '* * * * *',
};

const UNANSWERED_AFTER_MS = 10 * 60 * 1000;
const ACTIVE_TICKET_STATUSES = ['open', 'assigned', 'in_progress', 'waiting_customer', 'waiting_internal'];

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function dateMs(value: unknown) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function sendAttentionPush(params: {
  siteUrl: string;
  pushSecret: string;
  storeId: string;
  conversationId: string;
  contactId: string;
  messageId: string;
  customerName: string;
}) {
  const response = await fetch(`${params.siteUrl}/api/push/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.pushSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Customer message needs attention',
      message: `${params.customerName} has been waiting more than 10 minutes for a reply.`,
      url: `/customer-care/inbox?conversation=${encodeURIComponent(params.conversationId)}`,
      storeId: params.storeId,
      severity: 'warning',
      category: 'customer_message',
      urgency: 'high',
      ttl: 60 * 60,
      metadata: {
        source: 'customer-message-watchdog',
        event_type: 'CUSTOMER_MESSAGE_UNANSWERED',
        message_id: params.messageId,
        conversation_id: params.conversationId,
        contact_id: params.contactId,
        dedupe_key: `CUSTOMER_MESSAGE_TIMEOUT:${params.messageId}`,
      },
    }),
  });

  return {
    ok: response.ok,
    status: response.status,
    body: await response.text().catch(() => ''),
  };
}

export default async function customerMessageWatchdog() {
  const supabaseUrl = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).trim();
  const serviceRoleKey = (
    process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();
  const siteUrl = (
    process.env.CENTRALHUB_SITE_URL ||
    'https://centralhub.network'
  ).replace(/\/$/, '');
  const pushSecret = (process.env.CENTRALHUB_PUSH_API_SECRET || '').trim();

  if (!supabaseUrl || !serviceRoleKey || !pushSecret) {
    return json({
      success: false,
      error: 'Customer-message watchdog configuration is missing.',
    }, 500);
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const cutoff = new Date(Date.now() - UNANSWERED_AFTER_MS).toISOString();

  const { data: conversations, error: conversationError } = await db
    .from('whatsapp_conversations')
    .select('id, store_id, contact_id, status, handling_mode, last_message_at, ai_processing_started_at')
    .in('status', ['open', 'waiting'])
    .lte('last_message_at', cutoff)
    .order('last_message_at', { ascending: true })
    .limit(500);

  if (conversationError) return json({ success: false, error: conversationError.message }, 500);

  const rows = conversations || [];
  const contactIds = [...new Set(rows.map((row: any) => row.contact_id).filter(Boolean))];
  const conversationIds = rows.map((row: any) => row.id);
  const contactsById = new Map<string, any>();
  const activeTicketConversationIds = new Set<string>();

  if (contactIds.length) {
    const { data: contacts } = await db
      .from('whatsapp_contacts')
      .select('id, display_name, phone_number')
      .in('id', contactIds);
    for (const contact of contacts || []) contactsById.set(contact.id, contact);
  }

  if (conversationIds.length) {
    const { data: tickets } = await db
      .from('support_tickets')
      .select('conversation_id')
      .in('conversation_id', conversationIds)
      .in('status', ACTIVE_TICKET_STATUSES);
    for (const ticket of tickets || []) {
      if (ticket.conversation_id) activeTicketConversationIds.add(ticket.conversation_id);
    }
  }

  let inspected = 0;
  let skippedAiProcessing = 0;
  let skippedActiveTicket = 0;
  let notified = 0;
  const failures: Array<{ conversation_id: string; error: string }> = [];

  for (const conversation of rows) {
    inspected += 1;
    if (!conversation.id || !conversation.store_id || !conversation.contact_id) continue;

    if (
      conversation.ai_processing_started_at &&
      Date.now() - dateMs(conversation.ai_processing_started_at) < UNANSWERED_AFTER_MS
    ) {
      skippedAiProcessing += 1;
      continue;
    }

    if (activeTicketConversationIds.has(conversation.id)) {
      skippedActiveTicket += 1;
      continue;
    }

    const { data: messages, error: messageError } = await db
      .from('whatsapp_messages')
      .select('id, direction, status, created_at, message_text')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: false })
      .limit(40);

    if (messageError) {
      failures.push({ conversation_id: conversation.id, error: messageError.message });
      continue;
    }

    const latestInbound = (messages || []).find((message: any) => message.direction === 'inbound');
    if (!latestInbound || Date.now() - dateMs(latestInbound.created_at) < UNANSWERED_AFTER_MS) continue;

    const latestReply = (messages || []).find((message: any) =>
      message.direction === 'outbound' && String(message.status || '').toLowerCase() !== 'failed'
    );
    if (latestReply && dateMs(latestReply.created_at) >= dateMs(latestInbound.created_at)) continue;

    const contact = contactsById.get(conversation.contact_id);
    const push = await sendAttentionPush({
      siteUrl,
      pushSecret,
      storeId: conversation.store_id,
      conversationId: conversation.id,
      contactId: conversation.contact_id,
      messageId: latestInbound.id,
      customerName: contact?.display_name || contact?.phone_number || 'A customer',
    });

    if (push.ok) {
      notified += 1;
    } else {
      failures.push({
        conversation_id: conversation.id,
        error: `Push sender returned ${push.status}: ${push.body.slice(0, 300)}`,
      });
    }
  }

  return json({
    success: failures.length === 0,
    inspected,
    notified,
    skipped_ai_processing: skippedAiProcessing,
    skipped_active_ticket: skippedActiveTicket,
    failures: failures.length ? failures : undefined,
  });
}

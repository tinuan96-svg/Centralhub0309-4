import { createClient } from '@supabase/supabase-js';

export const config = {
  schedule: '*/2 * * * *',
};

// Continuity migration note: the previous implementation used
// `UNANSWERED_AFTER_MS = 45 * 1000`; the current notification policy intentionally
// waits ten minutes so AI replies and ticket handoffs are not raced by a push.
const UNANSWERED_AFTER_MS = 10 * 60 * 1000;

type UnansweredConversation = {
  conversation_id: string;
  store_id: string;
  contact_id: string;
  message_id: string;
  inbound_created_at: string;
  customer_name: string;
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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
      title: 'You have a message from customer',
      message: `${params.customerName} sent a WhatsApp message and is waiting for a reply.`,
      url: `/customer-care/inbox?conversation=${encodeURIComponent(params.conversationId)}`,
      storeId: params.storeId,
      severity: 'warning',
      category: 'customer_message',
      urgency: 'high',
      ttl: 60 * 60,
      metadata: {
        source: 'customer-message-watchdog',
        event_type: 'CUSTOMER_MESSAGE_RECEIVED_OR_UNANSWERED',
        message_id: params.messageId,
        conversation_id: params.conversationId,
        contact_id: params.contactId,
        dedupe_key: `CUSTOMER_MESSAGE:${params.messageId}`,
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
    return json({ success: false, error: 'Customer-message watchdog configuration is missing.' }, 500);
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const cutoff = new Date(Date.now() - UNANSWERED_AFTER_MS).toISOString();

  const { data, error } = await db.rpc('get_unanswered_customer_conversations', {
    p_cutoff: cutoff,
    p_limit: 200,
  });

  if (error) return json({ success: false, error: error.message }, 500);

  const rows = (data || []) as UnansweredConversation[];
  let notified = 0;
  const failures: Array<{ conversation_id: string; error: string }> = [];

  for (const conversation of rows) {
    const push = await sendAttentionPush({
      siteUrl,
      pushSecret,
      storeId: conversation.store_id,
      conversationId: conversation.conversation_id,
      contactId: conversation.contact_id,
      messageId: conversation.message_id,
      customerName: conversation.customer_name || 'A customer',
    });

    if (push.ok) notified += 1;
    else failures.push({
      conversation_id: conversation.conversation_id,
      error: `Push sender returned ${push.status}: ${push.body.slice(0, 300)}`,
    });
  }

  return json({
    success: failures.length === 0,
    inspected: rows.length,
    notified,
    threshold_minutes: UNANSWERED_AFTER_MS / 60_000,
    failures: failures.length ? failures : undefined,
  });
}

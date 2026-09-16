import { createClient } from '@supabase/supabase-js';

export const config = {
  schedule: '*/2 * * * *',
};

const OPEN_TICKET_STATUSES = ['open', 'assigned', 'in_progress', 'waiting_customer', 'waiting_internal'];
const MESSAGE_LOOKBACK_MS = 2 * 60 * 60 * 1000;
const TICKET_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const RECOVERY_COOLDOWN_MS = 30 * 60 * 1000;
const MAX_INCIDENTS_PER_RUN = 5;

const env = (key: string) => String((globalThis as any).Netlify?.env?.get?.(key) || '').trim();

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

function looksLikeWebsiteIncident(value: unknown) {
  const text = String(value || '').toLowerCase().replace(/[’‘]/g, "'");
  if (!text) return false;
  const site = /(website|web site|storefront|site\b|page\b|malluspices|keralagrocery|pocketgrocery|tamilretail|\.com\b)/i.test(text);
  const failure = /(503|50[0-9]|unavailable|down\b|not opening|won't open|cannot open|can't open|accessing|access error|website error|site error|loading error|not loading|blank page|safari can't open|fetchandcacheonce|response not ok)/i.test(text);
  return site && failure;
}

async function fetchHtmlProbe(origin: string, path: string) {
  const started = Date.now();
  try {
    const url = new URL(path, `${origin}/`);
    url.searchParams.set('shruthi_live_probe', Date.now().toString());
    const response = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(9000),
      headers: {
        'user-agent': 'CentralHub-Shruthi-Incident-Responder/1.0',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
      },
    });
    const contentType = response.headers.get('content-type') || '';
    const text = contentType.includes('text/html') ? await response.text() : '';
    if (!text) await response.body?.cancel();
    const lower = text.toLowerCase();
    const htmlOk = response.ok && contentType.includes('text/html') && (lower.includes('<!doctype html') || lower.includes('<html'));
    return {
      path,
      ok: htmlOk,
      status: response.status,
      latency_ms: Date.now() - started,
      angular_app_shell: htmlOk && lower.includes('<app-root'),
      error: htmlOk ? null : `http_${response.status}`,
    };
  } catch (error: any) {
    return {
      path,
      ok: false,
      status: null as number | null,
      latency_ms: Date.now() - started,
      angular_app_shell: false,
      error: error?.message || 'probe_failed',
    };
  }
}

async function probeStorefront(domain: string) {
  const host = String(domain || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const origin = `https://${host}`;
  const root = await fetchHtmlProbe(origin, '/');
  const requiresAppShell = root.angular_app_shell === true;
  const indexHtml = requiresAppShell ? await fetchHtmlProbe(origin, '/index.html') : null;
  const healthy = root.ok && (!requiresAppShell || indexHtml?.ok === true);
  const statuses = [root.status, indexHtml?.status].filter((value): value is number => typeof value === 'number');
  const hasServerError = statuses.some((status) => status >= 500 && status <= 599);
  return {
    healthy,
    hasServerError,
    framework_mode: requiresAppShell ? 'angular_app_shell' : 'generic_html',
    probes: { root, index_html: indexHtml },
  };
}

async function logOnce(db: any, key: string, row: Record<string, unknown>) {
  const now = new Date().toISOString();
  const { data, error } = await db.from('automation_execution_log').upsert({
    action_type: row.action_type,
    status: row.status || 'executed',
    mode: 'guarded',
    idempotency_key: key,
    entity_type: row.entity_type || 'support_ticket',
    entity_id: row.entity_id || null,
    risk_level: row.risk_level ?? 1,
    metadata: row.metadata || {},
    trigger_event: 'scheduled',
    execution_result: row.execution_result || {},
    error_message: row.error_message || null,
    started_at: now,
    completed_at: now,
  }, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id').maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

async function notifyAdmin(db: any, params: {
  storeId: string;
  ticketId: string;
  conversationId?: string | null;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  dedupeKey: string;
  metadata?: Record<string, unknown>;
}) {
  const { data: existing } = await db.from('system_notifications')
    .select('id')
    .contains('metadata', { dedupe_key: params.dedupeKey })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const actionUrl = params.conversationId
    ? `/customer-care/tickets/chat?conversation=${encodeURIComponent(params.conversationId)}&ticket=${encodeURIComponent(params.ticketId)}`
    : `/customer-care/tickets?ticket=${encodeURIComponent(params.ticketId)}`;

  const { data } = await db.from('system_notifications').insert({
    user_id: null,
    store_id: params.storeId,
    title: params.title,
    message: params.message,
    severity: params.severity,
    category: 'support',
    action_url: actionUrl,
    is_read: false,
    metadata: {
      source: 'shruthi-incident-responder',
      ticket_id: params.ticketId,
      conversation_id: params.conversationId || null,
      dedupe_key: params.dedupeKey,
      ...(params.metadata || {}),
    },
  }).select('id').single();
  return data?.id || null;
}

async function ensureWebsiteIncidentTickets(db: any) {
  const since = new Date(Date.now() - MESSAGE_LOOKBACK_MS).toISOString();
  const { data: messages, error } = await db.from('whatsapp_messages')
    .select('id,conversation_id,message_text,media_caption,created_at')
    .eq('direction', 'inbound')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(120);
  if (error) throw error;

  const incidentMessages = (messages || []).filter((message: any) =>
    looksLikeWebsiteIncident([message.message_text, message.media_caption].filter(Boolean).join(' ')),
  );
  if (!incidentMessages.length) return 0;

  const conversationIds = [...new Set(incidentMessages.map((message: any) => message.conversation_id).filter(Boolean))];
  const { data: conversations } = await db.from('whatsapp_conversations')
    .select('id,store_id,contact_id')
    .in('id', conversationIds);
  const conversationById = new Map((conversations || []).map((row: any) => [String(row.id), row]));

  let created = 0;
  for (const message of incidentMessages.slice(0, 20)) {
    const conversation: any = conversationById.get(String(message.conversation_id));
    if (!conversation?.store_id) continue;

    const { data: existing } = await db.from('support_tickets')
      .select('id,status')
      .eq('conversation_id', message.conversation_id)
      .in('status', OPEN_TICKET_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) continue;

    const reported = String(message.message_text || message.media_caption || 'Customer reported a website access problem.').slice(0, 1500);
    const { data: ticket, error: ticketError } = await db.from('support_tickets').insert({
      store_id: conversation.store_id,
      contact_id: conversation.contact_id || null,
      conversation_id: message.conversation_id,
      category: 'other',
      priority: 'high',
      status: 'open',
      subject: 'Website access issue reported by customer',
      description: reported,
      ai_summary: `Customer reported a live website access issue. Shruthi will verify the storefront and attempt only guarded, reversible recovery actions. Report: ${reported}`,
    }).select('id').single();
    if (ticketError || !ticket?.id) continue;

    created += 1;
    await db.from('whatsapp_conversations').update({
      status: 'waiting',
      handling_mode: 'AI_DRAFT',
      updated_at: new Date().toISOString(),
    }).eq('id', message.conversation_id);

    await notifyAdmin(db, {
      storeId: conversation.store_id,
      ticketId: ticket.id,
      conversationId: message.conversation_id,
      title: 'Shruthi is checking a customer-reported website issue',
      message: 'A customer reported that the storefront is not opening correctly. Shruthi has created a ticket and started live verification.',
      severity: 'warning',
      dedupeKey: `SHRUTHI_WEBSITE_INCIDENT:${message.id}`,
      metadata: { message_id: message.id },
    });
  }
  return created;
}

async function triggerRecoveryBuild(supabaseUrl: string, serviceRoleKey: string, siteId: string) {
  const response = await fetch(`${supabaseUrl}/functions/v1/netlify-build-trigger`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ site_id: siteId, clear_cache: true }),
  });
  const raw = await response.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { error: raw }; }
  if (!response.ok || payload?.ok !== true) throw new Error(payload?.error || `netlify_recovery_${response.status}`);
  return payload;
}

async function sendRecoveryReply(db: any, supabaseUrl: string, serviceRoleKey: string, ticket: any, store: any) {
  if (!ticket.conversation_id) return { ok: false, reason: 'ticket_has_no_conversation' };

  const { data: conversation } = await db.from('whatsapp_conversations')
    .select('id,store_id,contact_id,channel_type')
    .eq('id', ticket.conversation_id)
    .maybeSingle();
  if (!conversation?.id || String(conversation.channel_type || 'whatsapp') !== 'whatsapp') {
    return { ok: false, reason: 'automatic_recovery_reply_only_enabled_for_whatsapp' };
  }

  const { data: contact } = await db.from('whatsapp_contacts')
    .select('id,phone_number,display_name')
    .eq('id', conversation.contact_id)
    .maybeSingle();
  if (!contact?.phone_number) return { ok: false, reason: 'customer_phone_missing' };

  const { data: recentOutbound } = await db.from('whatsapp_messages')
    .select('id,message_text,created_at')
    .eq('conversation_id', ticket.conversation_id)
    .eq('direction', 'outbound')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(30);
  const alreadySent = (recentOutbound || []).some((message: any) => {
    const text = String(message.message_text || '').toLowerCase();
    return text.includes('fully operational again') || text.includes('website issue has now been fixed');
  });
  if (alreadySent) return { ok: true, already_sent: true };

  const text = `Hi, just an update — the website issue has now been fixed and ${store.name} is fully operational again. You can access the website normally now. Sorry for the inconvenience, and thank you for letting us know.`;
  const response = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: contact.phone_number,
      type: 'text',
      text,
      conversationId: ticket.conversation_id,
      storeId: ticket.store_id,
    }),
  });
  const raw = await response.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { error: raw }; }
  if (!response.ok || payload?.success !== true || !payload?.message_id) {
    return {
      ok: false,
      reason: payload?.error || `whatsapp_send_${response.status}`,
      window_expired: payload?.window_expired === true || payload?.code === 'WHATSAPP_24H_WINDOW_EXPIRED',
    };
  }

  const now = new Date().toISOString();
  await db.from('whatsapp_messages').upsert({
    conversation_id: ticket.conversation_id,
    wa_message_id: payload.message_id,
    direction: 'outbound',
    message_type: 'text',
    message_text: text,
    status: 'sent',
    ai_generated: true,
    ai_model: 'shruthi-incident-responder',
    channel_type: 'whatsapp',
    updated_at: now,
  }, { onConflict: 'wa_message_id', ignoreDuplicates: true });
  await Promise.all([
    db.from('whatsapp_conversations').update({ status: 'open', handling_mode: 'AI', last_message_at: now, updated_at: now }).eq('id', ticket.conversation_id),
    db.from('whatsapp_contacts').update({ last_message_at: now, updated_at: now }).eq('id', contact.id),
  ]);
  return { ok: true, already_sent: false, message_id: payload.message_id };
}

async function claimRecoveryBuild(db: any, storeId: string, ticket: any, probe: any) {
  const bucket = Math.floor(Date.now() / RECOVERY_COOLDOWN_MS);
  const key = `shruthi:availability-recovery:${storeId}:${bucket}`;
  const now = new Date().toISOString();
  const { data, error } = await db.from('automation_execution_log').upsert({
    action_type: 'shruthi:availability_recovery',
    status: 'executed',
    mode: 'guarded',
    idempotency_key: key,
    entity_type: 'store',
    entity_id: storeId,
    risk_level: 1,
    metadata: {
      source: 'shruthi-incident-responder',
      support_ticket_id: ticket.id,
      conversation_id: ticket.conversation_id || null,
      first_probe: probe,
      recovery_type: 'netlify_clean_rebuild',
    },
    trigger_event: 'customer_reported_incident',
    execution_result: { claimed: true, build_triggered: false },
    started_at: now,
    completed_at: now,
  }, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id').maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

export default async function shruthiIncidentResponder() {
  const supabaseUrl = env('NEXT_PUBLIC_SUPABASE_URL') || env('SUPABASE_URL');
  const serviceRoleKey = env('CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ success: false, error: 'Shruthi incident responder configuration is missing.' }, 500);

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const summary = {
    tickets_created: 0,
    incidents_checked: 0,
    recovery_builds_started: 0,
    customers_updated: 0,
    tickets_resolved: 0,
    escalations: 0,
    failures: [] as string[],
  };

  try {
    const { data: globalSetting } = await db.from('system_intelligence_settings')
      .select('value')
      .eq('key', 'automation_global_enabled')
      .maybeSingle();
    if (globalSetting && globalSetting.value === false) return json({ success: true, enabled: false, ...summary });

    summary.tickets_created = await ensureWebsiteIncidentTickets(db);

    const { data: tickets, error: ticketError } = await db.from('support_tickets')
      .select('id,store_id,conversation_id,contact_id,subject,description,ai_summary,priority,status,created_at')
      .in('status', OPEN_TICKET_STATUSES)
      .gte('created_at', new Date(Date.now() - TICKET_LOOKBACK_MS).toISOString())
      .order('created_at', { ascending: true })
      .limit(30);
    if (ticketError) throw ticketError;

    const incidentTickets = (tickets || []).filter((ticket: any) =>
      looksLikeWebsiteIncident([ticket.subject, ticket.description, ticket.ai_summary].filter(Boolean).join(' ')),
    ).slice(0, MAX_INCIDENTS_PER_RUN);
    if (!incidentTickets.length) return json({ success: true, enabled: true, ...summary });

    const storeIds = [...new Set(incidentTickets.map((ticket: any) => ticket.store_id).filter(Boolean))];
    const [{ data: stores }, { data: configs }] = await Promise.all([
      db.from('stores').select('id,name,slug,domain').in('id', storeIds),
      db.from('site_health_store_configs').select('store_id,netlify_site_id,master_enabled,kill_switch,auto_fix_enabled,execution_mode').in('store_id', storeIds),
    ]);
    const storeById = new Map((stores || []).map((row: any) => [String(row.id), row]));
    const configByStoreId = new Map((configs || []).map((row: any) => [String(row.store_id), row]));

    for (const ticket of incidentTickets) {
      summary.incidents_checked += 1;
      const store: any = storeById.get(String(ticket.store_id));
      const storeConfig: any = configByStoreId.get(String(ticket.store_id));
      if (!store?.domain) {
        summary.escalations += 1;
        await notifyAdmin(db, {
          storeId: ticket.store_id,
          ticketId: ticket.id,
          conversationId: ticket.conversation_id,
          title: 'Shruthi needs help with a website incident',
          message: 'The customer complaint is linked to a store without a live domain, so Shruthi could not verify it safely.',
          severity: 'warning',
          dedupeKey: `SHRUTHI_INCIDENT_NO_DOMAIN:${ticket.id}`,
        });
        continue;
      }

      const first = await probeStorefront(store.domain);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const second = await probeStorefront(store.domain);
      const confirmedHealthy = first.healthy && second.healthy;
      const confirmed5xx = !first.healthy && !second.healthy && first.hasServerError && second.hasServerError;

      if (confirmedHealthy) {
        const reply = await sendRecoveryReply(db, supabaseUrl, serviceRoleKey, ticket, store);
        if (reply.ok) {
          const now = new Date().toISOString();
          await db.from('support_tickets').update({ status: 'resolved', resolved_at: now, updated_at: now }).eq('id', ticket.id);
          summary.tickets_resolved += 1;
          if (!reply.already_sent) summary.customers_updated += 1;
          await logOnce(db, `shruthi:incident-verified:${ticket.id}`, {
            action_type: 'shruthi:incident_verified',
            entity_id: ticket.id,
            metadata: { store_id: ticket.store_id, conversation_id: ticket.conversation_id, probes: { first, second } },
            execution_result: { recovered: true, customer_reply: reply },
          });
          await notifyAdmin(db, {
            storeId: ticket.store_id,
            ticketId: ticket.id,
            conversationId: ticket.conversation_id,
            title: `${store.name} incident verified as resolved`,
            message: reply.already_sent
              ? 'Shruthi verified the storefront is healthy. The customer had already been informed, so the ticket was resolved without sending a duplicate message.'
              : 'Shruthi verified the storefront is healthy, informed the customer in the same WhatsApp chat, and resolved the ticket.',
            severity: 'success',
            dedupeKey: `SHRUTHI_INCIDENT_RESOLVED:${ticket.id}`,
            metadata: { probes: { first, second } },
          });
        } else {
          await db.from('support_tickets').update({ status: 'waiting_internal', updated_at: new Date().toISOString() }).eq('id', ticket.id);
          summary.escalations += 1;
          await notifyAdmin(db, {
            storeId: ticket.store_id,
            ticketId: ticket.id,
            conversationId: ticket.conversation_id,
            title: `${store.name} is healthy, but the customer reply needs attention`,
            message: reply.window_expired
              ? 'Shruthi verified the website is operational, but the WhatsApp 24-hour customer-service window is closed. Open the chat and send an approved template if required.'
              : `Shruthi verified the website is operational but could not send the recovery reply automatically: ${reply.reason}`,
            severity: 'warning',
            dedupeKey: `SHRUTHI_REPLY_FAILED:${ticket.id}`,
            metadata: { reply, probes: { first, second } },
          });
        }
        continue;
      }

      const canAutoRecover = confirmed5xx && storeConfig?.master_enabled === true && storeConfig?.kill_switch !== true && storeConfig?.auto_fix_enabled === true && ['guarded', 'autonomous'].includes(String(storeConfig?.execution_mode || '')) && Boolean(storeConfig?.netlify_site_id);

      if (canAutoRecover) {
        const claimId = await claimRecoveryBuild(db, String(ticket.store_id), ticket, { first, second });
        if (claimId) {
          try {
            const build = await triggerRecoveryBuild(supabaseUrl, serviceRoleKey, String(storeConfig.netlify_site_id));
            await db.from('automation_execution_log').update({
              execution_result: { claimed: true, build_triggered: true, build },
              completed_at: new Date().toISOString(),
            }).eq('id', claimId);
            await db.from('support_tickets').update({ status: 'in_progress', priority: 'urgent', updated_at: new Date().toISOString() }).eq('id', ticket.id);
            summary.recovery_builds_started += 1;
            await notifyAdmin(db, {
              storeId: ticket.store_id,
              ticketId: ticket.id,
              conversationId: ticket.conversation_id,
              title: `Shruthi started safe recovery for ${store.name}`,
              message: 'The customer-reported outage was reproduced twice as a 5xx failure. Shruthi started a clean rebuild of the existing Netlify deployment and will verify it again before telling the customer it is fixed.',
              severity: 'warning',
              dedupeKey: `SHRUTHI_RECOVERY_STARTED:${claimId}`,
              metadata: { build, probes: { first, second } },
            });
          } catch (error: any) {
            await db.from('automation_execution_log').update({
              status: 'failed',
              error_message: error?.message || String(error),
              execution_result: { claimed: true, build_triggered: false },
              completed_at: new Date().toISOString(),
            }).eq('id', claimId);
            summary.failures.push(`recovery:${ticket.id}:${error?.message || String(error)}`);
          }
        }
        continue;
      }

      summary.escalations += 1;
      await db.from('support_tickets').update({ priority: confirmed5xx ? 'urgent' : 'high', status: 'open', updated_at: new Date().toISOString() }).eq('id', ticket.id);
      await notifyAdmin(db, {
        storeId: ticket.store_id,
        ticketId: ticket.id,
        conversationId: ticket.conversation_id,
        title: `Shruthi needs your attention · ${store.name}`,
        message: confirmed5xx
          ? 'Shruthi reproduced the live website failure, but automatic recovery is disabled or not safely available for this store. The ticket remains open for you.'
          : 'Shruthi checked the live website twice but could not confirm a safe, automatically repairable 5xx incident. The ticket remains open with the live-check results attached.',
        severity: confirmed5xx ? 'critical' : 'warning',
        dedupeKey: `SHRUTHI_INCIDENT_ESCALATED:${ticket.id}`,
        metadata: { probes: { first, second }, auto_fix_enabled: storeConfig?.auto_fix_enabled === true },
      });
    }

    return json({ success: summary.failures.length === 0, enabled: true, ...summary }, summary.failures.length ? 207 : 200);
  } catch (error: any) {
    return json({ success: false, enabled: true, ...summary, error: error?.message || String(error) }, 500);
  }
}

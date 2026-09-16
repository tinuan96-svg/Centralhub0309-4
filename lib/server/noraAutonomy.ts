import type { SupabaseClient } from '@supabase/supabase-js';

export type NoraAutonomySource = 'scheduled' | 'manual';

export type NoraAutonomyResult = {
  success: boolean;
  enabled: boolean;
  queued_site_health_fixes: number;
  availability_recovery_builds: number;
  findings: {
    order_sync_failures: number;
    generic_sync_failures: number;
    critical_security_events: number;
    gmail_finance_attention: number;
  };
  failures?: string[];
};

const SETTINGS = ['automation_global_enabled', 'automation_nora_enabled'];
const RECOVERY_COOLDOWN_MS = 30 * 60 * 1000;
const COMPLAINT_LOOKBACK_MS = 30 * 60 * 1000;

function isResolvedStatus(value: unknown) {
  return ['resolved', 'closed', 'ignored'].includes(String(value || '').toLowerCase());
}

function looksLikeWebsiteOutage(value: unknown) {
  const text = String(value || '').toLowerCase();
  const mentionsSite = /(website|web site|storefront|site\b|page\b|\.com\b)/i.test(text);
  const mentionsFailure = /(503|50[0-9]|unavailable|down\b|not opening|cannot open|can't open|accessing|access error|site error|website error|loading error)/i.test(text);
  return mentionsSite && mentionsFailure;
}

async function probeStorefront(domain: string) {
  const host = String(domain || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const origin = `https://${host}`;
  const paths = ['/', '/index.html'];
  const probes: Array<{ path: string; ok: boolean; status: number | null; error: string | null }> = [];

  for (const path of paths) {
    try {
      const url = new URL(path, `${origin}/`);
      url.searchParams.set('shruthi_recovery_probe', Date.now().toString());
      const response = await fetch(url.toString(), {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
        headers: {
          'user-agent': 'CentralHub-Shruthi-Recovery/1.0',
          'cache-control': 'no-cache',
          pragma: 'no-cache',
        },
      });
      const contentType = response.headers.get('content-type') || '';
      let htmlOk = response.ok;
      if (contentType.includes('text/html')) {
        const body = await response.text();
        const lower = body.toLowerCase();
        htmlOk = response.ok && (lower.includes('<!doctype html') || lower.includes('<html'));
      } else {
        await response.body?.cancel();
      }
      probes.push({ path, ok: htmlOk, status: response.status, error: htmlOk ? null : 'invalid_or_failed_response' });
    } catch (error: any) {
      probes.push({ path, ok: false, status: null, error: error?.message || 'probe_failed' });
    }
  }

  const healthy = probes.every((probe) => probe.ok);
  const hasServerError = probes.some((probe) => Number(probe.status || 0) >= 500 && Number(probe.status || 0) <= 599);
  return { healthy, hasServerError, probes };
}

async function triggerRecoveryBuild(siteId: string) {
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
  if (!supabaseUrl || !serviceRoleKey) throw new Error('recovery_build_configuration_missing');

  const response = await fetch(`${supabaseUrl}/functions/v1/netlify-build-trigger`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ site_id: siteId, clear_cache: true }),
  });
  const raw = await response.text();
  let body: any = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }
  if (!response.ok || body?.ok !== true) throw new Error(body?.error || `recovery_build_${response.status}`);
  return body as Record<string, unknown>;
}

async function writeExecutionLog(
  db: SupabaseClient,
  row: {
    action_type: string;
    idempotency_key: string;
    entity_type?: string | null;
    entity_id?: string | null;
    risk_level?: number;
    source: NoraAutonomySource;
    metadata?: Record<string, unknown>;
    execution_result?: Record<string, unknown>;
  },
) {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('automation_execution_log')
    .upsert({
      action_type: row.action_type,
      status: 'executed',
      mode: 'guarded',
      idempotency_key: row.idempotency_key,
      entity_type: row.entity_type || 'nora',
      entity_id: row.entity_id || null,
      risk_level: row.risk_level ?? 1,
      metadata: row.metadata || {},
      trigger_event: row.source,
      execution_result: row.execution_result || {},
      started_at: now,
      completed_at: now,
    }, {
      onConflict: 'idempotency_key',
      ignoreDuplicates: true,
    })
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return { inserted: Boolean(data?.id), id: data?.id };
}

export async function runNoraAutonomy(
  db: SupabaseClient,
  options: { source?: NoraAutonomySource } = {},
): Promise<NoraAutonomyResult> {
  const source = options.source || 'scheduled';
  const failures: string[] = [];

  const { data: settingRows, error: settingsError } = await db
    .from('system_intelligence_settings')
    .select('key,value')
    .in('key', SETTINGS);

  if (settingsError) throw settingsError;
  const settings = new Map((settingRows || []).map((row: any) => [String(row.key), Boolean(row.value)]));
  const enabled = settings.get('automation_global_enabled') === true && settings.get('automation_nora_enabled') === true;

  if (!enabled) {
    return {
      success: true,
      enabled: false,
      queued_site_health_fixes: 0,
      availability_recovery_builds: 0,
      findings: {
        order_sync_failures: 0,
        generic_sync_failures: 0,
        critical_security_events: 0,
        gmail_finance_attention: 0,
      },
    };
  }

  let queuedSiteHealthFixes = 0;
  let availabilityRecoveryBuilds = 0;

  try {
    const { data: configs, error: configError } = await db
      .from('site_health_store_configs')
      .select('store_id')
      .eq('master_enabled', true)
      .eq('kill_switch', false)
      .eq('auto_fix_enabled', true)
      .in('execution_mode', ['guarded', 'autonomous']);

    if (configError) throw configError;
    const allowedStoreIds = [...new Set((configs || []).map((row: any) => row.store_id).filter(Boolean))];

    if (allowedStoreIds.length) {
      const { data: issues, error: issueError } = await db
        .from('site_health_issues')
        .select('id,store_id,check_name,title,severity,risk_level,status')
        .in('store_id', allowedStoreIds)
        .eq('auto_fix_allowed', true)
        .eq('requires_preview', false)
        .eq('risk_level', 'low')
        .eq('status', 'open')
        .order('first_seen_at', { ascending: true })
        .limit(5);

      if (issueError) throw issueError;

      for (const issue of issues || []) {
        const idempotencyKey = `nora:site-health:${issue.id}`;
        const { data: alreadyLogged } = await db
          .from('automation_execution_log')
          .select('id')
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle();
        if (alreadyLogged?.id) continue;

        const { data: queued, error: queueError } = await db
          .from('site_health_issues')
          .update({ status: 'queued', last_seen_at: new Date().toISOString() })
          .eq('id', issue.id)
          .eq('status', 'open')
          .select('id')
          .maybeSingle();

        if (queueError) {
          failures.push(`site_health:${issue.id}:${queueError.message}`);
          continue;
        }
        if (!queued?.id) continue;

        queuedSiteHealthFixes += 1;
        try {
          await writeExecutionLog(db, {
            action_type: 'nora:site_health_queue',
            idempotency_key: idempotencyKey,
            entity_type: 'site_health_issue',
            entity_id: String(issue.id),
            risk_level: 1,
            source,
            metadata: {
              store_id: issue.store_id,
              check_name: issue.check_name,
              title: issue.title,
              severity: issue.severity,
              risk_level: issue.risk_level,
            },
            execution_result: {
              queued: true,
              next_stage: 'existing guarded site-health autofix pipeline',
            },
          });
        } catch (error: any) {
          failures.push(`site_health_log:${issue.id}:${error?.message || String(error)}`);
        }
      }
    }
  } catch (error: any) {
    failures.push(`site_health_scan:${error?.message || String(error)}`);
  }

  // Guarded storefront outage recovery. A customer complaint can nominate a
  // store for immediate verification, but a build is only triggered after two
  // independent probes both confirm a 5xx app-shell failure. This deliberately
  // excludes DNS, auth, payment, order and database remediation.
  try {
    const { data: recoveryConfigs, error: recoveryConfigError } = await db
      .from('site_health_store_configs')
      .select('store_id,netlify_site_id,execution_mode')
      .eq('master_enabled', true)
      .eq('kill_switch', false)
      .eq('auto_fix_enabled', true)
      .in('execution_mode', ['guarded', 'autonomous'])
      .not('netlify_site_id', 'is', null);
    if (recoveryConfigError) throw recoveryConfigError;

    const recoveryStoreIds = [...new Set((recoveryConfigs || []).map((row: any) => row.store_id).filter(Boolean))];
    if (recoveryStoreIds.length) {
      const [{ data: stores }, { data: events }, { data: tickets }] = await Promise.all([
        db.from('stores').select('id,name,slug,domain').in('id', recoveryStoreIds),
        db.from('security_events')
          .select('id,store_id,event_type,severity,status,occurred_at,last_seen_at,details')
          .in('store_id', recoveryStoreIds)
          .eq('source', 'centralhub_probe')
          .eq('event_type', 'availability_failure')
          .in('status', ['open', 'acknowledged'])
          .order('last_seen_at', { ascending: false })
          .limit(50),
        db.from('support_tickets')
          .select('id,store_id,conversation_id,subject,description,ai_summary,status,created_at')
          .in('store_id', recoveryStoreIds)
          .in('status', ['open', 'assigned', 'in_progress'])
          .gte('created_at', new Date(Date.now() - COMPLAINT_LOOKBACK_MS).toISOString())
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      const storeById = new Map((stores || []).map((row: any) => [String(row.id), row]));
      const configByStoreId = new Map((recoveryConfigs || []).map((row: any) => [String(row.store_id), row]));
      const eventByStoreId = new Map<string, any>();
      for (const event of events || []) if (!eventByStoreId.has(String(event.store_id))) eventByStoreId.set(String(event.store_id), event);

      const complaintByStoreId = new Map<string, any>();
      for (const ticket of tickets || []) {
        const text = [ticket.subject, ticket.description, ticket.ai_summary].filter(Boolean).join(' ');
        if (looksLikeWebsiteOutage(text) && !complaintByStoreId.has(String(ticket.store_id))) {
          complaintByStoreId.set(String(ticket.store_id), ticket);
        }
      }

      const candidateStoreIds = new Set<string>([
        ...eventByStoreId.keys(),
        ...complaintByStoreId.keys(),
      ]);

      for (const storeId of candidateStoreIds) {
        const store: any = storeById.get(storeId);
        const config: any = configByStoreId.get(storeId);
        const event: any = eventByStoreId.get(storeId);
        const complaint: any = complaintByStoreId.get(storeId);
        if (!store?.domain || !config?.netlify_site_id) continue;

        // If this candidate came from the availability monitor, require at least
        // two observations separated in time before any automatic recovery.
        if (event) {
          const firstSeen = Date.parse(String(event.occurred_at || ''));
          const lastSeen = Date.parse(String(event.last_seen_at || ''));
          if (!Number.isFinite(firstSeen) || !Number.isFinite(lastSeen) || lastSeen - firstSeen < 30_000) continue;
        }

        const { data: recentRecovery } = await db
          .from('automation_execution_log')
          .select('id,started_at')
          .eq('action_type', 'shruthi:availability_recovery')
          .eq('entity_id', storeId)
          .gte('started_at', new Date(Date.now() - RECOVERY_COOLDOWN_MS).toISOString())
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (recentRecovery?.id) continue;

        const firstProbe = await probeStorefront(String(store.domain));
        if (firstProbe.healthy || !firstProbe.hasServerError) continue;
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const secondProbe = await probeStorefront(String(store.domain));
        if (secondProbe.healthy || !secondProbe.hasServerError) continue;

        try {
          const build = await triggerRecoveryBuild(String(config.netlify_site_id));
          availabilityRecoveryBuilds += 1;
          await writeExecutionLog(db, {
            action_type: 'shruthi:availability_recovery',
            idempotency_key: `shruthi:availability-recovery:${storeId}:${Math.floor(Date.now() / RECOVERY_COOLDOWN_MS)}`,
            entity_type: 'store',
            entity_id: storeId,
            risk_level: 1,
            source,
            metadata: {
              store_name: store.name,
              store_slug: store.slug,
              domain: store.domain,
              security_event_id: event?.id || null,
              support_ticket_id: complaint?.id || null,
              conversation_id: complaint?.conversation_id || null,
              recovery_type: 'netlify_clean_rebuild',
              first_probe: firstProbe,
              second_probe: secondProbe,
            },
            execution_result: {
              triggered: true,
              build,
              verification: 'security monitor must confirm recovery before customer-facing resolution',
            },
          });

          try {
            await db.from('system_notifications').insert({
              user_id: null,
              store_id: storeId,
              title: `Shruthi started automatic recovery for ${store.name}`,
              message: `A repeated 5xx storefront failure was confirmed. A clean rebuild of the existing Netlify deployment has been started and will be verified automatically.`,
              severity: 'high',
              category: 'system',
              action_url: complaint?.id ? `/customer-care/tickets?ticket=${complaint.id}` : '/dashboard',
              metadata: {
                source: 'shruthi_autonomous_recovery',
                store_id: storeId,
                support_ticket_id: complaint?.id || null,
                build_id: (build as any)?.build_id || null,
              },
            });
          } catch {
            // Notification failure must not turn a successful recovery action into a failure.
          }
        } catch (error: any) {
          failures.push(`availability_recovery:${storeId}:${error?.message || String(error)}`);
        }
      }
    }
  } catch (error: any) {
    failures.push(`availability_recovery_scan:${error?.message || String(error)}`);
  }

  let orderSyncFailures = 0;
  let genericSyncFailures = 0;
  let criticalSecurityEvents = 0;
  let gmailFinanceAttention = 0;

  try {
    const { data } = await db.from('order_sync_queue').select('id,status,last_error').in('status', ['failed', 'error']).limit(200);
    orderSyncFailures = (data || []).length;
  } catch (error: any) {
    failures.push(`order_sync_scan:${error?.message || String(error)}`);
  }

  try {
    const { data } = await db.from('sync_queue').select('id,status,error').in('status', ['failed', 'error']).limit(200);
    genericSyncFailures = (data || []).length;
  } catch (error: any) {
    failures.push(`sync_scan:${error?.message || String(error)}`);
  }

  try {
    const { data } = await db
      .from('security_events')
      .select('id,severity,status')
      .in('severity', ['high', 'critical'])
      .order('last_seen_at', { ascending: false })
      .limit(200);
    criticalSecurityEvents = (data || []).filter((row: any) => !isResolvedStatus(row.status)).length;
  } catch (error: any) {
    failures.push(`security_scan:${error?.message || String(error)}`);
  }

  try {
    const { data } = await db
      .from('store_google_finance_settings')
      .select('store_id,gmail_enabled,gmail_scope_granted,last_error,last_success_at')
      .eq('gmail_enabled', true)
      .limit(50);
    gmailFinanceAttention = (data || []).filter((row: any) => !row.gmail_scope_granted || Boolean(String(row.last_error || '').trim())).length;
  } catch (error: any) {
    failures.push(`gmail_finance_scan:${error?.message || String(error)}`);
  }

  const fiveMinuteBucket = Math.floor(Date.now() / (5 * 60 * 1000));
  try {
    await writeExecutionLog(db, {
      action_type: 'nora:diagnostic_scan',
      idempotency_key: `nora:diagnostic:${fiveMinuteBucket}`,
      risk_level: 1,
      source,
      metadata: {
        queued_site_health_fixes: queuedSiteHealthFixes,
        availability_recovery_builds: availabilityRecoveryBuilds,
        order_sync_failures: orderSyncFailures,
        generic_sync_failures: genericSyncFailures,
        critical_security_events: criticalSecurityEvents,
        gmail_finance_attention: gmailFinanceAttention,
      },
      execution_result: {
        safe_actions_executed: queuedSiteHealthFixes + availabilityRecoveryBuilds,
        approval_gated_findings:
          orderSyncFailures + genericSyncFailures + criticalSecurityEvents + gmailFinanceAttention,
        failures,
      },
    });
  } catch (error: any) {
    failures.push(`diagnostic_log:${error?.message || String(error)}`);
  }

  return {
    success: failures.length === 0,
    enabled: true,
    queued_site_health_fixes: queuedSiteHealthFixes,
    availability_recovery_builds: availabilityRecoveryBuilds,
    findings: {
      order_sync_failures: orderSyncFailures,
      generic_sync_failures: genericSyncFailures,
      critical_security_events: criticalSecurityEvents,
      gmail_finance_attention: gmailFinanceAttention,
    },
    failures: failures.length ? failures : undefined,
  };
}

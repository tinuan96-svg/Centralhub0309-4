import type { SupabaseClient } from '@supabase/supabase-js';

export type NoraAutonomySource = 'scheduled' | 'manual';

export type NoraAutonomyResult = {
  success: boolean;
  enabled: boolean;
  queued_site_health_fixes: number;
  findings: {
    order_sync_failures: number;
    generic_sync_failures: number;
    critical_security_events: number;
    gmail_finance_attention: number;
  };
  failures?: string[];
};

const SETTINGS = ['automation_global_enabled', 'automation_nora_enabled'];

function isResolvedStatus(value: unknown) {
  return ['resolved', 'closed', 'ignored'].includes(String(value || '').toLowerCase());
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
  const { data: existing } = await db
    .from('automation_execution_log')
    .select('id')
    .eq('idempotency_key', row.idempotency_key)
    .maybeSingle();

  if (existing?.id) return { inserted: false, id: existing.id };

  const now = new Date().toISOString();
  const { data, error } = await db
    .from('automation_execution_log')
    .insert({
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
    })
    .select('id')
    .single();

  if (error) throw error;
  return { inserted: true, id: data?.id };
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
      findings: {
        order_sync_failures: 0,
        generic_sync_failures: 0,
        critical_security_events: 0,
        gmail_finance_attention: 0,
      },
    };
  }

  let queuedSiteHealthFixes = 0;

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
        order_sync_failures: orderSyncFailures,
        generic_sync_failures: genericSyncFailures,
        critical_security_events: criticalSecurityEvents,
        gmail_finance_attention: gmailFinanceAttention,
      },
      execution_result: {
        safe_actions_executed: queuedSiteHealthFixes,
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
    findings: {
      order_sync_failures: orderSyncFailures,
      generic_sync_failures: genericSyncFailures,
      critical_security_events: criticalSecurityEvents,
      gmail_finance_attention: gmailFinanceAttention,
    },
    failures: failures.length ? failures : undefined,
  };
}

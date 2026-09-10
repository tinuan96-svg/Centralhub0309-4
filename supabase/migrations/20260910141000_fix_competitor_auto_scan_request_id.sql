-- Fix competitor auto-scan trigger for current pg_net return signature.
-- net.http_post(...) returns the request id directly (bigint), not a row with an id column.

create or replace function public.trigger_competitor_auto_scan()
returns void
language plpgsql
set search_path to 'public','net','pg_temp'
as $function$
declare
  v_global boolean := false;
  v_competitor boolean := false;
  v_secret text;
  v_request_id bigint;
begin
  select coalesce((select value from public.system_intelligence_settings where key='automation_global_enabled'), false)
    into v_global;
  select coalesce((select value from public.system_intelligence_settings where key='automation_competitor_enabled'), false)
    into v_competitor;

  if not v_global or not v_competitor then
    insert into public.competitor_audit_logs(action, details)
    values ('AUTOMATION_SKIPPED', jsonb_build_object(
      'module','competitor',
      'global_enabled',v_global,
      'module_enabled',v_competitor,
      'reason',case when not v_global then 'global_kill_switch' else 'module_disabled' end,
      'timestamp',now()
    ));
    return;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='competitor_scan_cron_secret'
  order by created_at desc
  limit 1;

  if nullif(v_secret,'') is null then
    insert into public.competitor_audit_logs(action, details)
    values ('AUTOMATION_BLOCKED', jsonb_build_object('module','competitor','reason','missing_cron_secret','timestamp',now()));
    return;
  end if;

  v_request_id := net.http_post(
    url := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/competitor-price-scanner',
    headers := jsonb_build_object('Content-Type','application/json','x-competitor-scan-secret',v_secret),
    body := '{"action":"scan"}'::jsonb,
    timeout_milliseconds := 120000
  );

  insert into public.competitor_audit_logs(action, details)
  values ('AUTOMATION_TRIGGERED', jsonb_build_object('module','competitor','net_request_id',v_request_id,'timestamp',now()));
end;
$function$;

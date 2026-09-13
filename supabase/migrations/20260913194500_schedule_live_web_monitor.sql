create or replace function public.trigger_live_web_monitor()
returns void
language plpgsql
security definer
set search_path = public, net, vault, pg_temp
as $$
declare
  v_anon_key text;
  v_request_id bigint;
begin
  select decrypted_secret into v_anon_key
  from vault.decrypted_secrets
  where name = 'ANON_KEY'
  order by created_at desc
  limit 1;

  if nullif(v_anon_key, '') is null then
    raise warning 'live_web_monitor skipped: ANON_KEY missing';
    return;
  end if;

  v_request_id := net.http_post(
    url := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/live-web-monitor',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_anon_key,
      'Content-Type', 'application/json'
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function public.trigger_live_web_monitor() from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname = 'live-web-monitor-15m';

select cron.schedule(
  'live-web-monitor-15m',
  '*/15 * * * *',
  'select public.trigger_live_web_monitor();'
);

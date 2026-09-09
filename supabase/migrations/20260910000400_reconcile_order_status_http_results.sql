-- Replace optimistic 202/queued audit state with the actual pg_net response.
-- This makes failed storefront status syncs visible instead of silently healthy.

create or replace function public.reconcile_centralhub_order_sync_responses()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_updated integer := 0;
begin
  update public.centralhub_order_sync_requests r
  set
    status_code = h.status_code,
    response = jsonb_build_object(
      'queued', false,
      'request_id', r.request_id,
      'http_status', h.status_code,
      'content', h.content,
      'error_msg', h.error_msg,
      'timed_out', h.timed_out,
      'completed_at', h.created
    )
  from net._http_response h
  where r.operation = 'STATUS_PUSH'
    and r.request_id = h.id
    and r.created_at >= now() - interval '7 days'
    and (
      r.status_code = 202
      or coalesce(r.response ->> 'queued', 'false') = 'true'
    );

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$function$;

revoke execute on function public.reconcile_centralhub_order_sync_responses() from public, anon, authenticated;
grant execute on function public.reconcile_centralhub_order_sync_responses() to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'reconcile-order-status-sync-responses';

select cron.schedule(
  'reconcile-order-status-sync-responses',
  '* * * * *',
  'select public.reconcile_centralhub_order_sync_responses();'
);

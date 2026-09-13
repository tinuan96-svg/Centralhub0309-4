-- Reclaim pg_net response-table bloat safely and keep it from regrowing.
lock table net.http_request_queue in access exclusive mode;
lock table net._http_response in access exclusive mode;

DO $$
DECLARE
  v_http_queue bigint;
  v_webhook_queue bigint;
  v_status_queue bigint;
BEGIN
  select count(*) into v_http_queue from net.http_request_queue;
  select count(*) into v_webhook_queue from public.webhook_logs where status = 'queued';
  select count(*) into v_status_queue
  from public.centralhub_order_sync_requests
  where operation = 'STATUS_PUSH'
    and request_id is not null
    and (status_code = 202 or coalesce(response ->> 'queued', 'false') = 'true');

  if v_http_queue <> 0 or v_webhook_queue <> 0 or v_status_queue <> 0 then
    raise exception 'pg_net bloat cleanup aborted: http_queue=%, webhook_queue=%, status_queue=%',
      v_http_queue, v_webhook_queue, v_status_queue;
  end if;
END $$;

-- net._http_response is a transient pg_net response cache. With all CentralHub
-- reconciliation queues drained and the pg_net request queue locked, truncation
-- safely returns the bloated heap pages immediately without VACUUM FULL downtime.
truncate table net._http_response;

-- pg_net deletes old responses itself. Vacuuming the hot response table regularly
-- keeps those deleted pages reusable so the historical multi-GB bloat does not recur.
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  select jobid into v_jobid
  from cron.job
  where jobname = 'vacuum-pg-net-http-response'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'vacuum-pg-net-http-response',
    '*/30 * * * *',
    'VACUUM (ANALYZE) net._http_response'
  );
END $$;

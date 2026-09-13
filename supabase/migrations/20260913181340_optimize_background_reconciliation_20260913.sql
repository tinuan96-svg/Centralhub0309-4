-- CentralHub production efficiency repair: bounded pg_net reconciliation,
-- stale queue terminalisation, watchdog/reporting RPCs, and targeted indexes.

create index if not exists idx_orders_packed_by_user
  on public.orders (packed_by_user)
  where packed_by_user is not null;

create index if not exists idx_centralhub_order_sync_pending
  on public.centralhub_order_sync_requests (created_at, request_id)
  where operation = 'STATUS_PUSH'
    and request_id is not null
    and (status_code = 202 or coalesce(response ->> 'queued', 'false') = 'true');

create index if not exists idx_whatsapp_messages_conversation_direction_created
  on public.whatsapp_messages (conversation_id, direction, created_at desc);

drop index if exists public.idx_exec_log_key;
drop index if exists public.webhook_logs_queued_request_id_idx;

create or replace function public.reconcile_webhook_logs_from_net(p_limit integer default 500)
returns integer
language plpgsql
set search_path = 'public', 'net', 'pg_temp'
as $function$
declare
  v_updated integer := 0;
  v_expired integer := 0;
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 500);
begin
  if not pg_try_advisory_xact_lock(hashtext('centralhub:reconcile_webhook_logs_from_net')) then
    return 0;
  end if;

  with pending as (
    select
      wl.id as log_id,
      (wl.response::jsonb ->> 'request_id')::bigint as request_id,
      coalesce(wl.response::jsonb ->> 'target', '') as target_name
    from public.webhook_logs wl
    where wl.status = 'queued'
      and wl.response is not null
      and wl.response like '{%'
      and wl.created_at >= now() - interval '7 hours'
    order by wl.created_at asc
    limit v_limit
  ),
  matched as (
    select
      p.log_id,
      p.request_id,
      p.target_name,
      coalesce(r.status_code, case when r.timed_out then 504 else 520 end) as effective_status_code,
      coalesce(r.timed_out, false) as timed_out,
      r.error_msg,
      r.content,
      r.created as net_created_at
    from pending p
    join net._http_response r
      on r.id = p.request_id
     and r.created >= now() - interval '6 hours'
  )
  update public.webhook_logs wl
  set
    status_code = m.effective_status_code,
    success = (not m.timed_out) and m.error_msg is null and m.effective_status_code between 200 and 299,
    status = case
      when (not m.timed_out) and m.error_msg is null and m.effective_status_code between 200 and 299 then 'delivered'
      else 'failed'
    end,
    response_body = case
      when m.error_msg is not null then m.error_msg
      when m.timed_out then 'request_timed_out'
      else coalesce(m.content, '')
    end,
    response = jsonb_build_object(
      'request_id', m.request_id,
      'target', m.target_name,
      'net_created_at', m.net_created_at,
      'timed_out', m.timed_out,
      'error_msg', m.error_msg
    )::text
  from matched m
  where wl.id = m.log_id;

  get diagnostics v_updated = row_count;

  with stale as (
    select wl.id,
           (wl.response::jsonb ->> 'request_id')::bigint as request_id,
           coalesce(wl.response::jsonb ->> 'target', '') as target_name
    from public.webhook_logs wl
    where wl.status = 'queued'
      and wl.response is not null
      and wl.response like '{%'
      and wl.created_at < now() - interval '7 hours'
    order by wl.created_at asc
    limit v_limit
  )
  update public.webhook_logs wl
  set
    status_code = 504,
    success = false,
    status = 'failed',
    response_body = 'pg_net_response_expired_before_reconciliation',
    response = jsonb_build_object(
      'request_id', s.request_id,
      'target', s.target_name,
      'queued', false,
      'timed_out', true,
      'error_msg', 'pg_net_response_expired_before_reconciliation',
      'completed_at', now()
    )::text
  from stale s
  where wl.id = s.id;

  get diagnostics v_expired = row_count;
  return v_updated + v_expired;
end;
$function$;

create or replace function public.reconcile_centralhub_order_sync_responses()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_updated integer := 0;
  v_expired integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('centralhub:reconcile_order_status_sync')) then
    return 0;
  end if;

  with pending as (
    select r.id, r.request_id
    from public.centralhub_order_sync_requests r
    where r.operation = 'STATUS_PUSH'
      and r.request_id is not null
      and r.created_at >= now() - interval '7 hours'
      and (
        r.status_code = 202
        or coalesce(r.response ->> 'queued', 'false') = 'true'
      )
    order by r.created_at asc
    limit 500
  ),
  matched as (
    select
      p.id,
      p.request_id,
      coalesce(h.status_code, case when h.timed_out then 504 else 520 end) as effective_status_code,
      coalesce(h.timed_out, false) as timed_out,
      h.error_msg,
      h.content,
      h.created
    from pending p
    join net._http_response h
      on h.id = p.request_id
     and h.created >= now() - interval '6 hours'
  )
  update public.centralhub_order_sync_requests r
  set
    status_code = m.effective_status_code,
    response = jsonb_build_object(
      'queued', false,
      'request_id', m.request_id,
      'http_status', m.effective_status_code,
      'content', m.content,
      'error_msg', m.error_msg,
      'timed_out', m.timed_out,
      'completed_at', m.created
    )
  from matched m
  where r.id = m.id;

  get diagnostics v_updated = row_count;

  with stale as (
    select r.id, r.request_id
    from public.centralhub_order_sync_requests r
    where r.operation = 'STATUS_PUSH'
      and r.request_id is not null
      and r.created_at < now() - interval '7 hours'
      and (
        r.status_code = 202
        or coalesce(r.response ->> 'queued', 'false') = 'true'
      )
    order by r.created_at asc
    limit 500
  )
  update public.centralhub_order_sync_requests r
  set
    status_code = 504,
    response = jsonb_build_object(
      'queued', false,
      'request_id', s.request_id,
      'http_status', 504,
      'content', null,
      'error_msg', 'pg_net_response_expired_before_reconciliation',
      'timed_out', true,
      'completed_at', now()
    )
  from stale s
  where r.id = s.id;

  get diagnostics v_expired = row_count;
  return v_updated + v_expired;
end;
$function$;

revoke execute on function public.reconcile_centralhub_order_sync_responses() from public, anon, authenticated;
grant execute on function public.reconcile_centralhub_order_sync_responses() to service_role;

create or replace function public.trigger_primary_competitor_discovery()
returns void
language plpgsql
set search_path = 'public', 'net', 'pg_temp'
as $function$
declare
  v_global boolean := false;
  v_competitor boolean := false;
  v_secret text;
  v_competitor_id uuid;
  v_request_id bigint;
begin
  select coalesce((select value from public.system_intelligence_settings where key='automation_global_enabled'), false)
    into v_global;
  select coalesce((select value from public.system_intelligence_settings where key='automation_competitor_enabled'), false)
    into v_competitor;

  if not v_global or not v_competitor then
    return;
  end if;

  select c.id
    into v_competitor_id
  from public.competitors c
  where c.is_primary_market = true
    and c.is_active = true
    and nullif(c.website_url,'') is not null
    and (
      c.last_discovery_requested_at is null
      or c.last_discovery_requested_at <= now() -
        case when c.discovery_status = 'failed' then interval '6 hours' else interval '24 hours' end
    )
  order by c.last_discovery_requested_at nulls first, c.display_order
  limit 1;

  if v_competitor_id is null then
    return;
  end if;

  select decrypted_secret
    into v_secret
  from vault.decrypted_secrets
  where name = 'competitor_scan_cron_secret'
  order by created_at desc
  limit 1;

  if nullif(v_secret,'') is null then
    insert into public.competitor_audit_logs(action, details)
    values (
      'DISCOVERY_AUTOMATION_BLOCKED',
      jsonb_build_object('module','competitor','reason','missing_cron_secret','timestamp',now())
    );
    return;
  end if;

  update public.competitors
  set last_discovery_requested_at = now()
  where id = v_competitor_id;

  v_request_id := net.http_post(
    url := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/competitor-price-scanner',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-competitor-scan-secret',v_secret
    ),
    body := jsonb_build_object(
      'action','discover',
      'competitor_id',v_competitor_id
    ),
    timeout_milliseconds := 120000
  );

  insert into public.competitor_audit_logs(action, details)
  values (
    'DISCOVERY_AUTOMATION_TRIGGERED',
    jsonb_build_object(
      'module','competitor',
      'competitor_id',v_competitor_id,
      'net_request_id',v_request_id,
      'timestamp',now()
    )
  );
end;
$function$;

create or replace function public.get_unanswered_customer_conversations(
  p_cutoff timestamptz,
  p_limit integer default 200
)
returns table (
  conversation_id uuid,
  store_id uuid,
  contact_id uuid,
  message_id uuid,
  inbound_created_at timestamptz,
  customer_name text
)
language sql
stable
set search_path = 'public', 'pg_temp'
as $function$
  select
    c.id as conversation_id,
    c.store_id,
    c.contact_id,
    inbound.id as message_id,
    inbound.created_at as inbound_created_at,
    coalesce(nullif(ct.display_name, ''), nullif(ct.phone_number, ''), 'A customer') as customer_name
  from public.whatsapp_conversations c
  join lateral (
    select m.id, m.created_at
    from public.whatsapp_messages m
    where m.conversation_id = c.id
      and m.direction = 'inbound'
    order by m.created_at desc
    limit 1
  ) inbound on true
  left join lateral (
    select m.created_at
    from public.whatsapp_messages m
    where m.conversation_id = c.id
      and m.direction = 'outbound'
      and coalesce(lower(m.status), '') <> 'failed'
    order by m.created_at desc
    limit 1
  ) outbound on true
  left join public.whatsapp_contacts ct on ct.id = c.contact_id
  where c.status in ('open', 'waiting')
    and c.last_message_at <= p_cutoff
    and inbound.created_at <= p_cutoff
    and (c.ai_processing_started_at is null or c.ai_processing_started_at <= p_cutoff)
    and (outbound.created_at is null or outbound.created_at < inbound.created_at)
    and not exists (
      select 1
      from public.support_tickets st
      where st.conversation_id = c.id
        and st.status in ('open','assigned','in_progress','waiting_customer','waiting_internal')
    )
  order by inbound.created_at asc
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
$function$;

revoke execute on function public.get_unanswered_customer_conversations(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.get_unanswered_customer_conversations(timestamptz, integer) to service_role;

create or replace function public.get_daily_paid_order_summary(
  p_local_date date,
  p_timezone text default 'Europe/London'
)
returns table (
  paid_order_count bigint,
  sales numeric,
  profit numeric
)
language sql
stable
set search_path = 'public', 'pg_temp'
as $function$
  select
    count(*)::bigint as paid_order_count,
    coalesce(sum(coalesce(o.total, o.total_amount, 0)), 0)::numeric as sales,
    coalesce(sum(
      coalesce(
        o.order_profit,
        coalesce(o.total, o.total_amount, 0) - coalesce(o.product_cost_total, o.order_cost, 0)
      )
    ), 0)::numeric as profit
  from public.orders o
  where (o.created_at at time zone p_timezone)::date = p_local_date
    and lower(coalesce(o.payment_status, '')) = 'paid'
    and lower(coalesce(nullif(o.order_status, ''), o.status, '')) not in
      ('cancelled','refunded','failed','payment_failed','returned')
    and coalesce(o.is_deleted, false) = false;
$function$;

revoke execute on function public.get_daily_paid_order_summary(date, text) from public, anon, authenticated;
grant execute on function public.get_daily_paid_order_summary(date, text) to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'reconcile_webhook_logs_from_net';

select cron.schedule(
  'reconcile_webhook_logs_from_net',
  '*/2 * * * *',
  'select public.reconcile_webhook_logs_from_net(500);'
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'reconcile-order-status-sync-responses';

select cron.schedule(
  'reconcile-order-status-sync-responses',
  '*/2 * * * *',
  'select public.reconcile_centralhub_order_sync_responses();'
);

analyze public.orders;
analyze public.webhook_logs;
analyze public.centralhub_order_sync_requests;
analyze public.whatsapp_conversations;
analyze public.whatsapp_messages;
analyze public.support_tickets;

-- Fix automatic order-status WhatsApp notifications getting stuck in `queued`.
--
-- Root causes:
-- 1. queue_order_whatsapp_notification() wrote the legacy columns only
--    (phone_number/order_status/template_name) and omitted the canonical
--    customer_phone/event_key/order_number fields used by whatsapp-retry-worker.
-- 2. It did not create a whatsapp_notification_queue row, so the worker never
--    saw those notifications.
-- 3. Some status rules (shipment_booked/out_for_delivery/returned) had no
--    corresponding event-template mapping.
--
-- The fix is deliberately idempotent and does not replay old customer messages.

create unique index if not exists ux_whatsapp_notification_queue_notification_id
  on public.whatsapp_notification_queue(notification_id);

-- Make each enabled MalluSpices/order-status rule resolvable by the canonical
-- worker event key: order.<status>. This also fills currently missing mappings
-- such as order.shipment_booked, order.out_for_delivery and order.returned.
insert into public.whatsapp_event_template_mappings (
  store_id,
  event_key,
  event_type,
  event_source,
  description,
  template_id,
  enabled,
  customer_visible,
  requires_opt_in,
  variables,
  trigger_function,
  trigger_table,
  trigger_condition,
  created_at,
  updated_at
)
select
  r.store_id,
  'order.' || r.order_status,
  'TRANSACTIONAL',
  'ORDER_SERVICE',
  'Order status: ' || replace(r.order_status, '_', ' '),
  t.id,
  true,
  true,
  false,
  coalesce(t.variables, '[]'::jsonb),
  'queue_order_whatsapp_notification',
  'orders',
  jsonb_build_object('order_status', r.order_status),
  now(),
  now()
from public.order_whatsapp_template_rules r
join public.whatsapp_template_registry t
  on t.store_id = r.store_id
 and t.meta_template_name = r.template_name
where r.enabled = true
  and r.store_id is not null
  and lower(coalesce(t.status, '')) in ('active', 'approved')
on conflict (store_id, event_key) do update set
  event_type = excluded.event_type,
  event_source = excluded.event_source,
  description = excluded.description,
  template_id = excluded.template_id,
  enabled = true,
  customer_visible = true,
  requires_opt_in = false,
  variables = excluded.variables,
  trigger_function = excluded.trigger_function,
  trigger_table = excluded.trigger_table,
  trigger_condition = excluded.trigger_condition,
  updated_at = now();

create or replace function public.queue_order_whatsapp_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  rule_rec record;
  v_phone text;
  v_event_key text;
  v_notification_id uuid;
  v_notification_status text;
begin
  if new.order_status is null
     or new.order_status is not distinct from old.order_status then
    return new;
  end if;

  select * into rule_rec
  from public.order_whatsapp_template_rules
  where store_id = new.store_id
    and order_status = new.order_status
    and enabled = true
  limit 1;

  if not found then
    select * into rule_rec
    from public.order_whatsapp_template_rules
    where store_id is null
      and order_status = new.order_status
      and enabled = true
    limit 1;
  end if;

  -- No explicit enabled rule means this state transition is intentionally
  -- silent. We do not invent customer messages for every internal WMS state.
  if not found then
    return new;
  end if;

  v_phone := nullif(
    regexp_replace(coalesce(new.customer_phone, ''), '[^0-9+]', '', 'g'),
    ''
  );
  if v_phone is null then
    return new;
  end if;

  v_event_key := 'order.' || new.order_status;

  insert into public.order_whatsapp_notifications (
    order_id,
    order_status,
    template_name,
    language,
    phone_number,
    store_id,
    status,
    event_key,
    customer_phone,
    order_number,
    retry_count,
    updated_at
  ) values (
    new.id,
    new.order_status,
    rule_rec.template_name,
    coalesce(rule_rec.language, 'en_GB'),
    v_phone,
    new.store_id,
    'queued',
    v_event_key,
    v_phone,
    new.order_number,
    0,
    now()
  )
  on conflict (order_id, order_status) do update set
    template_name = excluded.template_name,
    language = excluded.language,
    phone_number = excluded.phone_number,
    store_id = excluded.store_id,
    event_key = excluded.event_key,
    customer_phone = excluded.customer_phone,
    order_number = excluded.order_number,
    retry_count = case
      when public.order_whatsapp_notifications.status in ('sent','delivered','read','superseded')
        then public.order_whatsapp_notifications.retry_count
      else 0
    end,
    status = case
      when public.order_whatsapp_notifications.status in ('sent','delivered','read','superseded')
        then public.order_whatsapp_notifications.status
      else 'queued'
    end,
    error_message = case
      when public.order_whatsapp_notifications.status in ('sent','delivered','read','superseded')
        then public.order_whatsapp_notifications.error_message
      else null
    end,
    updated_at = now()
  returning id, status into v_notification_id, v_notification_status;

  if v_notification_status in ('sent','delivered','read','superseded') then
    return new;
  end if;

  insert into public.whatsapp_notification_queue (
    notification_id,
    retry_count,
    max_retries,
    next_retry_at,
    status,
    last_error,
    created_at,
    updated_at
  ) values (
    v_notification_id,
    0,
    3,
    now(),
    'pending',
    null,
    now(),
    now()
  )
  on conflict (notification_id) do nothing;

  return new;
exception
  when others then
    -- Messaging is a secondary side effect. Never roll back the warehouse/order
    -- state transition because Meta, queueing or template configuration failed.
    return new;
end;
$function$;

revoke execute on function public.queue_order_whatsapp_notification()
  from public, anon, authenticated;

-- Reconcile MS-PEND-000009 with the already-delivered/read confirmation message
-- instead of sending the customer a duplicate confirmation now. Resolve the
-- message dynamically from the recorded conversation using the order number.
with matched as (
  select distinct on (o.id)
    o.id as order_id,
    o.order_number,
    wm.wa_message_id,
    wm.status as message_status,
    wm.created_at as sent_at,
    wol.delivered_at,
    wol.read_at
  from public.orders o
  join public.whatsapp_messages wm
    on wm.direction = 'outbound'
   and wm.wa_message_id is not null
   and wm.message_text ilike '%' || o.order_number || '%'
  left join public.whatsapp_outbound_log wol
    on wol.wa_message_id = wm.wa_message_id
  where o.order_number = 'MS-PEND-000009'
    and wm.status in ('sent','delivered','read')
  order by o.id, wm.created_at desc
)
update public.order_whatsapp_notifications n
set
  event_key = 'order.confirmed',
  customer_phone = coalesce(n.customer_phone, n.phone_number),
  order_number = m.order_number,
  wa_message_id = m.wa_message_id,
  status = case
    when m.read_at is not null or m.message_status = 'read' then 'read'
    when m.delivered_at is not null or m.message_status = 'delivered' then 'delivered'
    else 'sent'
  end,
  sent_at = coalesce(n.sent_at, m.sent_at),
  delivered_at = coalesce(n.delivered_at, m.delivered_at),
  read_at = coalesce(n.read_at, m.read_at),
  error_message = null,
  updated_at = now()
from matched m
where n.order_id = m.order_id
  and n.order_status = 'confirmed'
  and n.status = 'queued';

-- Do not suddenly replay old status notifications after repairing the queue.
-- Late transactional messages can confuse customers and duplicate messages that
-- may already have been handled manually through the inbox.
update public.order_whatsapp_notifications n
set
  status = 'superseded',
  event_key = coalesce(n.event_key, case when n.order_status is not null then 'order.' || n.order_status end),
  customer_phone = coalesce(n.customer_phone, n.phone_number),
  order_number = coalesce(n.order_number, o.order_number),
  error_message = 'Legacy queued notification predates automatic queue repair; intentionally not replayed to avoid a stale customer message.',
  updated_at = now()
from public.orders o
where o.id = n.order_id
  and n.status = 'queued'
  and n.created_at < now() - interval '30 minutes';

-- Repair only fresh orphaned rows whose status still matches the live order and
-- queue them for normal processing. This recovers a just-created status update
-- without broadcasting historical messages.
update public.order_whatsapp_notifications n
set
  event_key = coalesce(n.event_key, 'order.' || n.order_status),
  customer_phone = coalesce(n.customer_phone, n.phone_number),
  order_number = coalesce(n.order_number, o.order_number),
  updated_at = now()
from public.orders o
where o.id = n.order_id
  and n.status = 'queued'
  and n.created_at >= now() - interval '30 minutes'
  and n.order_status is not null
  and n.order_status = o.order_status;

insert into public.whatsapp_notification_queue (
  notification_id,
  retry_count,
  max_retries,
  next_retry_at,
  status,
  last_error,
  created_at,
  updated_at
)
select
  n.id,
  0,
  3,
  now(),
  'pending',
  null,
  now(),
  now()
from public.order_whatsapp_notifications n
join public.orders o on o.id = n.order_id
join public.order_whatsapp_template_rules r
  on r.store_id = n.store_id
 and r.order_status = n.order_status
 and r.enabled = true
where n.status = 'queued'
  and n.created_at >= now() - interval '30 minutes'
  and n.event_key is not null
  and coalesce(n.customer_phone, n.phone_number) is not null
  and o.order_status = n.order_status
on conflict (notification_id) do nothing;

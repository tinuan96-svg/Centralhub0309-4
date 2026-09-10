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
  v_is_malluspices boolean := false;
begin
  if new.order_status is null
     or new.order_status is not distinct from old.order_status then
    return new;
  end if;

  select exists(
    select 1
    from public.stores s
    where s.id = new.store_id
      and lower(coalesce(s.slug, '')) = 'malluspices'
  ) into v_is_malluspices;

  -- Never create a fresh customer-facing lifecycle message for a historical
  -- MalluSpices order just because an old row was re-synchronised/backfilled.
  if v_is_malluspices
     and new.created_at is not null
     and new.created_at < now() - interval '60 days' then
    return new;
  end if;

  -- If the order advances again before a queued notification is sent, retire
  -- the older pending status so customers never receive an obsolete stage.
  update public.order_whatsapp_notifications n
  set status = 'superseded',
      error_message = 'Superseded because the order advanced to ' || new.order_status || ' before this notification was sent.',
      updated_at = now()
  where n.order_id = new.id
    and n.order_status is distinct from new.order_status
    and n.status in ('queued','sending','failed');

  update public.whatsapp_notification_queue q
  set status = 'completed',
      last_error = 'Superseded by a newer order status before send.',
      updated_at = now()
  from public.order_whatsapp_notifications n
  where q.notification_id = n.id
    and n.order_id = new.id
    and n.order_status is distinct from new.order_status
    and n.status = 'superseded'
    and q.status in ('pending','retry');

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
    return new;
end;
$function$;

revoke execute on function public.queue_order_whatsapp_notification()
  from public, anon, authenticated;

update public.order_whatsapp_notifications n
set status = 'superseded',
    error_message = 'Historical order safety guard: notification suppressed to prevent stale customer messaging.',
    updated_at = now()
from public.orders o, public.stores s
where n.order_id = o.id
  and o.store_id = s.id
  and lower(coalesce(s.slug,'')) = 'malluspices'
  and o.created_at < now() - interval '60 days'
  and n.status in ('queued','sending','failed');

update public.whatsapp_notification_queue q
set status = 'completed',
    last_error = 'Historical order safety guard: notification suppressed.',
    updated_at = now()
from public.order_whatsapp_notifications n
where q.notification_id = n.id
  and n.status = 'superseded'
  and q.status in ('pending','retry');
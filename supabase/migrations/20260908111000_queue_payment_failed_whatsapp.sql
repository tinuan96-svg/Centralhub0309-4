-- Queue WhatsApp payment-failed notifications through the existing CentralHub
-- template registry + notification queue. This deliberately does not create or
-- duplicate WhatsApp templates: admins continue to manage/link templates in
-- Customer Care > Templates using event key `payment.failed`.

create or replace function public.queue_payment_failed_whatsapp()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_mapping record;
  v_notification_id uuid;
begin
  -- Only act on a real transition into the failed state.
  if new.payment_status is not distinct from old.payment_status
     or coalesce(new.payment_status, '') <> 'failed' then
    return new;
  end if;

  -- A notification cannot be delivered without store ownership + recipient.
  if new.store_id is null or nullif(btrim(coalesce(new.customer_phone, '')), '') is null then
    return new;
  end if;

  -- Reuse the single canonical event -> template mapping. If the admin has not
  -- linked a Meta template yet, do nothing; the Templates screen remains the
  -- source of truth and no synthetic/placeholder template is created.
  select
    m.channel_id,
    t.meta_template_name
  into v_mapping
  from public.whatsapp_event_template_mappings m
  join public.whatsapp_template_registry t on t.id = m.template_id
  where m.store_id = new.store_id
    and m.event_key = 'payment.failed'
    and m.enabled = true
    and coalesce(t.status, 'active') = 'active'
  order by m.updated_at desc nulls last, m.created_at desc nulls last
  limit 1;

  if not found then
    return new;
  end if;

  insert into public.order_whatsapp_notifications (
    store_id,
    order_id,
    order_number,
    customer_phone,
    event_key,
    template_name,
    channel_id,
    status,
    error_message
  ) values (
    new.store_id,
    new.id,
    new.order_number,
    new.customer_phone,
    'payment.failed',
    v_mapping.meta_template_name,
    v_mapping.channel_id,
    'queued',
    null
  )
  returning id into v_notification_id;

  -- The existing whatsapp-retry-worker is already the canonical queued sender;
  -- next_retry_at=now() makes this an initial queued send, not a duplicate sender.
  insert into public.whatsapp_notification_queue (
    notification_id,
    retry_count,
    max_retries,
    next_retry_at,
    status,
    last_error
  ) values (
    v_notification_id,
    0,
    3,
    now(),
    'pending',
    null
  );

  return new;
end;
$$;

drop trigger if exists trg_queue_payment_failed_whatsapp on public.orders;
create trigger trg_queue_payment_failed_whatsapp
after update of payment_status on public.orders
for each row
when (old.payment_status is distinct from new.payment_status and new.payment_status = 'failed')
execute function public.queue_payment_failed_whatsapp();

comment on function public.queue_payment_failed_whatsapp() is
  'Queues the existing store-scoped WhatsApp template mapped to payment.failed whenever an order transitions to payment_status=failed.';

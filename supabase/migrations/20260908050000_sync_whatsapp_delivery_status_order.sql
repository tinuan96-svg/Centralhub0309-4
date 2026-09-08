-- Keep WhatsApp delivery state monotonic and recover status callbacks
-- that arrive before the outbound message row is inserted.

create or replace function public.whatsapp_delivery_effective_status(
  p_status text,
  p_delivered_at timestamptz,
  p_read_at timestamptz,
  p_failed_at timestamptz
)
returns text
language plpgsql
immutable
as $$
begin
  if p_read_at is not null or lower(coalesce(p_status, '')) = 'read' then
    return 'read';
  end if;
  if p_delivered_at is not null or lower(coalesce(p_status, '')) = 'delivered' then
    return 'delivered';
  end if;
  if p_failed_at is not null or lower(coalesce(p_status, '')) = 'failed' then
    return 'failed';
  end if;
  if lower(coalesce(p_status, '')) = 'sent' then
    return 'sent';
  end if;
  return null;
end;
$$;

create or replace function public.enforce_whatsapp_message_status_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    if old.status = 'read' and new.status <> 'read' then
      new.status := old.status;
    elsif old.status = 'delivered' and new.status not in ('delivered', 'read') then
      new.status := old.status;
    elsif old.status = 'sent' and new.status not in ('sent', 'delivered', 'read', 'failed') then
      new.status := old.status;
    elsif old.status = 'failed' and new.status not in ('failed', 'delivered', 'read') then
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.sync_whatsapp_message_status_from_delivery_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery record;
  effective_status text;
begin
  if new.direction <> 'outbound' or new.wa_message_id is null then
    return new;
  end if;

  select status, delivered_at, read_at, failed_at
    into delivery
  from public.whatsapp_outbound_log
  where wa_message_id = new.wa_message_id
  order by created_at desc
  limit 1;

  if not found then
    return new;
  end if;

  effective_status := public.whatsapp_delivery_effective_status(
    delivery.status,
    delivery.delivered_at,
    delivery.read_at,
    delivery.failed_at
  );

  if effective_status = 'read' then
    new.status := 'read';
  elsif effective_status = 'delivered'
    and new.status in ('received', 'sent', 'failed') then
    new.status := 'delivered';
  elsif effective_status = 'sent'
    and new.status = 'received' then
    new.status := 'sent';
  elsif effective_status = 'failed'
    and new.status in ('received', 'sent') then
    new.status := 'failed';
  end if;

  return new;
end;
$$;

create or replace function public.sync_whatsapp_delivery_log_to_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  effective_status text;
begin
  if new.wa_message_id is null then
    return new;
  end if;

  effective_status := public.whatsapp_delivery_effective_status(
    new.status,
    new.delivered_at,
    new.read_at,
    new.failed_at
  );

  if effective_status is null then
    return new;
  end if;

  update public.whatsapp_messages
  set status = effective_status,
      updated_at = now()
  where wa_message_id = new.wa_message_id
    and (
      (effective_status = 'sent' and status = 'received')
      or (effective_status = 'delivered' and status in ('received', 'sent', 'failed'))
      or (effective_status = 'read' and status in ('received', 'sent', 'delivered', 'failed'))
      or (effective_status = 'failed' and status in ('received', 'sent'))
    );

  return new;
end;
$$;

drop trigger if exists trg_whatsapp_message_status_order on public.whatsapp_messages;
create trigger trg_whatsapp_message_status_order
before update of status on public.whatsapp_messages
for each row execute function public.enforce_whatsapp_message_status_order();

drop trigger if exists trg_whatsapp_message_delivery_status on public.whatsapp_messages;
create trigger trg_whatsapp_message_delivery_status
before insert or update of wa_message_id on public.whatsapp_messages
for each row execute function public.sync_whatsapp_message_status_from_delivery_log();

drop trigger if exists trg_whatsapp_delivery_log_sync on public.whatsapp_outbound_log;
create trigger trg_whatsapp_delivery_log_sync
after insert or update of wa_message_id, status, delivered_at, read_at, failed_at
on public.whatsapp_outbound_log
for each row execute function public.sync_whatsapp_delivery_log_to_message();

with resolved as (
  select
    m.id,
    m.status as current_status,
    public.whatsapp_delivery_effective_status(
      o.status,
      o.delivered_at,
      o.read_at,
      o.failed_at
    ) as effective_status
  from public.whatsapp_messages m
  join public.whatsapp_outbound_log o on o.wa_message_id = m.wa_message_id
  where m.direction = 'outbound'
)
update public.whatsapp_messages m
set status = r.effective_status,
    updated_at = now()
from resolved r
where m.id = r.id
  and (
    (r.effective_status = 'read' and r.current_status <> 'read')
    or (r.effective_status = 'delivered' and r.current_status in ('received', 'sent', 'failed'))
    or (r.effective_status = 'sent' and r.current_status = 'received')
    or (r.effective_status = 'failed' and r.current_status in ('received', 'sent'))
  );

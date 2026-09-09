-- Internal order-status trigger functions need to perform privileged work on
-- tables that are intentionally not exposed to the authenticated Data API.
-- Order updates themselves are already protected by orders.centralhub_admin_only.
-- Run only these trigger implementations as their postgres owner and remove
-- direct RPC execute grants.

create or replace function public.queue_order_whatsapp_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  rule_rec record;
  v_phone text;
  v_store uuid;
begin
  if new.order_status is null or new.order_status is not distinct from old.order_status then
    return new;
  end if;

  if new.order_status not in (
    'confirmed','picking','packing','ready_to_ship','shipment_booked','shipped',
    'out_for_delivery','delivered','cancelled','returned'
  ) then
    return new;
  end if;

  v_phone := nullif(regexp_replace(coalesce(new.customer_phone,''),'[^0-9+]','','g'),'');
  v_store := new.store_id;

  select * into rule_rec
  from public.order_whatsapp_template_rules
  where store_id = v_store
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

  if found and v_phone is not null then
    insert into public.order_whatsapp_notifications
      (order_id, order_status, template_name, language, phone_number, store_id, status)
    values
      (new.id, new.order_status, rule_rec.template_name, rule_rec.language, v_phone, v_store, 'queued')
    on conflict (order_id, order_status) do nothing;
  end if;

  return new;
exception
  when others then
    -- Customer messaging is secondary to the warehouse state transition.
    return new;
end;
$function$;

alter function public.refresh_order_packaging_from_order_change() security definer;
alter function public.refresh_order_packaging_from_order_change() set search_path = '';

alter function public.handle_order_inventory_movement() security definer;
alter function public.handle_order_inventory_movement() set search_path = 'public', 'pg_temp';

alter function public.reduce_product_stock() security definer;
alter function public.reduce_product_stock() set search_path = 'public', 'pg_temp';

revoke execute on function public.queue_order_whatsapp_notification() from public, anon, authenticated;
revoke execute on function public.refresh_order_packaging_from_order_change() from public, anon, authenticated;
revoke execute on function public.handle_order_inventory_movement() from public, anon, authenticated;
revoke execute on function public.reduce_product_stock() from public, anon, authenticated;

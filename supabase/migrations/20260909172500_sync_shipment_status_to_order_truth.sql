create or replace function public.handle_shipment_order_auto_update()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $function$
declare
  v_current_status text;
  v_target_status text;
  v_current_rank integer := 0;
  v_target_rank integer := 0;
  v_should_advance boolean := false;
begin
  if new.order_id is null then return new; end if;
  select lower(coalesce(order_status,'')) into v_current_status from public.orders where id=new.order_id;
  v_target_status := case lower(coalesce(new.status,''))
    when 'label_created' then 'shipment_booked' when 'ready_to_ship' then 'ready_to_ship'
    when 'collected' then 'shipped' when 'in_transit' then 'shipped' when 'at_local_depot' then 'shipped'
    when 'ready_for_collection' then 'shipped' when 'delivery_attempted' then 'shipped' when 'delivery_rescheduled' then 'shipped'
    when 'out_for_delivery' then 'out_for_delivery' when 'delivered' then 'delivered'
    when 'returned' then 'returned' when 'failed' then 'failed' else null end;
  v_current_rank := case v_current_status
    when 'pending_payment' then 0 when 'paid' then 1 when 'confirmed' then 2 when 'picking' then 3 when 'picked' then 4
    when 'packing' then 5 when 'packed' then 6 when 'ready_to_ship' then 7 when 'shipment_booked' then 8 when 'collected' then 9
    when 'shipped' then 10 when 'at_local_depot' then 11 when 'out_for_delivery' then 12 when 'delivered' then 13 when 'completed' then 14 else 0 end;
  v_target_rank := case v_target_status when 'ready_to_ship' then 7 when 'shipment_booked' then 8 when 'shipped' then 10 when 'out_for_delivery' then 12 when 'delivered' then 13 else 0 end;
  if v_target_status in ('returned','failed') then
    v_should_advance := v_current_status not in ('cancelled','refunded');
  elsif v_target_status is not null then
    v_should_advance := v_current_status not in ('cancelled','refunded','returned','failed','completed') and v_target_rank >= v_current_rank;
  end if;
  update public.orders
  set tracking_number=coalesce(new.tracking_number,tracking_number), tracking_url=coalesce(new.tracking_url,tracking_url),
      shipment_label_url=coalesce(new.label_url,shipment_label_url), shipment_booked_at=coalesce(new.booked_at,shipment_booked_at),
      courier_name=case when lower(coalesce(new.carrier,''))='dhl' then 'DHL eCommerce UK' else coalesce(courier_name,new.carrier) end,
      carrier=coalesce(new.carrier,carrier), service_type=coalesce(new.service_type,service_type), shipment_number=coalesce(new.shipment_number,shipment_number),
      label_printed=coalesce(new.label_printed,label_printed), shipment_status=coalesce(new.status,shipment_status), last_tracking_status=coalesce(new.status,last_tracking_status),
      estimated_delivery=coalesce(new.estimated_delivery,estimated_delivery), actual_delivery=coalesce(new.actual_delivery,actual_delivery),
      delivered_at=case when lower(coalesce(new.status,''))='delivered' then coalesce(new.actual_delivery,delivered_at,now()) else delivered_at end,
      order_status=case when v_should_advance then v_target_status else order_status end,
      fulfillment_status=case when v_should_advance then v_target_status else fulfillment_status end,
      updated_at=now()
  where id=new.order_id;
  return new;
end;
$function$;

-- Correct historical delivered shipments without sending stale customer WhatsApp notifications.
alter table public.orders disable trigger trg_queue_order_whatsapp_notification;
update public.orders o
set order_status='delivered', fulfillment_status='delivered', shipment_status='delivered', last_tracking_status='delivered',
    actual_delivery=coalesce(s.actual_delivery,o.actual_delivery), delivered_at=coalesce(s.actual_delivery,o.delivered_at,now()),
    tracking_number=coalesce(s.tracking_number,o.tracking_number), tracking_url=coalesce(s.tracking_url,o.tracking_url), updated_at=now()
from public.shipments s
where s.order_id=o.id and lower(coalesce(s.status,''))='delivered'
  and lower(coalesce(o.order_status,'')) not in ('delivered','completed','cancelled','refunded','returned','failed')
  and lower(coalesce(o.fulfillment_status,'')) not in ('delivered','completed');
alter table public.orders enable trigger trg_queue_order_whatsapp_notification;

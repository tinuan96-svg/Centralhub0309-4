-- Issue #4: physical courier handover of an EXISTING booked shipment only.
-- No DHL label creation, fees, inventory allocation, carrier API or invoice write.
-- Existing lifecycle triggers perform the same remote-store/notification work as
-- the Super Admin handover process; staff may never invoke an unbounded update.
create or replace function public.ch_staff_confirm_courier_handover(
 p_actor uuid,p_order_id uuid,p_store_id uuid,p_shipment_id uuid
) returns uuid language plpgsql volatile security definer set search_path=''
as $$
declare o record; s record; v_active integer;
begin
 if p_actor is null or p_order_id is null or p_store_id is null or p_shipment_id is null
 then raise exception 'invalid_handover' using errcode='22023'; end if;
 if not exists(
   select 1 from auth.users u join public.user_profiles p on p.id=u.id
   join public.ch_staff_accounts a on a.user_id=u.id
   where u.id=p_actor and u.raw_app_meta_data->>'role'='staff'
     and u.raw_app_meta_data->>'must_change_password'='false'
     and p.profile_role='user' and p.is_active=true and a.status='active'
     and (a.all_stores or exists(select 1 from public.ch_staff_store_access x
       where x.user_id=u.id and x.store_id=p_store_id))
     and not exists(select 1 from unnest(array[
       'fulfilment.view','fulfilment.dispatch','shipping.view','shipping.edit'
     ]) as required(permission) where not coalesce(
       (select x.allowed from public.ch_staff_permission_overrides x
        where x.user_id=u.id and x.permission_key=required.permission),
       exists(select 1 from public.ch_staff_permissions g
        where g.role_key=a.role_key and g.permission_key=required.permission)
     ))
 ) then raise exception 'staff_shipping_permission_denied' using errcode='42501'; end if;
 select id,order_number,order_status,warehouse_status,payment_status,is_deleted
 into o from public.orders where id=p_order_id and store_id=p_store_id for update;
 if not found or o.payment_status<>'paid' or o.is_deleted
   or not (
     (o.order_status='shipment_booked' and o.warehouse_status='dispatched')
     or (o.order_status='ready_to_ship' and o.warehouse_status='ready_to_ship')
   ) then raise exception 'handover_order_not_ready' using errcode='P0002'; end if;
 select id,status,tracking_number,label_printed into s from public.shipments
 where id=p_shipment_id and order_id=p_order_id for update;
 if not found or s.status<>'label_created'
   or nullif(pg_catalog.btrim(s.tracking_number),'') is null
   or s.label_printed is distinct from true
 then raise exception 'handover_shipment_not_ready' using errcode='23514'; end if;
 select count(*) into v_active from public.shipments x
 where x.order_id=p_order_id and x.status not in ('cancelled','failed','returned','not_shipped');
 if v_active<>1 then raise exception 'handover_requires_single_active_shipment' using errcode='23514'; end if;
 update public.shipments set status='collected',updated_at=pg_catalog.now()
 where id=s.id and status='label_created';
 if not found then raise exception 'handover_already_processed' using errcode='P0002'; end if;
 update public.orders set order_status='shipped',status='shipped',
   fulfillment_status='shipped',warehouse_status='dispatched',
   shipment_status='collected',dispatched_at=pg_catalog.now(),
   updated_at=pg_catalog.now()
 where id=o.id and store_id=p_store_id and payment_status='paid';
 if not found then raise exception 'handover_order_changed' using errcode='P0002'; end if;
 insert into public.shipment_events(shipment_id,status,description,event_time,metadata)
 values(s.id,'collected','Physical courier handover confirmed by assigned CentralHub staff',
   pg_catalog.now(),pg_catalog.jsonb_build_object('staff_actor_id',p_actor,'source','ch_staff_confirm_courier_handover'));
 insert into public.ch_staff_activity_audit(
  actor_id,store_id,resource_type,resource_id,action,previous_value,next_value
 ) values(p_actor,p_store_id,'order',o.id,'confirm_courier_handover',
   o.order_status,'shipped');
 return s.id;
end;$$;
revoke all on function public.ch_staff_confirm_courier_handover(uuid,uuid,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.ch_staff_confirm_courier_handover(uuid,uuid,uuid,uuid)
 to service_role;

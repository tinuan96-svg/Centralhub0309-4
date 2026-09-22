-- Issue #4: staff may finish ONLY an order they personally claimed and
-- whose line items are fully accounted for. No stock, payment, price, refund,
-- shipping or arbitrary item mutations are accepted by this function.
create or replace function public.ch_staff_complete_picking(
 p_actor uuid,p_order_id uuid,p_store_id uuid,p_duration_seconds integer
) returns uuid language plpgsql volatile security definer set search_path=''
as $$
declare v_id uuid;
begin
 if p_actor is null or p_order_id is null or p_store_id is null or
    p_duration_seconds is null or p_duration_seconds<0 or p_duration_seconds>43200 then
   raise exception 'invalid_picking_completion' using errcode='22023';
 end if;
 if not exists(
   select 1 from auth.users u join public.user_profiles p on p.id=u.id
   join public.ch_staff_accounts s on s.user_id=u.id
   where u.id=p_actor and u.raw_app_meta_data->>'role'='staff'
    and u.raw_app_meta_data->>'must_change_password'='false'
    and p.profile_role='user' and p.is_active=true and s.status='active'
    and (s.all_stores or exists(select 1 from public.ch_staff_store_access a
      where a.user_id=u.id and a.store_id=p_store_id))
    and coalesce((select o.allowed from public.ch_staff_permission_overrides o
      where o.user_id=u.id and o.permission_key='fulfilment.view'),
      exists(select 1 from public.ch_staff_permissions r where r.role_key=s.role_key and r.permission_key='fulfilment.view'))
    and coalesce((select o.allowed from public.ch_staff_permission_overrides o
      where o.user_id=u.id and o.permission_key='fulfilment.pick'),
      exists(select 1 from public.ch_staff_permissions r where r.role_key=s.role_key and r.permission_key='fulfilment.pick'))
 ) then raise exception 'staff_picking_permission_denied' using errcode='42501'; end if;
 -- Never accept an empty order_items relation as proof of completion:
 -- older orders can carry the pick state only in orders.items JSON.
 if not exists(select 1 from public.order_items i
               where i.order_id=p_order_id and i.quantity>0) then
   raise exception 'picking_lines_missing' using errcode='23514';
 end if;
 if exists(select 1 from public.order_items i where i.order_id=p_order_id
   and (i.quantity<=0 or i.picked_quantity is null or i.picked_quantity<0
     or i.picked_quantity>i.quantity
     or (i.picked_quantity<i.quantity and nullif(pg_catalog.btrim(i.skip_reason),'') is null))) then
   raise exception 'picking_items_incomplete' using errcode='23514';
 end if;
 -- Both representations must agree before warehouse status can advance.
 if not exists(select 1 from public.orders o where o.id=p_order_id
    and o.store_id=p_store_id and pg_catalog.jsonb_typeof(o.items)='array'
    and pg_catalog.jsonb_array_length(o.items)>0) then
   raise exception 'picking_json_lines_missing' using errcode='23514';
 end if;
 if exists(
   select 1 from public.orders o
   cross join lateral pg_catalog.jsonb_array_elements(o.items) as line(item)
   where o.id=p_order_id and o.store_id=p_store_id
     and (
       (line.item->>'quantity') is null
       or coalesce((line.item->>'quantity')::integer,0)<=0
       or coalesce((line.item->>'picked_quantity')::integer,0)<0
       or coalesce((line.item->>'picked_quantity')::integer,0)>(line.item->>'quantity')::integer
       or (coalesce((line.item->>'picked_quantity')::integer,0)<(line.item->>'quantity')::integer
          and nullif(pg_catalog.btrim(line.item->>'skip_reason'),'') is null)
     )
 ) then
   raise exception 'picking_json_lines_incomplete' using errcode='23514';
 end if;
 update public.orders set warehouse_status='packing',order_status='packing',
   picking_completed_at=pg_catalog.now(),picking_duration=p_duration_seconds,
   locked_by=null,locked_at=null,updated_at=pg_catalog.now()
 where id=p_order_id and store_id=p_store_id and warehouse_status='picking'
   and locked_by=p_actor and picked_by_user=p_actor and payment_status='paid'
   and is_deleted=false
 returning id into v_id;
 if v_id is null then raise exception 'picking_completion_conflict' using errcode='P0002'; end if;
 insert into public.ch_staff_activity_audit(actor_id,store_id,resource_type,resource_id,action,previous_value,next_value)
 values(p_actor,p_store_id,'order',v_id,'complete_picking','picking','packing');
 return v_id;
end;$$;
revoke all on function public.ch_staff_complete_picking(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ch_staff_complete_picking(uuid,uuid,uuid,integer) to service_role;

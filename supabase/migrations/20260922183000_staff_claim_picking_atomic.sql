-- Issue #4: narrowly scoped warehouse claim. Does NOT change order_status,
-- payment_status, items, quantities, stock, shipping or finance values.
-- Existing order triggers still apply; verify end-to-end on an isolated paid
-- test order before enabling staff production access.
create or replace function public.ch_staff_claim_picking(
  p_actor uuid, p_order_id uuid, p_store_id uuid
) returns uuid
language plpgsql volatile security definer set search_path=''
as $$
declare v_id uuid;
begin
  if p_actor is null or p_order_id is null or p_store_id is null then
    raise exception 'invalid_picking_request' using errcode='22023';
  end if;
  if not exists (
    select 1 from auth.users u
    join public.user_profiles p on p.id=u.id
    join public.ch_staff_accounts s on s.user_id=u.id
    where u.id=p_actor and u.raw_app_meta_data->>'role'='staff'
      and u.raw_app_meta_data->>'must_change_password'='false'
      and p.profile_role='user' and p.is_active=true
      and s.status='active'
      and (s.all_stores or exists (
        select 1 from public.ch_staff_store_access a
        where a.user_id=u.id and a.store_id=p_store_id
      ))
      and coalesce(
        (select o.allowed from public.ch_staff_permission_overrides o
          where o.user_id=u.id and o.permission_key='fulfilment.view'),
        exists (select 1 from public.ch_staff_permissions r
          where r.role_key=s.role_key and r.permission_key='fulfilment.view')
      )
      and coalesce(
        (select o.allowed from public.ch_staff_permission_overrides o
          where o.user_id=u.id and o.permission_key='fulfilment.pick'),
        exists (select 1 from public.ch_staff_permissions r
          where r.role_key=s.role_key and r.permission_key='fulfilment.pick')
      )
  ) then
    raise exception 'staff_picking_permission_denied' using errcode='42501';
  end if;

  -- Optimistic, single-row claim. Concurrent pickers cannot claim the same
  -- order; incomplete/unpaid/cancelled/shipped orders are excluded.
  update public.orders
     set warehouse_status='picking',
         locked_by=p_actor, picked_by_user=p_actor,
         locked_at=pg_catalog.now(),picking_started_at=pg_catalog.now(),
         updated_at=pg_catalog.now()
   where id=p_order_id and store_id=p_store_id
     and payment_status='paid'
     and order_status in ('paid','confirmed')
     and warehouse_status='pending'
     and locked_by is null
     and is_deleted=false
     and jsonb_typeof(items)='array'
     and jsonb_array_length(items)>0
   returning id into v_id;
  if v_id is null then
    raise exception 'order_not_available_for_picking' using errcode='P0002';
  end if;
  insert into public.ch_staff_activity_audit(
    actor_id,store_id,resource_type,resource_id,action,previous_value,next_value
  ) values (p_actor,p_store_id,'order',v_id,'claim_picking','pending','picking');
  return v_id;
end;
$$;
revoke all on function public.ch_staff_claim_picking(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.ch_staff_claim_picking(uuid,uuid,uuid)
  to service_role;

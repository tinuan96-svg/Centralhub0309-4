-- Ordered final staff packing integrity implementation: supersedes the earlier
-- 20260922192500 packing checks, retaining strict JSON-to-normalized line parity.
-- Follow-up packing integrity fix: prevent empty or desynchronised orders from being marked packed.
-- Issue #4: minimal packing transition for staff.
-- Material allocation/costing remains on the privileged existing workflow
-- until its financial/inventory side effects are separately audited.
create or replace function public.ch_staff_complete_packing(
 p_actor uuid,p_order_id uuid,p_store_id uuid
) returns uuid language plpgsql volatile security definer set search_path=''
as $$
declare v_id uuid;
 v_items jsonb;
 v_order_line_count integer;
begin
 if p_actor is null or p_order_id is null or p_store_id is null then
  raise exception 'invalid_packing_request' using errcode='22023';
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
    where o.user_id=u.id and o.permission_key='fulfilment.pack'),
    exists(select 1 from public.ch_staff_permissions r where r.role_key=s.role_key and r.permission_key='fulfilment.pack'))
 ) then raise exception 'staff_packing_permission_denied' using errcode='42501'; end if;
 -- Serialize completion with concurrent barcode scans and order changes.
 select o.items into v_items from public.orders o
 where o.id=p_order_id and o.store_id=p_store_id
   and o.warehouse_status='packing' and o.order_status='packing'
   and o.payment_status='paid' and o.is_deleted=false
 for update;
 if not found then raise exception 'packing_completion_conflict' using errcode='P0002'; end if;
 if jsonb_typeof(v_items) is distinct from 'array' or
    pg_catalog.jsonb_array_length(v_items)=0 then
   raise exception 'packing_lines_missing' using errcode='23514';
 end if;
 select count(*) into v_order_line_count from public.order_items i where i.order_id=p_order_id;
 if v_order_line_count<>pg_catalog.jsonb_array_length(v_items) then
   raise exception 'packing_line_count_mismatch' using errcode='23514';
 end if;
 -- Reject any missing, skipped, duplicate, non-product or unverified line.
 if exists(select 1 from public.order_items i where i.order_id=p_order_id
   and (i.quantity<=0 or i.product_id is null or
     coalesce(i.picked_quantity,0)<>i.quantity or
     coalesce(i.verified_quantity,0)<>i.quantity or
     nullif(pg_catalog.btrim(i.skip_reason),'') is not null)) then
   raise exception 'packing_verification_incomplete' using errcode='23514';
 end if;
 if exists(
   select 1 from pg_catalog.jsonb_array_elements(v_items) j(value)
   where (select count(*) from public.order_items i
     where i.order_id=p_order_id and i.product_id::text=j.value->>'product_id'
       and i.quantity=(j.value->>'quantity')::integer
       and i.picked_quantity=(j.value->>'picked_quantity')::integer
       and i.verified_quantity=(j.value->>'verified_quantity')::integer)=0
     or (select count(*) from public.order_items i
       where i.order_id=p_order_id and i.product_id::text=j.value->>'product_id')<>1
 ) then raise exception 'packing_snapshot_mismatch' using errcode='23514'; end if;
 if exists(select 1 from public.order_items i where i.order_id=p_order_id
   and coalesce(i.verified_quantity,0)<i.quantity) then
  raise exception 'packing_verification_incomplete' using errcode='23514';
 end if;
 update public.orders set warehouse_status='packed',order_status='packed',
   fulfillment_status='packed',packed_at=pg_catalog.now(),packed_by_user=p_actor,
   updated_at=pg_catalog.now()
 where id=p_order_id and store_id=p_store_id and warehouse_status='packing'
   and order_status='packing' and payment_status='paid' and is_deleted=false
 returning id into v_id;
 if v_id is null then raise exception 'packing_completion_conflict' using errcode='P0002'; end if;
 insert into public.order_packing(order_id,packed_by,packed_at,status,notes)
 values(v_id,p_actor,pg_catalog.now(),'completed','Completed through permissioned staff packing workflow')
 on conflict(order_id) do update set packed_by=excluded.packed_by,packed_at=excluded.packed_at,
  status='completed',notes=excluded.notes,updated_at=pg_catalog.now();
 insert into public.ch_staff_activity_audit(actor_id,store_id,resource_type,resource_id,action,previous_value,next_value)
 values(p_actor,p_store_id,'order',v_id,'complete_packing','packing','packed');
 return v_id;
end;$$;
revoke all on function public.ch_staff_complete_packing(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ch_staff_complete_packing(uuid,uuid,uuid) to service_role;

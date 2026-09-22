-- Issue #4: one scanned unit per verified, personally claimed order line.
-- This is a narrow, audited database transaction; staff are still blocked
-- from arbitrary updates to order_items, order totals or warehouse state.
create or replace function public.ch_staff_scan_picking_item(
 p_actor uuid,p_order_id uuid,p_store_id uuid,p_order_item_id uuid,p_barcode text
) returns integer language plpgsql volatile security definer set search_path=''
as $$
declare
 v_order public.orders%rowtype;
 v_item public.order_items%rowtype;
 v_items jsonb;
 v_index integer;
 v_matches integer;
 v_json_item jsonb;
 v_old integer;
 v_new integer;
begin
 if p_actor is null or p_order_id is null or p_store_id is null
    or p_order_item_id is null or p_barcode is null
    or length(btrim(p_barcode))<3 or length(btrim(p_barcode))>64 then
   raise exception 'invalid_pick_scan' using errcode='22023';
 end if;
 if not exists(
   select 1 from auth.users u
   join public.user_profiles p on p.id=u.id
   join public.ch_staff_accounts s on s.user_id=u.id
   where u.id=p_actor and u.raw_app_meta_data->>'role'='staff'
     and u.raw_app_meta_data->>'must_change_password'='false'
     and p.profile_role='user' and p.is_active=true and s.status='active'
     and (s.all_stores or exists (
       select 1 from public.ch_staff_store_access a
       where a.user_id=u.id and a.store_id=p_store_id
     ))
     and coalesce(
       (select v.allowed from public.ch_staff_permission_overrides v
         where v.user_id=u.id and v.permission_key='fulfilment.view'),
       exists(select 1 from public.ch_staff_permissions rp
         where rp.role_key=s.role_key and rp.permission_key='fulfilment.view')
     )
     and coalesce(
       (select v.allowed from public.ch_staff_permission_overrides v
         where v.user_id=u.id and v.permission_key='fulfilment.pick'),
       exists(select 1 from public.ch_staff_permissions rp
         where rp.role_key=s.role_key and rp.permission_key='fulfilment.pick')
     )
 ) then raise exception 'staff_picking_permission_denied' using errcode='42501'; end if;

 select o.* into v_order from public.orders o
 where o.id=p_order_id and o.store_id=p_store_id
   and o.warehouse_status='picking' and o.payment_status='paid'
   and o.order_status in ('paid','confirmed','picking')
   and o.locked_by=p_actor and o.picked_by_user=p_actor
   and o.is_deleted=false
 for update;
 if not found then raise exception 'picking_not_owned_or_inactive' using errcode='P0002'; end if;

 select oi.* into v_item from public.order_items oi
 where oi.id=p_order_item_id and oi.order_id=p_order_id
 for update;
 if not found or v_item.product_id is null or v_item.quantity<=0
    or coalesce(v_item.picked_quantity,0)<0
    or coalesce(v_item.picked_quantity,0)>=v_item.quantity
    or nullif(btrim(v_item.skip_reason),'') is not null then
   raise exception 'order_line_unavailable' using errcode='P0002';
 end if;
 if not exists (
   select 1 from public.products p where p.id=v_item.product_id
     and (nullif(btrim(p.gtin),'')=btrim(p_barcode)
       or nullif(btrim(p.sku),'')=btrim(p_barcode))
 ) then raise exception 'barcode_does_not_match_product' using errcode='23514'; end if;

 v_items:=v_order.items;
 if jsonb_typeof(v_items) is distinct from 'array' then
   raise exception 'order_json_lines_unavailable' using errcode='23514';
 end if;
 select count(*), min(line.ordinality)::integer
 into v_matches,v_index from jsonb_array_elements(v_items) with ordinality as line(value,ordinality)
 where line.value->>'product_id'=v_item.product_id::text;
 if v_matches<>1 or v_index is null then
   -- Duplicate/mismatched product lines cannot safely be synchronized.
   raise exception 'order_json_item_mapping_ambiguous' using errcode='23514';
 end if;
 v_json_item:=v_items->(v_index-1);
 v_old:=coalesce(v_item.picked_quantity,0);
 if (v_json_item->>'quantity') is null
    or (v_json_item->>'quantity')::integer<>v_item.quantity
    or coalesce((v_json_item->>'picked_quantity')::integer,0)<>v_old
    or nullif(btrim(v_json_item->>'skip_reason'),'') is not null then
   raise exception 'order_pick_counters_out_of_sync' using errcode='23514';
 end if;
 v_new:=v_old+1;
 update public.order_items set picked_quantity=v_new,
   last_scanned_gtin=btrim(p_barcode),picked_by=p_actor,
   picked_at=now(),updated_at=now() where id=p_order_item_id;
 update public.orders set items=jsonb_set(v_items,
   array[(v_index-1)::text,'picked_quantity'],to_jsonb(v_new),true),
   updated_at=now() where id=p_order_id;
 insert into public.ch_staff_activity_audit(
  actor_id,store_id,resource_type,resource_id,action,previous_value,next_value
 ) values (
  p_actor,p_store_id,'order',p_order_id,
  'scan_picking_item:'||p_order_item_id::text,v_old::text,v_new::text
 );
 return v_new;
end;
$$;
revoke all on function public.ch_staff_scan_picking_item(uuid,uuid,uuid,uuid,text)
 from public,anon,authenticated;
grant execute on function public.ch_staff_scan_picking_item(uuid,uuid,uuid,uuid,text)
 to service_role;

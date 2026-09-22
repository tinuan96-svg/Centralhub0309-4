-- Issue #4: barcode verification during staff packing, updating BOTH the
-- normalized order_items and orders.items snapshot atomically.
-- Never accepts client-selected quantities, statuses, products or prices.
create or replace function public.ch_staff_verify_packing_item(
  p_actor uuid,p_order_id uuid,p_store_id uuid,p_order_item_id uuid,p_barcode text
) returns integer language plpgsql volatile security definer set search_path=''
as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_json jsonb;
  v_index integer;
  v_matches integer;
  v_line jsonb;
  v_old integer;
  v_new integer;
begin
  if p_actor is null or p_order_id is null or p_store_id is null or
     p_order_item_id is null or p_barcode is null or
     length(btrim(p_barcode))<3 or length(btrim(p_barcode))>64 then
    raise exception 'invalid_pack_scan' using errcode='22023';
  end if;
  if not exists(
    select 1 from auth.users u
    join public.user_profiles p on p.id=u.id
    join public.ch_staff_accounts s on s.user_id=u.id
    where u.id=p_actor and u.raw_app_meta_data->>'role'='staff'
      and u.raw_app_meta_data->>'must_change_password'='false'
      and p.profile_role='user' and p.is_active=true and s.status='active'
      and (s.all_stores or exists(select 1 from public.ch_staff_store_access a
         where a.user_id=u.id and a.store_id=p_store_id))
      and coalesce((select o.allowed from public.ch_staff_permission_overrides o
        where o.user_id=u.id and o.permission_key='fulfilment.view'),
        exists(select 1 from public.ch_staff_permissions r
          where r.role_key=s.role_key and r.permission_key='fulfilment.view'))
      and coalesce((select o.allowed from public.ch_staff_permission_overrides o
        where o.user_id=u.id and o.permission_key='fulfilment.pack'),
        exists(select 1 from public.ch_staff_permissions r
          where r.role_key=s.role_key and r.permission_key='fulfilment.pack'))
  ) then
    raise exception 'staff_pack_permission_denied' using errcode='42501';
  end if;

  select o.* into v_order from public.orders o
  where o.id=p_order_id and o.store_id=p_store_id
    and o.warehouse_status='packing' and o.order_status='packing'
    and o.payment_status='paid' and o.is_deleted=false
  for update;
  if not found then raise exception 'packing_order_unavailable' using errcode='P0002'; end if;

  select oi.* into v_item from public.order_items oi
  where oi.id=p_order_item_id and oi.order_id=p_order_id for update;
  if not found or v_item.product_id is null or v_item.quantity<=0
     or coalesce(v_item.picked_quantity,0)<>v_item.quantity
     or nullif(btrim(v_item.skip_reason),'') is not null
     or coalesce(v_item.verified_quantity,0)<0
     or coalesce(v_item.verified_quantity,0)>=v_item.quantity then
    raise exception 'packing_line_not_ready' using errcode='P0002';
  end if;

  if not exists(select 1 from public.products p where p.id=v_item.product_id
    and (nullif(btrim(p.gtin),'')=btrim(p_barcode) or nullif(btrim(p.sku),'')=btrim(p_barcode))) then
    raise exception 'barcode_does_not_match_item' using errcode='23514';
  end if;

  v_json:=v_order.items;
  if jsonb_typeof(v_json) is distinct from 'array' then
    raise exception 'packing_json_lines_unavailable' using errcode='23514';
  end if;
  select count(*),min(line.ordinality)::integer into v_matches,v_index
  from jsonb_array_elements(v_json) with ordinality as line(value,ordinality)
  where line.value->>'product_id'=v_item.product_id::text;
  if v_matches<>1 or v_index is null then
    raise exception 'packing_item_mapping_ambiguous' using errcode='23514';
  end if;
  v_line:=v_json->(v_index-1);
  v_old:=coalesce(v_item.verified_quantity,0);
  if (v_line->>'quantity') is null or
     (v_line->>'quantity')::integer<>v_item.quantity or
     coalesce((v_line->>'picked_quantity')::integer,0)<>v_item.quantity or
     coalesce((v_line->>'verified_quantity')::integer,0)<>v_old or
     nullif(btrim(v_line->>'skip_reason'),'') is not null then
    raise exception 'packing_snapshot_mismatch' using errcode='23514';
  end if;

  v_new:=v_old+1;
  update public.order_items set verified_quantity=v_new,
    verified_at=pg_catalog.now(),verified_by=p_actor,updated_at=pg_catalog.now()
  where id=p_order_item_id;
  update public.orders set items=jsonb_set(v_json,
    array[(v_index-1)::text,'verified_quantity'],to_jsonb(v_new),true),
    updated_at=pg_catalog.now() where id=p_order_id;
  insert into public.ch_staff_activity_audit(
    actor_id,store_id,resource_type,resource_id,action,previous_value,next_value
  ) values(p_actor,p_store_id,'order',p_order_id,
    'scan_packing_item:'||p_order_item_id::text,v_old::text,v_new::text);
  return v_new;
end;
$$;
revoke all on function public.ch_staff_verify_packing_item(uuid,uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.ch_staff_verify_packing_item(uuid,uuid,uuid,uuid,text)
  to service_role;

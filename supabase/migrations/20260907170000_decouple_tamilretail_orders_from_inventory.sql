-- TamilRetail orders must continue to sync into CentralHub for sales, finance,
-- customer, fulfilment and analytics, but they must never mutate CentralHub stock.

create or replace function public.reduce_product_stock()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  item jsonb;
  new_item jsonb;
  new_items jsonb := '[]'::jsonb;
  should_deduct boolean := false;
  any_backorder boolean := false;
  v_stock integer;
  v_backorder boolean;
  v_track_stock boolean;
  v_qty integer;
  v_backorder_qty integer;
  v_variant_id uuid;
  v_product_id uuid;
  v_variant_product_id uuid;
  v_name text;
  v_used integer;
begin
  if exists (select 1 from public.stores s where s.id = new.store_id and lower(s.slug) = 'tamilretail') then
    new.stock_deducted := false;
    new.inventory_sync_status := 'pending';
    new.inventory_synced_at := null;
    return new;
  end if;

  if coalesce(new.stock_deducted, false) then return new; end if;
  should_deduct := coalesce(new.payment_status, 'pending') = 'paid'
    and coalesce(new.order_status, 'pending') not in ('pending_payment', 'cancelled', 'refunded', 'failed', 'returned');
  if not should_deduct or new.items is null or jsonb_array_length(new.items) = 0 then return new; end if;

  for item in select value from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
    v_qty := greatest(coalesce((item->>'quantity')::int, 0), 0);
    v_name := coalesce(item->>'name', 'Product');
    v_backorder_qty := 0;
    v_used := 0;
    v_variant_id := nullif(item->>'variant_id', '')::uuid;
    v_product_id := nullif(item->>'product_id', '')::uuid;
    v_variant_product_id := null;

    if v_qty <= 0 then
      new_items := new_items || jsonb_build_array(item || jsonb_build_object('is_backorder', false, 'backorder_quantity', 0, 'physical_stock_used', 0));
      continue;
    end if;

    if v_variant_id is not null then
      select pv.stock, pv.product_id,
             coalesce(p.allow_backorder, false) or coalesce(p.backorder, false),
             coalesce(p.enable_stock_tracking, true)
      into v_stock, v_variant_product_id, v_backorder, v_track_stock
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      where pv.id = v_variant_id
      for update of pv;
      if not found then raise exception 'Product variant not found for "%"', v_name; end if;
      if v_product_id is not null and v_product_id is distinct from v_variant_product_id then raise exception 'Variant/product mismatch for "%"', v_name; end if;
      v_product_id := v_variant_product_id;
      if not v_track_stock then
        new_items := new_items || jsonb_build_array(item || jsonb_build_object('is_backorder', false, 'backorder_quantity', 0, 'physical_stock_used', 0));
        continue;
      end if;
      v_stock := greatest(coalesce(v_stock, 0), 0);
      v_used := least(v_stock, v_qty);
      if not v_backorder and v_stock < v_qty then raise exception 'Insufficient stock for "%": requested %, available %', v_name, v_qty, v_stock; end if;
      v_backorder_qty := case when v_backorder then greatest(v_qty - v_stock, 0) else 0 end;
      update public.product_variants set stock = greatest(0, stock - v_used), updated_at = now() where id = v_variant_id;
    elsif v_product_id is not null then
      select p.stock,
             coalesce(p.allow_backorder, false) or coalesce(p.backorder, false),
             coalesce(p.enable_stock_tracking, true)
      into v_stock, v_backorder, v_track_stock
      from public.products p where p.id = v_product_id for update;
      if not found then raise exception 'Product not found for "%"', v_name; end if;
      if not v_track_stock then
        new_items := new_items || jsonb_build_array(item || jsonb_build_object('is_backorder', false, 'backorder_quantity', 0, 'physical_stock_used', 0));
        continue;
      end if;
      v_stock := greatest(coalesce(v_stock, 0), 0);
      v_used := least(v_stock, v_qty);
      if not v_backorder and v_stock < v_qty then raise exception 'Insufficient stock for "%": requested %, available %', v_name, v_qty, v_stock; end if;
      v_backorder_qty := case when v_backorder then greatest(v_qty - v_stock, 0) else 0 end;
      update public.products set stock = greatest(0, stock - v_used), updated_at = now() where id = v_product_id;
    else
      new_items := new_items || jsonb_build_array(item || jsonb_build_object('is_backorder', false, 'backorder_quantity', 0, 'physical_stock_used', 0));
      continue;
    end if;

    any_backorder := any_backorder or v_backorder_qty > 0;
    new_item := item || jsonb_build_object('is_backorder', v_backorder_qty > 0, 'backorder_quantity', v_backorder_qty, 'physical_stock_used', v_used);
    new_items := new_items || jsonb_build_array(new_item);
  end loop;

  new.items := new_items;
  new.has_backorder_items := any_backorder;
  new.is_backorder := any_backorder;
  new.backorder_status := case when any_backorder then 'pending' else null end;
  new.stock_deducted := true;
  new.inventory_sync_status := case when any_backorder then 'partial' else 'synced' end;
  new.inventory_synced_at := now();
  return new;
end;
$$;

create or replace function public.handle_order_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  x jsonb;
  pid uuid;
  vid uuid;
  variant_pid uuid;
  used integer;
  old_stock integer;
  new_stock integer;
begin
  if exists (select 1 from public.stores s where s.id = new.store_id and lower(s.slug) = 'tamilretail') then
    new.stock_deducted := false;
    return new;
  end if;

  if tg_op <> 'UPDATE'
     or new.order_status not in ('cancelled', 'refunded')
     or old.order_status in ('cancelled', 'refunded')
     or coalesce(old.stock_deducted, false) = false then return new; end if;

  for x in select value from jsonb_array_elements(coalesce(old.items, '[]'::jsonb)) loop
    pid := nullif(x->>'product_id', '')::uuid;
    vid := nullif(x->>'variant_id', '')::uuid;
    used := greatest(coalesce((x->>'physical_stock_used')::int, 0), 0);
    if used <= 0 then continue; end if;
    if vid is not null then
      select pv.stock, pv.product_id into old_stock, variant_pid from public.product_variants pv where pv.id = vid for update;
      if not found then continue; end if;
      update public.product_variants set stock = old_stock + used, updated_at = now() where id = vid;
      new_stock := old_stock + used;
      pid := coalesce(pid, variant_pid);
      if pid is not null then
        insert into public.inventory_movements(product_id, order_id, order_number, change_amount, old_stock, new_stock, action_type, notes)
        values (pid, new.id, new.order_number, used, old_stock, new_stock, 'RESTORE', 'Cancelled/refunded order: restore variant physical stock actually used (variant ' || vid::text || ')');
      end if;
    elsif pid is not null then
      select stock into old_stock from public.products where id = pid for update;
      if old_stock is null then continue; end if;
      update public.products set stock = old_stock + used, updated_at = now() where id = pid;
      new_stock := old_stock + used;
      insert into public.inventory_movements(product_id, order_id, order_number, change_amount, old_stock, new_stock, action_type, notes)
      values (pid, new.id, new.order_number, used, old_stock, new_stock, 'RESTORE', 'Cancelled/refunded order: restore physical stock actually used');
    end if;
  end loop;

  update public.backorder_items set status = 'cancelled', updated_at = now()
  where order_id = new.id and status in ('pending', 'partial');
  new.stock_deducted := false;
  new.inventory_sync_status := 'synced';
  new.inventory_synced_at := now();
  return new;
end;
$$;

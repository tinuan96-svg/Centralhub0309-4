-- CentralHub-only manual/accounting orders may represent externally paid sales.
-- They must remain visible in CentralHub without mutating storefront inventory
-- or pushing lifecycle status back into the storefront.

create or replace function public.reduce_product_stock()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  if lower(coalesce(new.sync_origin, '')) = 'centralhub_manual' then
    new.stock_deducted := false;
    new.inventory_sync_status := 'pending';
    new.inventory_synced_at := null;
    return new;
  end if;

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
      if v_product_id is not null and v_product_id is distinct from v_variant_product_id then
        raise exception 'Variant/product mismatch for "%"', v_name;
      end if;
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
$function$;

create or replace function public.push_order_status_to_all_stores()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_store_slug text;
  v_target_url text;
  v_secret_name text;
  v_key text;
  v_payload jsonb;
  v_req bigint;
  v_idempotency_key text;
  v_request_hash text;
begin
  if tg_op <> 'UPDATE' or (
    old.order_status is not distinct from new.order_status and
    old.fulfillment_status is not distinct from new.fulfillment_status and
    old.shipment_status is not distinct from new.shipment_status and
    old.packing_status is not distinct from new.packing_status
  ) then
    return new;
  end if;

  if lower(coalesce(new.sync_origin, '')) = 'centralhub_manual' then
    return new;
  end if;

  select lower(s.slug)
    into v_store_slug
  from public.stores s
  where s.id = new.store_id;

  case v_store_slug
    when 'malluspices' then
      v_target_url := 'https://ixzbnifmsxunlarhfimp.supabase.co/rest/v1/rpc/sync_centralhub_order_status';
      v_secret_name := 'malluspices_api_key';
    when 'keralagrocery' then
      v_target_url := 'https://vnqjqopzoeunojomssmq.supabase.co/rest/v1/rpc/sync_centralhub_order_status';
      v_secret_name := 'vnqjqopzoeunojomssmq_api_key';
    when 'pocketgrocery' then
      v_target_url := 'https://ygygyptgjkzcxxyjtixa.supabase.co/rest/v1/rpc/sync_centralhub_order_status';
      v_secret_name := 'ygygyptgjkzcxxyjtixa_api_key';
    else
      return new;
  end case;

  select ds.decrypted_secret
    into v_key
  from vault.decrypted_secrets ds
  where ds.name = v_secret_name
  order by ds.created_at desc
  limit 1;

  if coalesce(v_key, '') = '' then
    return new;
  end if;

  v_payload := jsonb_build_object(
    'p_order_number', new.order_number,
    'p_centralhub_order_id', new.id,
    'p_order_status', new.order_status,
    'p_fulfillment_status', new.fulfillment_status,
    'p_shipment_status', new.shipment_status,
    'p_packing_status', new.packing_status
  );

  select net.http_post(
    url := v_target_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_key,
      'Authorization', 'Bearer ' || v_key,
      'Prefer', 'return=minimal'
    ),
    body := v_payload,
    timeout_milliseconds := 10000
  ) into v_req;

  v_request_hash := md5(v_payload::text);
  v_idempotency_key := 'STATUS_PUSH:' || new.id::text || ':' || v_store_slug || ':' || v_request_hash;

  insert into public.centralhub_order_sync_requests
    (idempotency_key, order_id, order_number, request_hash, response, status_code,
     request_id, operation, source_table, order_status, payment_status,
     shipment_status, fulfillment_status, request_url, request_body,
     request_body_text, order_snapshot, created_at)
  values
    (v_idempotency_key, new.id, new.order_number, v_request_hash,
     jsonb_build_object('queued', true, 'request_id', v_req, 'target', v_store_slug),
     202, v_req, 'STATUS_PUSH', 'public.orders', new.order_status,
     new.payment_status, new.shipment_status, new.fulfillment_status,
     v_target_url, v_payload, v_payload::text, to_jsonb(new), now())
  on conflict (idempotency_key) do update set
    request_id = excluded.request_id,
    response = excluded.response,
    status_code = excluded.status_code,
    created_at = now();

  return new;
exception
  when others then
    return new;
end;
$function$;

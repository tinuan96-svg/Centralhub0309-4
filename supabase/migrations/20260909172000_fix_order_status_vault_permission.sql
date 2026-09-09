-- Fix CentralHub order-status updates failing with:
--   permission denied for schema vault (42501)
--
-- Root cause: trg_push_order_status_to_all_stores executes this function as
-- SECURITY INVOKER, so an authenticated admin update inherits the caller's
-- lack of USAGE on the protected vault schema.
--
-- The trigger is an internal side effect and must never block the primary
-- order update. Run the trigger function as its postgres owner, route only to
-- the order's actual store, and keep failures isolated from the order update.

create or replace function public.push_order_status_to_all_stores()
returns trigger
language plpgsql
security definer
set search_path = ''
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

  select lower(s.slug)
    into v_store_slug
  from public.stores s
  where s.id = new.store_id;

  -- A status change belongs to exactly one storefront. Do not broadcast an
  -- order from one store into the other storefront databases.
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

  -- Missing integration credentials must not prevent warehouse operations.
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
    (
      idempotency_key,
      order_id,
      order_number,
      request_hash,
      response,
      status_code,
      request_id,
      operation,
      source_table,
      order_status,
      payment_status,
      shipment_status,
      fulfillment_status,
      request_url,
      request_body,
      request_body_text,
      order_snapshot,
      created_at
    )
  values
    (
      v_idempotency_key,
      new.id,
      new.order_number,
      v_request_hash,
      jsonb_build_object('queued', true, 'request_id', v_req, 'target', v_store_slug),
      202,
      v_req,
      'STATUS_PUSH',
      'public.orders',
      new.order_status,
      new.payment_status,
      new.shipment_status,
      new.fulfillment_status,
      v_target_url,
      v_payload,
      v_payload::text,
      to_jsonb(new),
      now()
    )
  on conflict (idempotency_key) do update set
    request_id = excluded.request_id,
    response = excluded.response,
    status_code = excluded.status_code,
    created_at = now();

  return new;
exception
  when others then
    -- Store sync is secondary. Never roll back an order status update because
    -- Vault, pg_net, or a remote storefront integration is unavailable.
    return new;
end;
$function$;

-- The function exists only as a database trigger implementation. Keep it off
-- the Data API/RPC surface while allowing the trigger to run as its owner.
revoke execute on function public.push_order_status_to_all_stores() from public, anon, authenticated;

-- Fix stock-audit product sync failures caused by application-role Vault access.
-- Keep the public trigger SECURITY INVOKER and isolate Vault access in a restricted private helper.

create schema if not exists private;

create or replace function private.dispatch_product_sync_http(p_payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, vault, net, private, pg_temp
as $$
declare
  v_secret text;
  v_req_id bigint;
begin
  select decrypted_secret
    into v_secret
  from vault.decrypted_secrets
  where name = 'product_webhook_dispatcher_secret'
  order by created_at desc
  limit 1;

  if coalesce(v_secret, '') = '' then
    raise exception 'product_webhook_dispatcher_secret is not configured';
  end if;

  select net.http_post(
    url := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/product-webhook-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-product-sync-secret', v_secret
    ),
    body := p_payload,
    timeout_milliseconds := 15000
  )
  into v_req_id;

  return v_req_id;
end;
$$;

alter function private.dispatch_product_sync_http(jsonb) owner to postgres;
revoke all on function private.dispatch_product_sync_http(jsonb) from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.dispatch_product_sync_http(jsonb) to authenticated, service_role;

create or replace function public.notify_malluspices_product_webhook()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions, private, pg_temp
as $$
declare
  v_record jsonb;
  v_payload jsonb;
  v_event_type text;
  v_req_id bigint;
  v_product_id text;
  v_ordering_key text;
begin
  v_product_id := coalesce(new.id::text, old.id::text);
  if not public.is_valid_uuid(v_product_id) then
    return coalesce(new, old);
  end if;

  v_ordering_key := v_product_id || '_' || extract(epoch from coalesce(new.updated_at, old.updated_at, now()))::text;

  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE' and new.is_deleted = true and coalesce(old.is_deleted, false) = false) then
    v_event_type := 'DELETE';
    v_record := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  else
    v_event_type := tg_op;
    v_record := to_jsonb(new);
  end if;

  v_payload := jsonb_build_object(
    'event', v_event_type,
    'ordering_key', v_ordering_key,
    'source_updated_at', coalesce(new.updated_at, old.updated_at, now())::text,
    'data', v_record || jsonb_build_object('id', v_product_id)
  );

  v_req_id := private.dispatch_product_sync_http(v_payload);

  insert into public.webhook_logs(
    event_type, product_id, product_name, attempt, success, status, response
  )
  values (
    v_event_type,
    v_product_id,
    coalesce(v_record->>'name', 'Unknown'),
    1,
    true,
    'queued',
    jsonb_build_object(
      'request_id', v_req_id,
      'ordering_key', v_ordering_key,
      'target', 'configured_storefronts',
      'transport', 'centralhub_product_webhook_dispatcher'
    )::text
  );

  return coalesce(new, old);
exception when others then
  begin
    insert into public.webhook_logs(
      event_type, product_id, product_name, attempt, success, status, response
    )
    values (
      coalesce(v_event_type, tg_op),
      v_product_id,
      coalesce(v_record->>'name', 'Unknown'),
      1,
      false,
      'failed',
      sqlerrm
    );
  exception when others then
    null;
  end;
  return coalesce(new, old);
end;
$$;

comment on function private.dispatch_product_sync_http(jsonb) is
  'Internal trigger helper. Reads the product dispatcher secret from Vault and queues the authenticated product sync request without exposing Vault access to application roles.';

comment on function public.notify_malluspices_product_webhook() is
  'Product change trigger. Runs as invoker and delegates privileged Vault access to a restricted helper in the private schema.';

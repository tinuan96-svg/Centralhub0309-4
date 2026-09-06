do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name='product_webhook_dispatcher_secret') then
    perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'product_webhook_dispatcher_secret','CentralHub internal multi-store product dispatcher secret');
  end if;
end $$;

create or replace function public.notify_malluspices_product_webhook()
returns trigger
language plpgsql
security definer
set search_path to 'public','extensions','vault'
as $$
declare
  v_record jsonb;
  v_payload jsonb;
  v_event_type text;
  v_url text := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/product-webhook-dispatcher';
  v_req_id bigint;
  v_product_id text;
  v_ordering_key text;
  v_secret text;
begin
  v_product_id := coalesce(new.id::text, old.id::text);
  if not public.is_valid_uuid(v_product_id) then
    return coalesce(new, old);
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='product_webhook_dispatcher_secret'
  order by created_at desc
  limit 1;

  if coalesce(v_secret,'')='' then
    raise warning 'product_webhook_dispatcher_secret is not configured';
    return coalesce(new, old);
  end if;

  v_ordering_key := v_product_id || '_' || extract(epoch from coalesce(new.updated_at, old.updated_at, now()))::text;

  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.is_deleted = true and coalesce(old.is_deleted, false) = false) then
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

  v_req_id := net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-product-sync-secret',v_secret
    ),
    body := v_payload,
    timeout_milliseconds := 15000
  );

  insert into public.webhook_logs(event_type,product_id,product_name,attempt,success,status,response)
  values (
    v_event_type,
    v_product_id,
    coalesce(v_record->>'name','Unknown'),
    1,
    true,
    'queued',
    jsonb_build_object(
      'request_id',v_req_id,
      'ordering_key',v_ordering_key,
      'target','configured_storefronts',
      'transport','centralhub_product_webhook_dispatcher'
    )::text
  );

  return coalesce(new,old);
exception when others then
  begin
    insert into public.webhook_logs(event_type,product_id,product_name,attempt,success,status,response)
    values (coalesce(v_event_type,tg_op),v_product_id,coalesce(v_record->>'name','Unknown'),1,false,'failed',sqlerrm);
  exception when others then null;
  end;
  return coalesce(new,old);
end;
$$;

create or replace function public.trigger_product_sync_reconcile()
returns bigint
language plpgsql
security definer
set search_path to 'public','net','vault'
as $$
declare
  v_secret text;
  v_req bigint;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='product_webhook_dispatcher_secret'
  order by created_at desc
  limit 1;

  if coalesce(v_secret,'')='' then
    raise exception 'product_webhook_dispatcher_secret is not configured';
  end if;

  select net.http_post(
    url := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/product-webhook-dispatcher',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-product-sync-secret',v_secret
    ),
    body := jsonb_build_object('event','RECONCILE'),
    timeout_milliseconds := 120000
  ) into v_req;
  return v_req;
end;
$$;

revoke all on function public.trigger_product_sync_reconcile() from public, anon, authenticated;
grant execute on function public.trigger_product_sync_reconcile() to service_role;

do $$
begin
  if exists(select 1 from cron.job where jobname='centralhub-product-reconcile') then
    perform cron.unschedule('centralhub-product-reconcile');
  end if;
  perform cron.schedule('centralhub-product-reconcile','*/5 * * * *','select public.trigger_product_sync_reconcile();');
end $$;

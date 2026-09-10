create or replace function public.refresh_whatsapp_template_truth()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cron_secret text;
  v_req bigint;
  r record;
begin
  select ds.decrypted_secret
    into v_cron_secret
  from vault.decrypted_secrets ds
  where ds.name = 'whatsapp_retry_cron_secret'
  order by ds.created_at desc
  limit 1;

  if coalesce(v_cron_secret, '') = '' then
    return;
  end if;

  for r in
    select c.id as channel_id, c.store_id
    from public.whatsapp_channels c
    where lower(coalesce(c.status, '')) in ('active','connected')
      and nullif(c.waba_id, '') is not null
      and nullif(c.phone_number_id, '') is not null
  loop
    begin
      select net.http_post(
        url := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/whatsapp-template-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-whatsapp-retry-secret', v_cron_secret
        ),
        body := jsonb_build_object('channelId', r.channel_id, 'storeId', r.store_id),
        timeout_milliseconds := 30000
      ) into v_req;
    exception when others then
      null;
    end;
  end loop;
end;
$$;

revoke all on function public.refresh_whatsapp_template_truth() from public;
revoke all on function public.refresh_whatsapp_template_truth() from anon;
revoke all on function public.refresh_whatsapp_template_truth() from authenticated;
grant execute on function public.refresh_whatsapp_template_truth() to service_role;

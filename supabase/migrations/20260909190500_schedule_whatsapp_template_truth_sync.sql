-- Keep CentralHub's template registry tied to Meta's actual approval state.
-- This lets the retry worker defer transactional notifications while a newly
-- submitted template is PENDING and automatically resume once Meta approves it.

create or replace function public.refresh_whatsapp_template_truth()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_anon_key text;
  v_req bigint;
  r record;
begin
  select ds.decrypted_secret
    into v_anon_key
  from vault.decrypted_secrets ds
  where ds.name = 'ANON_KEY'
  order by ds.created_at desc
  limit 1;

  if coalesce(v_anon_key, '') = '' then
    return;
  end if;

  for r in
    select c.id as channel_id, c.store_id
    from public.whatsapp_channels c
    where lower(coalesce(c.status,'')) in ('active','connected')
      and nullif(c.waba_id,'') is not null
      and nullif(c.phone_number_id,'') is not null
  loop
    begin
      select net.http_post(
        url := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/whatsapp-template-sync',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer ' || v_anon_key,
          'apikey',v_anon_key
        ),
        body := jsonb_build_object(
          'channelId',r.channel_id,
          'storeId',r.store_id
        ),
        timeout_milliseconds := 30000
      ) into v_req;
    exception when others then
      -- Meta template synchronization is secondary and must never block other
      -- scheduled database work.
      null;
    end;
  end loop;
end;
$function$;

revoke execute on function public.refresh_whatsapp_template_truth()
  from public, anon, authenticated;

do $$
declare
  j record;
begin
  for j in select jobid from cron.job where jobname = 'whatsapp-template-sync' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'whatsapp-template-sync',
  '*/5 * * * *',
  'select public.refresh_whatsapp_template_truth();'
);

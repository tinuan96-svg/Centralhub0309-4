do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name='competitor_scan_cron_secret') then
    perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'competitor_scan_cron_secret','CentralHub competitor scan cron authentication');
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name='whatsapp_retry_cron_secret') then
    perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'whatsapp_retry_cron_secret','CentralHub WhatsApp retry cron authentication');
  end if;
end $$;

do $$
begin
  if exists(select 1 from cron.job where jobname='competitor-auto-scan') then
    perform cron.unschedule('competitor-auto-scan');
  end if;
  perform cron.schedule(
    'competitor-auto-scan',
    '0 */6 * * *',
    $cmd$
      select net.http_post(
        url := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/competitor-price-scanner',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-competitor-scan-secret',
          (select decrypted_secret from vault.decrypted_secrets where name='competitor_scan_cron_secret' order by created_at desc limit 1)
        ),
        body := '{"action":"scan"}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cmd$
  );

  if exists(select 1 from cron.job where jobname='whatsapp-retry-worker') then
    perform cron.unschedule('whatsapp-retry-worker');
  end if;
  perform cron.schedule(
    'whatsapp-retry-worker',
    '*/2 * * * *',
    $cmd$
      select net.http_post(
        url := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/whatsapp-retry-worker',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-whatsapp-retry-secret',
          (select decrypted_secret from vault.decrypted_secrets where name='whatsapp_retry_cron_secret' order by created_at desc limit 1)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cmd$
  );
end $$;

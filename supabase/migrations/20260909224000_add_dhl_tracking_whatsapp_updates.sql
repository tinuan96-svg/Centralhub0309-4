alter table public.shipment_events
  add column if not exists whatsapp_status text,
  add column if not exists whatsapp_template_name text,
  add column if not exists whatsapp_message_id text,
  add column if not exists whatsapp_error text,
  add column if not exists whatsapp_retry_count integer not null default 0,
  add column if not exists whatsapp_sent_at timestamptz,
  add column if not exists whatsapp_delivered_at timestamptz,
  add column if not exists whatsapp_read_at timestamptz;

create index if not exists idx_shipment_events_whatsapp_pending
  on public.shipment_events (event_time, created_at)
  where whatsapp_status = 'pending';

create index if not exists idx_shipment_events_whatsapp_message_id
  on public.shipment_events (whatsapp_message_id)
  where whatsapp_message_id is not null;

do $$
declare
  v_store_id uuid;
  v_channel_id uuid;
  v_registry_id uuid;
begin
  select id into v_store_id
  from public.stores
  where lower(slug) = 'malluspices'
  limit 1;

  if v_store_id is null then
    raise exception 'MalluSpices store not found';
  end if;

  select id into v_channel_id
  from public.whatsapp_channels
  where store_id = v_store_id
    and lower(coalesce(status, 'active')) in ('active', 'connected')
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  if v_channel_id is null then
    raise exception 'Active MalluSpices WhatsApp channel not found';
  end if;

  insert into public.whatsapp_templates
    (store_id, channel_id, name, language, category, status, components, updated_at)
  values
    (
      v_store_id,
      v_channel_id,
      'delivery_tracking_update_v1',
      'en_GB',
      'UTILITY',
      'DRAFT',
      jsonb_build_array(
        jsonb_build_object(
          'type', 'BODY',
          'text', E'*DELIVERY TRACKING UPDATE*\n\nOrder: {{1}}\nUpdate: {{2}}\nLocation: {{3}}\nTime: {{4}}\nTracking: {{5}}\n\nThis is the latest update from our delivery partner.',
          'example', jsonb_build_object(
            'body_text',
            jsonb_build_array(
              jsonb_build_array(
                'MS-12345',
                'Parcel arrived at the delivery depot',
                'Exeter',
                '12 Aug 2026, 09:33',
                'https://www.dhl.com/'
              )
            )
          )
        )
      ),
      now()
    )
  on conflict (channel_id, name, language) do update set
    category = excluded.category,
    components = excluded.components,
    updated_at = now();

  insert into public.whatsapp_template_registry
    (store_id, name, meta_template_name, category, language, variables, status)
  values
    (
      v_store_id,
      'Delivery Tracking Update',
      'delivery_tracking_update_v1',
      'utility',
      'en_GB',
      '["order_number","tracking_update","tracking_location","tracking_time","tracking_url"]'::jsonb,
      'draft'
    )
  on conflict (store_id, meta_template_name) do update set
    name = excluded.name,
    category = excluded.category,
    language = excluded.language,
    variables = excluded.variables,
    status = case
      when lower(coalesce(public.whatsapp_template_registry.status, '')) in ('approved', 'active')
        then public.whatsapp_template_registry.status
      else 'draft'
    end;

  select id into v_registry_id
  from public.whatsapp_template_registry
  where store_id = v_store_id
    and meta_template_name = 'delivery_tracking_update_v1'
  limit 1;

  insert into public.whatsapp_event_template_mappings
    (store_id, event_key, event_type, event_source, description, template_id, channel_id, enabled, customer_visible, requires_opt_in, variables, trigger_table, trigger_condition, updated_at)
  values
    (
      v_store_id,
      'shipment.tracking_update',
      'TRANSACTIONAL',
      'DHL_TRACKING',
      'DHL shipment tracking update',
      v_registry_id,
      v_channel_id,
      true,
      true,
      false,
      '["order_number","tracking_update","tracking_location","tracking_time","tracking_url"]'::jsonb,
      'shipment_events',
      '{"customer_visible":true}'::jsonb,
      now()
    )
  on conflict (store_id, event_key) do update set
    description = excluded.description,
    template_id = excluded.template_id,
    channel_id = excluded.channel_id,
    enabled = true,
    customer_visible = true,
    requires_opt_in = false,
    variables = excluded.variables,
    trigger_table = excluded.trigger_table,
    trigger_condition = excluded.trigger_condition,
    updated_at = now();
end $$;

create or replace function public.sync_shipment_event_whatsapp_delivery_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.shipment_events
  set whatsapp_status = case
        when lower(coalesce(new.status, '')) = 'read' then 'read'
        when lower(coalesce(new.status, '')) = 'delivered' then 'delivered'
        when lower(coalesce(new.status, '')) = 'failed' then 'failed'
        when lower(coalesce(new.status, '')) = 'sent' then 'sent'
        else whatsapp_status
      end,
      whatsapp_delivered_at = coalesce(new.delivered_at, whatsapp_delivered_at),
      whatsapp_read_at = coalesce(new.read_at, whatsapp_read_at),
      whatsapp_error = case
        when lower(coalesce(new.status, '')) = 'failed' then new.error_message
        when lower(coalesce(new.status, '')) in ('delivered','read') then null
        else whatsapp_error
      end
  where whatsapp_message_id = new.wa_message_id;

  return new;
end;
$$;

revoke all on function public.sync_shipment_event_whatsapp_delivery_status() from public, anon, authenticated;

drop trigger if exists trg_sync_shipment_event_whatsapp_delivery_status on public.whatsapp_outbound_log;
create trigger trg_sync_shipment_event_whatsapp_delivery_status
after insert or update of status, delivered_at, read_at, failed_at, error_message
on public.whatsapp_outbound_log
for each row
execute function public.sync_shipment_event_whatsapp_delivery_status();

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'shipment-event-whatsapp-worker' limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'shipment-event-whatsapp-worker',
    '*/2 * * * *',
    $cron$
      select net.http_post(
        url := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/shipment-event-whatsapp-worker',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-whatsapp-retry-secret',
          (select decrypted_secret from vault.decrypted_secrets where name='whatsapp_retry_cron_secret' order by created_at desc limit 1)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cron$
  );
end $$;
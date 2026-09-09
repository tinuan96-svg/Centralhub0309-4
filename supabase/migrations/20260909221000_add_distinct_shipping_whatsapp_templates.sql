do $$
declare
  v_store_id uuid;
  v_channel_id uuid;
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
      'shipment_booked_v1',
      'en_GB',
      'UTILITY',
      'DRAFT',
      jsonb_build_array(
        jsonb_build_object(
          'type', 'BODY',
          'text', 'Your Mallu Spices order {{1}} has been booked with our courier. Track it here: {{2}}. We will let you know when it has been dispatched.',
          'example', jsonb_build_object('body_text', jsonb_build_array(jsonb_build_array('MS-12345', 'https://www.dhl.com/')))
        )
      ),
      now()
    ),
    (
      v_store_id,
      v_channel_id,
      'order_shipped_v1',
      'en_GB',
      'UTILITY',
      'DRAFT',
      jsonb_build_array(
        jsonb_build_object(
          'type', 'BODY',
          'text', 'Your Mallu Spices order {{1}} has been dispatched and is on the way. Track your delivery here: {{2}}. Thank you.',
          'example', jsonb_build_object('body_text', jsonb_build_array(jsonb_build_array('MS-12345', 'https://www.dhl.com/')))
        )
      ),
      now()
    ),
    (
      v_store_id,
      v_channel_id,
      'order_out_for_delivery_v1',
      'en_GB',
      'UTILITY',
      'DRAFT',
      jsonb_build_array(
        jsonb_build_object(
          'type', 'BODY',
          'text', 'Your Mallu Spices order {{1}} is out for delivery. Track the latest courier update here: {{2}}. Please keep an eye out for your delivery.',
          'example', jsonb_build_object('body_text', jsonb_build_array(jsonb_build_array('MS-12345', 'https://www.dhl.com/')))
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
    (v_store_id, 'Shipment Booked', 'shipment_booked_v1', 'utility', 'en_GB', '["order_number","tracking_url"]'::jsonb, 'draft'),
    (v_store_id, 'Order Shipped', 'order_shipped_v1', 'utility', 'en_GB', '["order_number","tracking_url"]'::jsonb, 'draft'),
    (v_store_id, 'Out for Delivery', 'order_out_for_delivery_v1', 'utility', 'en_GB', '["order_number","tracking_url"]'::jsonb, 'draft')
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
end $$;

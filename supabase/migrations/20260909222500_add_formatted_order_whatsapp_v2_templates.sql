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
    (v_store_id, v_channel_id, 'order_confirm_v2', 'en_GB', 'UTILITY', 'DRAFT',
      jsonb_build_array(jsonb_build_object(
        'type','BODY',
        'text', E'Hi {{1}},\n\n*ORDER CONFIRMED*\nOrder: {{2}}\n\nWe have received your Mallu Spices order.\nWe will message you again when the courier is booked.',
        'example', jsonb_build_object('body_text', jsonb_build_array(jsonb_build_array('Alex','MS-12345')))
      )), now()),

    (v_store_id, v_channel_id, 'shipment_booked_v2', 'en_GB', 'UTILITY', 'DRAFT',
      jsonb_build_array(jsonb_build_object(
        'type','BODY',
        'text', E'*SHIPMENT BOOKED*\n\nOrder: {{1}}\nTracking: {{2}}\n\nYour parcel has been booked with our courier.\nWe will message you again when it is dispatched.',
        'example', jsonb_build_object('body_text', jsonb_build_array(jsonb_build_array('MS-12345','https://www.dhl.com/')))
      )), now()),

    (v_store_id, v_channel_id, 'order_shipped_v2', 'en_GB', 'UTILITY', 'DRAFT',
      jsonb_build_array(jsonb_build_object(
        'type','BODY',
        'text', E'*ORDER DISPATCHED*\n\nOrder: {{1}}\nTracking: {{2}}\n\nYour Mallu Spices parcel is on the way.\nThank you.',
        'example', jsonb_build_object('body_text', jsonb_build_array(jsonb_build_array('MS-12345','https://www.dhl.com/')))
      )), now()),

    (v_store_id, v_channel_id, 'order_out_for_delivery_v2', 'en_GB', 'UTILITY', 'DRAFT',
      jsonb_build_array(jsonb_build_object(
        'type','BODY',
        'text', E'*OUT FOR DELIVERY*\n\nOrder: {{1}}\nTracking: {{2}}\n\nYour parcel is with the courier for delivery today.\nPlease keep an eye out for it.',
        'example', jsonb_build_object('body_text', jsonb_build_array(jsonb_build_array('MS-12345','https://www.dhl.com/')))
      )), now()),

    (v_store_id, v_channel_id, 'order_delivered_v2', 'en_GB', 'UTILITY', 'DRAFT',
      jsonb_build_array(jsonb_build_object(
        'type','BODY',
        'text', E'Hi {{1}},\n\n*DELIVERED*\nOrder: {{2}}\n\nYour Mallu Spices order has been delivered.\nThank you for shopping with us.',
        'example', jsonb_build_object('body_text', jsonb_build_array(jsonb_build_array('Alex','MS-12345')))
      )), now()),

    (v_store_id, v_channel_id, 'order_cancelled_v2', 'en_GB', 'UTILITY', 'DRAFT',
      jsonb_build_array(jsonb_build_object(
        'type','BODY',
        'text', E'Hi {{1}},\n\n*ORDER CANCELLED*\nOrder: {{2}}\n\nYour order has been cancelled.\nMessage us if you need any help.',
        'example', jsonb_build_object('body_text', jsonb_build_array(jsonb_build_array('Alex','MS-12345')))
      )), now()),

    (v_store_id, v_channel_id, 'order_returned_v2', 'en_GB', 'UTILITY', 'DRAFT',
      jsonb_build_array(jsonb_build_object(
        'type','BODY',
        'text', E'Hi {{1}},\n\n*RETURN / REFUND UPDATE*\nOrder: {{2}}\n\nYour order has been marked as returned or refunded.\nMessage us if you need any help.',
        'example', jsonb_build_object('body_text', jsonb_build_array(jsonb_build_array('Alex','MS-12345')))
      )), now())
  on conflict (channel_id, name, language) do update set
    category = excluded.category,
    components = excluded.components,
    updated_at = now();

  insert into public.whatsapp_template_registry
    (store_id, name, meta_template_name, category, language, variables, status)
  values
    (v_store_id, 'Order Confirmation v2', 'order_confirm_v2', 'utility', 'en_GB', '["customer_name","order_number"]'::jsonb, 'draft'),
    (v_store_id, 'Shipment Booked v2', 'shipment_booked_v2', 'utility', 'en_GB', '["order_number","tracking_url"]'::jsonb, 'draft'),
    (v_store_id, 'Order Shipped v2', 'order_shipped_v2', 'utility', 'en_GB', '["order_number","tracking_url"]'::jsonb, 'draft'),
    (v_store_id, 'Out for Delivery v2', 'order_out_for_delivery_v2', 'utility', 'en_GB', '["order_number","tracking_url"]'::jsonb, 'draft'),
    (v_store_id, 'Order Delivered v2', 'order_delivered_v2', 'utility', 'en_GB', '["customer_name","order_number"]'::jsonb, 'draft'),
    (v_store_id, 'Order Cancelled v2', 'order_cancelled_v2', 'utility', 'en_GB', '["customer_name","order_number"]'::jsonb, 'draft'),
    (v_store_id, 'Order Returned v2', 'order_returned_v2', 'utility', 'en_GB', '["customer_name","order_number"]'::jsonb, 'draft')
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

create or replace function public.promote_approved_order_whatsapp_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  v_event_key text;
  v_order_status text;
  v_description text;
  v_variables jsonb;
  v_registry_id uuid;
begin
  if upper(coalesce(new.status, '')) <> 'APPROVED' then
    return new;
  end if;

  select lower(s.slug) into v_slug
  from public.stores s
  where s.id = new.store_id;

  if v_slug is distinct from 'malluspices' then
    return new;
  end if;

  case new.name
    when 'order_confirm_v2' then
      v_event_key := 'order.confirmed'; v_order_status := 'confirmed'; v_description := 'Order Confirmed'; v_variables := '["customer_name","order_number"]'::jsonb;
    when 'shipment_booked_v2' then
      v_event_key := 'order.shipment_booked'; v_order_status := 'shipment_booked'; v_description := 'Shipment Booked'; v_variables := '["order_number","tracking_url"]'::jsonb;
    when 'order_shipped_v2' then
      v_event_key := 'order.shipped'; v_order_status := 'shipped'; v_description := 'Order Shipped'; v_variables := '["order_number","tracking_url"]'::jsonb;
    when 'order_out_for_delivery_v2' then
      v_event_key := 'order.out_for_delivery'; v_order_status := 'out_for_delivery'; v_description := 'Out for Delivery'; v_variables := '["order_number","tracking_url"]'::jsonb;
    when 'order_delivered_v2' then
      v_event_key := 'order.delivered'; v_order_status := 'delivered'; v_description := 'Order Delivered'; v_variables := '["customer_name","order_number"]'::jsonb;
    when 'order_cancelled_v2' then
      v_event_key := 'order.cancelled'; v_order_status := 'cancelled'; v_description := 'Order Cancelled'; v_variables := '["customer_name","order_number"]'::jsonb;
    when 'order_returned_v2' then
      v_event_key := 'order.returned'; v_order_status := 'returned'; v_description := 'Order Returned'; v_variables := '["customer_name","order_number"]'::jsonb;
    else
      return new;
  end case;

  update public.whatsapp_template_registry
  set meta_template_id = new.meta_template_id,
      category = lower(coalesce(new.category, 'UTILITY')),
      status = 'approved',
      variables = v_variables
  where store_id = new.store_id
    and meta_template_name = new.name
    and language = new.language
  returning id into v_registry_id;

  if v_registry_id is null then
    return new;
  end if;

  insert into public.whatsapp_event_template_mappings
    (store_id, event_key, event_type, event_source, description, template_id, channel_id, enabled, customer_visible, requires_opt_in, variables, updated_at)
  values
    (new.store_id, v_event_key, 'TRANSACTIONAL', 'ORDER_SERVICE', v_description, v_registry_id, new.channel_id, true, true, false, v_variables, now())
  on conflict (store_id, event_key) do update set
    description = excluded.description,
    template_id = excluded.template_id,
    channel_id = excluded.channel_id,
    enabled = true,
    customer_visible = true,
    requires_opt_in = false,
    variables = excluded.variables,
    updated_at = now();

  insert into public.order_whatsapp_template_rules
    (store_id, order_status, template_name, language, enabled, updated_at)
  values
    (new.store_id, v_order_status, new.name, new.language, true, now())
  on conflict (store_id, order_status) do update set
    template_name = excluded.template_name,
    language = excluded.language,
    enabled = true,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.promote_approved_order_whatsapp_v2() from public, anon, authenticated;

drop trigger if exists trg_promote_approved_order_whatsapp_v2 on public.whatsapp_templates;
create trigger trg_promote_approved_order_whatsapp_v2
after insert or update of status on public.whatsapp_templates
for each row
execute function public.promote_approved_order_whatsapp_v2();

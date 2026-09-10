do $$
declare
  v_store_id uuid;
  v_channel_id uuid;
  v_header jsonb := jsonb_build_object(
    'type','HEADER',
    'format','IMAGE',
    'example_image_url','https://malluspices.com/business-logo.jpg'
  );
  v_buttons jsonb := jsonb_build_object(
    'type','BUTTONS',
    'buttons', jsonb_build_array(
      jsonb_build_object('type','URL','text','Track Order','url','https://malluspices.com/track-order'),
      jsonb_build_object('type','QUICK_REPLY','text','Contact Us')
    )
  );
begin
  select id into v_store_id from public.stores where lower(slug)='malluspices' limit 1;
  if v_store_id is null then raise exception 'MalluSpices store not found'; end if;

  select id into v_channel_id from public.whatsapp_channels
  where store_id=v_store_id and lower(coalesce(status,'active')) in ('active','connected')
  order by updated_at desc nulls last, created_at desc nulls last limit 1;
  if v_channel_id is null then raise exception 'Active MalluSpices WhatsApp channel not found'; end if;

  insert into public.whatsapp_templates(store_id,channel_id,name,language,category,status,components,updated_at)
  select v_store_id,v_channel_id,x.new_name,'en_GB','UTILITY','DRAFT',
         jsonb_build_array(v_header) || coalesce(src.components,'[]'::jsonb) || jsonb_build_array(v_buttons),now()
  from (values
    ('order_confirm_v3','order_confirm_v2'),
    ('shipment_booked_v3','shipment_booked_v2'),
    ('order_shipped_v3','order_shipped_v2'),
    ('order_out_for_delivery_v3','order_out_for_delivery_v2'),
    ('order_delivered_v3','order_delivered_v2'),
    ('order_cancelled_v3','order_cancelled_v2'),
    ('order_returned_v3','order_returned_v2'),
    ('delivery_tracking_update_v2','delivery_tracking_update_v1')
  ) as x(new_name,source_name)
  join public.whatsapp_templates src on src.store_id=v_store_id and src.channel_id=v_channel_id and src.name=x.source_name and src.language='en_GB'
  on conflict (channel_id,name,language) do update set
    components=excluded.components, category=excluded.category, status='DRAFT', meta_template_id=null,
    rejection_reason=null, submitted_at=null, updated_at=now();

  insert into public.whatsapp_template_registry(store_id,name,meta_template_name,category,language,variables,status)
  values
    (v_store_id,'Order Confirmation Rich','order_confirm_v3','utility','en_GB','["customer_name","order_number"]'::jsonb,'draft'),
    (v_store_id,'Shipment Booked Rich','shipment_booked_v3','utility','en_GB','["order_number","tracking_url"]'::jsonb,'draft'),
    (v_store_id,'Order Shipped Rich','order_shipped_v3','utility','en_GB','["order_number","tracking_url"]'::jsonb,'draft'),
    (v_store_id,'Out for Delivery Rich','order_out_for_delivery_v3','utility','en_GB','["order_number","tracking_url"]'::jsonb,'draft'),
    (v_store_id,'Order Delivered Rich','order_delivered_v3','utility','en_GB','["customer_name","order_number"]'::jsonb,'draft'),
    (v_store_id,'Order Cancelled Rich','order_cancelled_v3','utility','en_GB','["customer_name","order_number"]'::jsonb,'draft'),
    (v_store_id,'Order Returned Rich','order_returned_v3','utility','en_GB','["customer_name","order_number"]'::jsonb,'draft'),
    (v_store_id,'Delivery Tracking Update Rich','delivery_tracking_update_v2','utility','en_GB','["order_number","tracking_update","tracking_location","tracking_time","tracking_url"]'::jsonb,'draft')
  on conflict (store_id,meta_template_name) do update set
    name=excluded.name,category=excluded.category,language=excluded.language,variables=excluded.variables,
    status='draft',meta_template_id=null;
end $$;

create or replace function public.promote_approved_malluspices_rich_whatsapp()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_slug text;
  v_event_key text;
  v_order_status text;
  v_description text;
  v_vars jsonb;
  v_registry_id uuid;
begin
  if upper(coalesce(new.status,'')) <> 'APPROVED' then return new; end if;
  select lower(slug) into v_slug from public.stores where id=new.store_id;
  if v_slug is distinct from 'malluspices' then return new; end if;

  case new.name
    when 'order_confirm_v3' then v_event_key:='order.confirmed'; v_order_status:='confirmed'; v_description:='Order Confirmed'; v_vars:='["customer_name","order_number"]'::jsonb;
    when 'shipment_booked_v3' then v_event_key:='order.shipment_booked'; v_order_status:='shipment_booked'; v_description:='Shipment Booked'; v_vars:='["order_number","tracking_url"]'::jsonb;
    when 'order_shipped_v3' then v_event_key:='order.shipped'; v_order_status:='shipped'; v_description:='Order Shipped'; v_vars:='["order_number","tracking_url"]'::jsonb;
    when 'order_out_for_delivery_v3' then v_event_key:='order.out_for_delivery'; v_order_status:='out_for_delivery'; v_description:='Out for Delivery'; v_vars:='["order_number","tracking_url"]'::jsonb;
    when 'order_delivered_v3' then v_event_key:='order.delivered'; v_order_status:='delivered'; v_description:='Order Delivered'; v_vars:='["customer_name","order_number"]'::jsonb;
    when 'order_cancelled_v3' then v_event_key:='order.cancelled'; v_order_status:='cancelled'; v_description:='Order Cancelled'; v_vars:='["customer_name","order_number"]'::jsonb;
    when 'order_returned_v3' then v_event_key:='order.returned'; v_order_status:='returned'; v_description:='Order Returned'; v_vars:='["customer_name","order_number"]'::jsonb;
    when 'delivery_tracking_update_v2' then v_event_key:='shipment.tracking_update'; v_order_status:=null; v_description:='DHL shipment tracking update'; v_vars:='["order_number","tracking_update","tracking_location","tracking_time","tracking_url"]'::jsonb;
    else return new;
  end case;

  update public.whatsapp_template_registry
     set meta_template_id=new.meta_template_id,status='approved',category=lower(coalesce(new.category,'UTILITY')),variables=v_vars
   where store_id=new.store_id and meta_template_name=new.name and language=new.language
   returning id into v_registry_id;
  if v_registry_id is null then return new; end if;

  insert into public.whatsapp_event_template_mappings
    (store_id,event_key,event_type,event_source,description,template_id,channel_id,enabled,customer_visible,requires_opt_in,variables,updated_at)
  values
    (new.store_id,v_event_key,'TRANSACTIONAL',case when v_event_key='shipment.tracking_update' then 'DHL_TRACKING' else 'ORDER_SERVICE' end,
     v_description,v_registry_id,new.channel_id,true,true,false,v_vars,now())
  on conflict (store_id,event_key) do update set
    description=excluded.description,template_id=excluded.template_id,channel_id=excluded.channel_id,
    enabled=true,customer_visible=true,requires_opt_in=false,variables=excluded.variables,updated_at=now();

  if v_order_status is not null then
    insert into public.order_whatsapp_template_rules(store_id,order_status,template_name,language,enabled,updated_at)
    values(new.store_id,v_order_status,new.name,new.language,true,now())
    on conflict (store_id,order_status) do update set template_name=excluded.template_name,language=excluded.language,enabled=true,updated_at=now();
  else
    update public.shipment_events
       set whatsapp_template_name=new.name
     where whatsapp_status='pending' and (whatsapp_template_name is null or whatsapp_template_name='delivery_tracking_update_v1');
  end if;
  return new;
end;
$$;

revoke all on function public.promote_approved_malluspices_rich_whatsapp() from public,anon,authenticated;
drop trigger if exists trg_promote_approved_malluspices_rich_whatsapp on public.whatsapp_templates;
create trigger trg_promote_approved_malluspices_rich_whatsapp
after insert or update of status on public.whatsapp_templates
for each row execute function public.promote_approved_malluspices_rich_whatsapp();

create or replace function public.assign_shipment_event_whatsapp_template()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_name text;
begin
  if new.whatsapp_template_name is not null then return new; end if;
  select r.meta_template_name into v_name
  from public.shipments sh
  join public.orders o on o.id=sh.order_id
  join public.whatsapp_event_template_mappings m on m.store_id=o.store_id and m.event_key='shipment.tracking_update' and m.enabled=true
  join public.whatsapp_template_registry r on r.id=m.template_id and lower(r.status) in ('approved','active')
  where sh.id=new.shipment_id
  limit 1;
  if v_name is not null then new.whatsapp_template_name:=v_name; end if;
  return new;
end;
$$;

revoke all on function public.assign_shipment_event_whatsapp_template() from public,anon,authenticated;
drop trigger if exists trg_assign_shipment_event_whatsapp_template on public.shipment_events;
create trigger trg_assign_shipment_event_whatsapp_template
before insert on public.shipment_events
for each row execute function public.assign_shipment_event_whatsapp_template();

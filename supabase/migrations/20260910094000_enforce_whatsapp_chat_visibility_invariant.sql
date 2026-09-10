-- Database-level guardrail: every visible WhatsApp message advances chat activity,
-- and any template send recorded in whatsapp_outbound_log but missing from the
-- customer-care inbox is automatically reconciled into whatsapp_messages.

create or replace function public.sync_whatsapp_chat_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact_id uuid;
  v_ts timestamptz := coalesce(new.created_at, now());
begin
  update public.whatsapp_conversations
     set last_message_at = greatest(coalesce(last_message_at, v_ts), v_ts),
         updated_at = now()
   where id = new.conversation_id
   returning contact_id into v_contact_id;

  if v_contact_id is not null then
    update public.whatsapp_contacts
       set last_message_at = greatest(coalesce(last_message_at, v_ts), v_ts)
     where id = v_contact_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_whatsapp_chat_activity on public.whatsapp_messages;
create trigger trg_whatsapp_chat_activity
after insert or update of status, message_text, created_at on public.whatsapp_messages
for each row execute function public.sync_whatsapp_chat_activity();

create or replace function public.reconcile_whatsapp_outbound_chat_visibility(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_digits text;
  v_contact_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_display_name text;
  v_body text;
  v_vars jsonb;
  v_order record;
  v_var text;
  v_idx bigint;
  v_value text;
  v_status text;
  v_count integer := 0;
begin
  for r in
    select l.id,l.wa_message_id,l.store_id,l.recipient_phone,l.template_name,l.status,l.created_at
      from public.whatsapp_outbound_log l
     where l.wa_message_id is not null
       and l.template_name is not null
       and l.created_at >= now() - interval '14 days'
       and not exists (
         select 1 from public.whatsapp_messages m where m.wa_message_id = l.wa_message_id
       )
     order by l.created_at asc
     limit greatest(1, least(coalesce(p_limit,200),1000))
  loop
    v_digits := regexp_replace(coalesce(r.recipient_phone,''),'\D','','g');
    if v_digits = '' then continue; end if;

    v_contact_id := null;
    v_display_name := null;
    select c.id,c.display_name
      into v_contact_id,v_display_name
      from public.whatsapp_contacts c
     where c.store_id=r.store_id
       and regexp_replace(coalesce(c.phone_number,''),'\D','','g')=v_digits
     order by c.last_message_at desc nulls last
     limit 1;

    if v_contact_id is null then
      select o.customer_name
        into v_display_name
        from public.orders o
       where o.store_id=r.store_id
         and regexp_replace(coalesce(o.customer_phone,''),'\D','','g')=v_digits
       order by o.created_at desc
       limit 1;

      insert into public.whatsapp_contacts(store_id,phone_number,display_name,last_message_at)
      values(r.store_id,v_digits,coalesce(nullif(v_display_name,''),v_digits),coalesce(r.created_at,now()))
      on conflict (store_id,phone_number) do update
        set last_message_at=greatest(coalesce(public.whatsapp_contacts.last_message_at,excluded.last_message_at),excluded.last_message_at)
      returning id,display_name into v_contact_id,v_display_name;
    end if;

    v_conversation_id := null;
    select c.id into v_conversation_id
      from public.whatsapp_conversations c
     where c.contact_id=v_contact_id
     limit 1;

    if v_conversation_id is null then
      insert into public.whatsapp_conversations(store_id,contact_id,status,handling_mode,last_message_at,updated_at)
      values(r.store_id,v_contact_id,'open','AI',coalesce(r.created_at,now()),now())
      on conflict (contact_id) do update
        set last_message_at=greatest(coalesce(public.whatsapp_conversations.last_message_at,excluded.last_message_at),excluded.last_message_at),
            updated_at=now()
      returning id into v_conversation_id;
    end if;

    v_body := null;
    v_vars := null;

    select component->>'text'
      into v_body
      from public.whatsapp_templates t
      cross join lateral jsonb_array_elements(t.components) component
     where t.store_id=r.store_id
       and t.name=r.template_name
       and upper(coalesce(component->>'type',''))='BODY'
     order by t.last_synced_at desc nulls last,t.updated_at desc nulls last
     limit 1;

    select reg.variables
      into v_vars
      from public.whatsapp_template_registry reg
     where reg.store_id=r.store_id
       and reg.meta_template_name=r.template_name
     limit 1;

    select o.customer_name,o.order_number,o.tracking_number,o.tracking_url,o.carrier
      into v_order
      from public.order_whatsapp_notifications n
      join public.orders o on o.id=n.order_id
     where n.wa_message_id=r.wa_message_id
     limit 1;

    if coalesce(v_body,'')<>'' and v_order is not null and jsonb_typeof(coalesce(v_vars,'[]'::jsonb))='array' then
      for v_var,v_idx in
        select value,ordinality from jsonb_array_elements_text(v_vars) with ordinality
      loop
        v_value := case v_var
          when 'customer_name' then coalesce(v_order.customer_name,'Customer')
          when 'order_number' then coalesce(v_order.order_number,'Order')
          when 'tracking_number' then coalesce(v_order.tracking_number,'Not available')
          when 'tracking_url' then 'https://malluspices.com/track-order?order='||coalesce(v_order.order_number,'')
          else null
        end;
        if v_value is not null then
          v_body := replace(v_body,'{{'||v_idx::text||'}}',v_value);
        end if;
      end loop;
    end if;

    if coalesce(v_body,'')='' or v_order is null then
      v_body := '[WhatsApp template sent: '||r.template_name||']';
    end if;

    v_status := case lower(coalesce(r.status,''))
      when 'read' then 'read'
      when 'delivered' then 'delivered'
      when 'failed' then 'failed'
      else 'sent'
    end;

    v_message_id := null;
    insert into public.whatsapp_messages(
      conversation_id,wa_message_id,direction,message_type,message_text,status,ai_generated,channel_type,created_at,updated_at
    ) values(
      v_conversation_id,r.wa_message_id,'outbound','template',v_body,v_status,false,'whatsapp',coalesce(r.created_at,now()),now()
    )
    on conflict (wa_message_id) do nothing
    returning id into v_message_id;

    if v_message_id is null then
      select id into v_message_id from public.whatsapp_messages where wa_message_id=r.wa_message_id;
    end if;

    if v_message_id is not null then
      update public.whatsapp_outbound_log set message_id=v_message_id where id=r.id and message_id is distinct from v_message_id;
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.reconcile_whatsapp_outbound_chat_visibility(integer) from public, anon, authenticated;
grant execute on function public.reconcile_whatsapp_outbound_chat_visibility(integer) to service_role;

select cron.schedule(
  'whatsapp-chat-integrity-reconcile',
  '* * * * *',
  'select public.reconcile_whatsapp_outbound_chat_visibility(200);'
);
-- Keep the existing whatsapp_* inbox tables as the canonical unified inbox while
-- ensuring Instagram/Facebook rows carry the correct channel metadata.
create or replace function public.normalize_customer_care_message_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_type text;
begin
  select coalesce(channel_type, 'whatsapp')
    into v_channel_type
  from public.whatsapp_conversations
  where id = new.conversation_id;

  new.channel_type := coalesce(v_channel_type, new.channel_type, 'whatsapp');

  if new.channel_type in ('instagram', 'facebook') then
    if new.external_message_id is null and new.wa_message_id is not null then
      new.external_message_id := new.wa_message_id;
    end if;
    -- A social message id is not a WhatsApp WAMID. Keeping this null prevents
    -- the WhatsApp delivery-log fallback from being applied to social messages.
    new.wa_message_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists whatsapp_messages_normalize_customer_care_channel on public.whatsapp_messages;
create trigger whatsapp_messages_normalize_customer_care_channel
before insert or update of conversation_id, channel_type, wa_message_id, external_message_id
on public.whatsapp_messages
for each row execute function public.normalize_customer_care_message_channel();
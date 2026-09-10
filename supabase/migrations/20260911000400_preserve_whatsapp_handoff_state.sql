create or replace function public.preserve_whatsapp_handoff_state_on_message_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.last_message_at is distinct from old.last_message_at
     and old.handling_mode in ('AI_DRAFT', 'HUMAN')
     and new.handling_mode = 'AI' then
    new.handling_mode := old.handling_mode;

    if old.status = 'waiting' and new.status = 'open' then
      new.status := old.status;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists preserve_whatsapp_handoff_state_on_message_touch on public.whatsapp_conversations;
create trigger preserve_whatsapp_handoff_state_on_message_touch
before update on public.whatsapp_conversations
for each row
execute function public.preserve_whatsapp_handoff_state_on_message_touch();

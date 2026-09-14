update public.voice_assistant_commands
set requires_confirmation = true
where status = 'pending_confirmation'
  and requires_confirmation is distinct from true;

alter table public.voice_assistant_commands
  drop constraint if exists voice_assistant_commands_confirmation_state_check;

alter table public.voice_assistant_commands
  add constraint voice_assistant_commands_confirmation_state_check
  check (status <> 'pending_confirmation' or requires_confirmation = true);

create index if not exists live_web_monitor_events_user_id_idx
  on public.live_web_monitor_events (user_id);

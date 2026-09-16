create or replace function public.shruthi_sync_browser_result_to_source_command()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_command_id uuid;
  v_result text;
begin
  if new.status not in ('completed','failed','cancelled') then
    return new;
  end if;
  begin
    v_command_id := nullif(new.metadata->>'source_voice_command_id','')::uuid;
  exception when others then
    v_command_id := null;
  end;
  if v_command_id is null then return new; end if;

  v_result := case
    when new.status='completed' then coalesce(nullif(new.current_step,''),'Shruthi completed the Live Web task.')
    when new.status='failed' then 'Live Web task failed: ' || coalesce(nullif(new.last_error,''),'unknown browser error')
    else 'Live Web task was cancelled.'
  end;

  update public.voice_assistant_commands
     set status = case when new.status='completed' then 'completed' when new.status='cancelled' then 'cancelled' else 'failed' end,
         response_text = v_result,
         action_payload = coalesce(action_payload,'{}'::jsonb) || jsonb_build_object(
           'computer_session_id',new.id,
           'computer_result_status',new.status,
           'computer_result',v_result,
           'computer_result_at',now(),
           'browser_active_url',coalesce(new.metadata->>'active_url',new.target_url)
         )
   where id=v_command_id and user_id=new.user_id;
  return new;
end;
$$;

drop trigger if exists trg_shruthi_sync_browser_result_to_source_command on public.nora_action_sessions;
create trigger trg_shruthi_sync_browser_result_to_source_command
after update of status,current_step,last_error on public.nora_action_sessions
for each row
when (new.status in ('completed','failed','cancelled'))
execute function public.shruthi_sync_browser_result_to_source_command();

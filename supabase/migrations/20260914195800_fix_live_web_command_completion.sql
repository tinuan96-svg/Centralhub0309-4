create or replace function public.complete_voice_computer_command(
  p_command_id uuid,
  p_session_id uuid,
  p_target_key text,
  p_target_url text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_admin() then
    return false;
  end if;

  if not exists (
    select 1
    from public.nora_action_sessions s
    where s.id = p_session_id
      and s.user_id = v_uid
  ) then
    return false;
  end if;

  update public.voice_assistant_commands
  set status = 'completed',
      action_payload = coalesce(action_payload, '{}'::jsonb) || jsonb_build_object(
        'computer_session_id', p_session_id,
        'delegated_to', 'nora_computer_mode',
        'resolved_target_key', coalesce(p_target_key, ''),
        'resolved_target_url', coalesce(p_target_url, '')
      )
  where id = p_command_id
    and user_id = v_uid
    and status in ('ready_for_computer', 'pending_confirmation');

  return found;
end;
$$;

revoke all on function public.complete_voice_computer_command(uuid,uuid,text,text) from public, anon;
grant execute on function public.complete_voice_computer_command(uuid,uuid,text,text) to authenticated;

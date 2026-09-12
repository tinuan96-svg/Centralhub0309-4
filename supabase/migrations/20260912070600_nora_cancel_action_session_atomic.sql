create or replace function public.nora_cancel_action_session(
  p_session_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  update public.nora_action_sessions
  set status = 'cancelled',
      current_step = 'Cancelled by admin',
      awaiting_input = false,
      requires_approval = false,
      approval_reason = null,
      completed_at = now()
  where id = p_session_id
    and user_id = p_user_id
    and status not in ('completed', 'failed', 'cancelled');

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return false;
  end if;

  update public.nora_action_steps
  set status = 'skipped',
      completed_at = coalesce(completed_at, now())
  where session_id = p_session_id
    and status in ('planned', 'running', 'waiting_input', 'waiting_approval');

  return true;
end;
$$;

revoke all on function public.nora_cancel_action_session(uuid, uuid) from public;
revoke all on function public.nora_cancel_action_session(uuid, uuid) from anon;
revoke all on function public.nora_cancel_action_session(uuid, uuid) from authenticated;
grant execute on function public.nora_cancel_action_session(uuid, uuid) to service_role;

-- Repair any active step left behind by an already-terminal session from older builds.
update public.nora_action_steps as step
set status = 'skipped',
    completed_at = coalesce(step.completed_at, now())
from public.nora_action_sessions as session
where session.id = step.session_id
  and session.status in ('cancelled', 'completed', 'failed')
  and step.status in ('planned', 'running', 'waiting_input', 'waiting_approval');

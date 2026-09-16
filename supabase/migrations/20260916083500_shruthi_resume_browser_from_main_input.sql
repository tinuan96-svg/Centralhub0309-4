create or replace function public.shruthi_resume_browser_question(
  p_session_id uuid,
  p_answer text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.nora_action_sessions%rowtype;
  v_question public.nora_action_questions%rowtype;
  v_answer text := btrim(coalesce(p_answer,''));
  v_active_url text;
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;
  if v_answer = '' or char_length(v_answer) > 2000 then
    raise exception 'invalid_answer';
  end if;

  select * into v_session
    from public.nora_action_sessions
   where id = p_session_id
     and user_id = v_uid
     and status in ('waiting_input','paused')
   for update;
  if not found then
    raise exception 'browser_session_not_waiting';
  end if;

  select * into v_question
    from public.nora_action_questions
   where session_id = p_session_id
     and status = 'pending'
   order by created_at asc
   limit 1
   for update;
  if not found then
    raise exception 'pending_question_not_found';
  end if;
  if coalesce(v_question.is_sensitive,false) then
    raise exception 'sensitive_answer_must_be_completed_in_browser';
  end if;

  update public.nora_action_questions
     set answer = v_answer,
         status = 'answered',
         answered_at = now()
   where id = v_question.id;

  v_active_url := nullif(v_session.metadata->>'active_url','');
  if v_active_url is null or v_active_url !~* '^https://[^[:space:]]+$' then
    v_active_url := v_session.target_url;
  end if;

  update public.nora_action_sessions
     set goal = left(
           coalesce(goal,'Complete the requested browser task')
           || E'\n\nSAME SHRUTHI CONVERSATION — USER ANSWER TO THE PENDING QUESTION:\nQuestion: '
           || left(coalesce(v_question.question,''),1200)
           || E'\nAnswer: '
           || v_answer
           || E'\nContinue the same task from this answer and the current active page. Do not create a new task or conversation.',
           12000
         ),
         status = 'planned',
         awaiting_input = false,
         current_step = 'Continuing from the main Shruthi conversation',
         last_error = null,
         metadata = (coalesce(metadata,'{}'::jsonb)
                     - 'computer_response_id'
                     - 'computer_call_id'
                     - 'computer_turn_count')
                    || jsonb_build_object(
                         'resumed_from_main_conversation', true,
                         'resumed_at', now(),
                         'active_url', v_active_url
                       ),
         updated_at = now()
   where id = p_session_id;

  return jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'target_url', v_session.target_url,
    'active_url', v_active_url,
    'question_id', v_question.id
  );
end;
$$;

revoke all on function public.shruthi_resume_browser_question(uuid,text) from public;
grant execute on function public.shruthi_resume_browser_question(uuid,text) to authenticated;
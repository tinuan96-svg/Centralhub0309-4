-- Company-scoped HR compliance task reviews. No external submission.
alter table hr.compliance_tasks add column if not exists reviewed_by uuid;
alter table hr.compliance_tasks add column if not exists reviewed_at timestamptz;
alter table hr.compliance_tasks add column if not exists review_note text;
alter table hr.compliance_tasks add constraint hr_tasks_review_note_len check(review_note is null or length(review_note)<=400);
CREATE OR REPLACE FUNCTION public.ch_hr_admin_task_list(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(to_jsonb(t) order by t.due_at nulls last,t.created_at desc),'[]'::jsonb)
 from (select id,company_id,task_type,title,due_at,status,guidance_version,
              human_review_required,reviewed_at,review_note,created_at
       from hr.compliance_tasks where company_id=p_company_id
       order by due_at nulls last,created_at desc limit 150) t;
$function$

CREATE OR REPLACE FUNCTION public.ch_hr_admin_review_task(p_company_id uuid, p_task_id uuid, p_actor uuid, p_action text, p_note text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status text; v_next text;
begin
 if p_company_id is null or p_task_id is null or p_actor is null
    or p_action not in ('complete','reopen')
    or (p_action='complete' and length(btrim(coalesce(p_note,''))) not between 20 and 400)
    or length(coalesce(p_note,''))>400
 then raise exception 'Invalid task review'; end if;
 select status into v_status from hr.compliance_tasks
 where id=p_task_id and company_id=p_company_id for update;
 if not found then raise exception 'Compliance task not found in employer scope'; end if;
 if p_action='complete' and v_status not in ('open','in_review')
 then raise exception 'This task is not eligible for completion'; end if;
 if p_action='reopen' and v_status<>'completed'
 then raise exception 'Only completed tasks may be reopened'; end if;
 v_next:=case when p_action='complete' then 'completed' else 'open' end;
 update hr.compliance_tasks set status=v_next, reviewed_by=p_actor,reviewed_at=clock_timestamp(),
  review_note=case when p_action='complete' then btrim(p_note) else null end
 where id=p_task_id and company_id=p_company_id;
 insert into hr.change_audit(company_id,actor_user_id,resource_type,resource_id,action,note)
 values(p_company_id,p_actor,'compliance_task',p_task_id,p_action,
        case when p_action='complete' then 'Reviewed by an authorised human; evidence remains outside audit trail' else 'Reopened for human review' end);
 return v_next;
end $function$

revoke all on function public.ch_hr_admin_task_list(uuid) from public,anon,authenticated;
revoke all on function public.ch_hr_admin_review_task(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ch_hr_admin_task_list(uuid) to service_role;
grant execute on function public.ch_hr_admin_review_task(uuid,uuid,uuid,text,text) to service_role;
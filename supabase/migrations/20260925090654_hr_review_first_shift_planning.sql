-- Review-first shift scheduling: draft workers may have a planned shift but only active
-- workers can receive a scheduled shift after explicit authorised human review.
alter table hr.shifts drop constraint shifts_status_check;
alter table hr.shifts add constraint shifts_status_check
 check(status in ('planned','scheduled','completed','cancelled'));
alter table hr.shifts alter column status set default 'planned';
create or replace function public.ch_hr_admin_shift_list(p_company_id uuid)
returns jsonb language sql stable security definer set search_path='' as $fn$
 select coalesce(jsonb_agg(to_jsonb(s) order by s.starts_at desc),'[]'::jsonb)
 from (select id,employee_id,starts_at,ends_at,unpaid_break_minutes,status
       from hr.shifts where company_id=p_company_id order by starts_at desc limit 150) s;
$fn$;
create or replace function public.ch_hr_admin_plan_shift(
 p_company_id uuid,p_employee_id uuid,p_start timestamptz,p_end timestamptz,
 p_break_minutes integer,p_actor uuid)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare v_id uuid;v_employee uuid;
begin
 if p_company_id is null or p_employee_id is null or p_actor is null or
    p_start is null or p_end is null or p_end<=p_start
    or p_end-p_start>interval '16 hours'
    or p_start<clock_timestamp()-interval '30 days'
    or p_start>clock_timestamp()+interval '366 days'
    or p_break_minutes is null or p_break_minutes<0 or
       p_break_minutes>=extract(epoch from (p_end-p_start))/60
 then raise exception 'Invalid shift plan'; end if;
 select id into v_employee from hr.employees where id=p_employee_id and company_id=p_company_id
 and status in ('draft','active','on_leave') for update;
 if v_employee is null then raise exception 'Employee not eligible for a planned shift';end if;
 if exists(select 1 from hr.shifts where employee_id=p_employee_id and company_id=p_company_id
   and status in ('planned','scheduled') and starts_at<p_end and ends_at>p_start)
 then raise exception 'Employee has an overlapping shift'; end if;
 insert into hr.shifts(employee_id,company_id,starts_at,ends_at,unpaid_break_minutes,status)
 values(p_employee_id,p_company_id,p_start,p_end,p_break_minutes,'planned') returning id into v_id;
 insert into hr.change_audit(company_id,actor_user_id,resource_type,resource_id,action)
 values(p_company_id,p_actor,'shift',v_id,'plan_shift');
 return v_id;
end $fn$;
create or replace function public.ch_hr_admin_publish_shift(
 p_company_id uuid,p_shift_id uuid,p_actor uuid)
returns text language plpgsql security definer set search_path='' as $fn$
declare v_employee uuid;v_status text;
begin
 if p_company_id is null or p_shift_id is null or p_actor is null then raise exception 'Invalid approval';end if;
 select s.employee_id,s.status into v_employee,v_status from hr.shifts s
 where s.id=p_shift_id and s.company_id=p_company_id for update;
 if v_status is distinct from 'planned' then raise exception 'Only planned shift may be issued';end if;
 if not exists(select 1 from hr.employees e where e.id=v_employee and e.company_id=p_company_id and e.status='active')
 then raise exception 'Only a confirmed active employee may receive an issued shift';end if;
 update hr.shifts set status='scheduled' where id=p_shift_id and company_id=p_company_id;
 insert into hr.change_audit(company_id,actor_user_id,resource_type,resource_id,action)
 values(p_company_id,p_actor,'shift',p_shift_id,'publish_shift');
 return 'scheduled';
end $fn$;
revoke all on function public.ch_hr_admin_shift_list(uuid) from public,anon,authenticated;
revoke all on function public.ch_hr_admin_plan_shift(uuid,uuid,timestamptz,timestamptz,integer,uuid) from public,anon,authenticated;
revoke all on function public.ch_hr_admin_publish_shift(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ch_hr_admin_shift_list(uuid) to service_role;
grant execute on function public.ch_hr_admin_plan_shift(uuid,uuid,timestamptz,timestamptz,integer,uuid) to service_role;
grant execute on function public.ch_hr_admin_publish_shift(uuid,uuid,uuid) to service_role;
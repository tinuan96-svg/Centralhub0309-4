-- Internal HR leave requests only. Approval, entitlement, accrual, pay and statutory
-- calculations remain disabled until verified per employee and employment pattern.
create or replace function public.ch_hr_admin_create_leave_request(
 p_company_id uuid,p_employee_id uuid,p_leave_type text,p_start date,p_end date,p_actor uuid)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare v_id uuid;v_employee uuid;
begin
 if p_company_id is null or p_employee_id is null or p_actor is null or
 p_leave_type not in ('annual','sick','unpaid','maternity','paternity','adoption','parental','other') or
 p_start is null or p_end is null or p_end<p_start or p_end-p_start>366
 then raise exception 'Invalid internal leave request';end if;
 select id into v_employee from hr.employees where id=p_employee_id and company_id=p_company_id
 and status in ('draft','active','on_leave') for update;
 if v_employee is null then raise exception 'Employee is unavailable for this employer';end if;
 if exists(select 1 from hr.leave_requests l where l.employee_id=p_employee_id and l.company_id=p_company_id
  and l.approval_status in ('pending','approved') and l.starts_on<=p_end and l.ends_on>=p_start)
 then raise exception 'Leave request overlaps an existing pending or approved request';end if;
 insert into hr.leave_requests(company_id,employee_id,leave_type,starts_on,ends_on,approval_status)
 values(p_company_id,p_employee_id,p_leave_type,p_start,p_end,'pending') returning id into v_id;
 insert into hr.change_audit(company_id,actor_user_id,resource_type,resource_id,action)
 values(p_company_id,p_actor,'leave_request',v_id,'create_pending');
 return v_id;
end $fn$;
revoke all on function public.ch_hr_admin_create_leave_request(uuid,uuid,text,date,date,uuid) from public,anon,authenticated;
grant execute on function public.ch_hr_admin_create_leave_request(uuid,uuid,text,date,date,uuid) to service_role;
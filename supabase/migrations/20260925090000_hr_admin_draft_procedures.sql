-- 2026-09-25: private HR admin read/draft-only procedures. Execute only via verified server identity.
-- HR schema remains outside the exposed PostgREST schemas. Public RPC grants: service_role only.
create or replace function public.ch_hr_admin_snapshot(p_company_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $function$
  select jsonb_build_object(
    'company_id', p_company_id,
    'employees', coalesce((select jsonb_agg(to_jsonb(e) order by e.employee_number) from
      (select id, company_id, employee_number, full_name, job_title, department, employment_location,
        contract_type, start_date, end_date, status, created_at from hr.employees
       where company_id=p_company_id order by employee_number limit 200) e), '[]'::jsonb),
    'attendance',coalesce((select jsonb_agg(to_jsonb(a) order by a.clock_in desc) from
      (select a.id, a.employee_id, a.clock_in, a.clock_out, a.unpaid_break_minutes, a.approval_status
       from hr.attendance_entries a where a.company_id=p_company_id order by a.clock_in desc limit 200) a),'[]'::jsonb),
    'leave',coalesce((select jsonb_agg(to_jsonb(l) order by l.starts_on desc) from
      (select l.id,l.employee_id,l.leave_type,l.starts_on,l.ends_on,l.approval_status
       from hr.leave_requests l where l.company_id=p_company_id order by l.starts_on desc limit 200) l),'[]'::jsonb),
    'sponsorship',coalesce((select jsonb_agg(to_jsonb(s) order by s.visa_expiry_date nulls last) from
      (select s.id,s.employee_id,s.occupation_code,s.job_title,s.sponsorship_start,s.sponsorship_end,
        s.visa_expiry_date,s.right_to_work_followup_date,s.compliance_status
       from hr.sponsor_cases s where s.company_id=p_company_id
       order by s.visa_expiry_date nulls last limit 200) s),'[]'::jsonb),
    'payroll',coalesce((select jsonb_agg(to_jsonb(p) order by p.period_end desc) from
      (select p.id,p.period_start,p.period_end,p.pay_date,p.pay_frequency,p.tax_year,p.status
       from hr.payroll_runs p where p.company_id=p_company_id order by p.period_end desc limit 200) p),'[]'::jsonb),
    'metrics',jsonb_build_object(
      'total_employees',(select count(*) from hr.employees where company_id=p_company_id),
      'active_employees',(select count(*) from hr.employees where company_id=p_company_id and status='active'),
      'sponsored_employees',(select count(distinct employee_id) from hr.sponsor_cases where company_id=p_company_id and compliance_status<>'closed'),
      'on_leave',(select count(*) from hr.leave_requests where company_id=p_company_id and approval_status='approved' and current_date between starts_on and ends_on),
      'expiring_visas_90_days',(select count(*) from hr.sponsor_cases where company_id=p_company_id and visa_expiry_date between current_date and current_date+90),
      'overdue_followup',(select count(*) from hr.sponsor_cases where company_id=p_company_id and right_to_work_followup_date<current_date and compliance_status<>'closed'),
      'draft_payroll',(select count(*) from hr.payroll_runs where company_id=p_company_id and status in ('draft','review_pending'))
    )
  )
  where exists(select 1 from public.store_business_identity b where b.id=p_company_id);
$function$;
create or replace function public.ch_hr_admin_create_draft_employee(
  p_company_id uuid,p_employee_number text,p_full_name text,p_start_date date,p_job_title text,p_actor uuid
) returns uuid language plpgsql volatile security definer set search_path=''
as $function$
declare v_id uuid;
begin
  if p_actor is null or p_company_id is null or p_start_date is null
     or length(btrim(coalesce(p_employee_number,''))) not between 1 and 32
     or length(btrim(coalesce(p_full_name,''))) not between 1 and 200
     or length(coalesce(p_job_title,''))>120
     or not exists(select 1 from public.store_business_identity where id=p_company_id)
  then raise exception 'Invalid HR draft request'; end if;
  insert into hr.employers(company_id) values (p_company_id)
    on conflict(company_id) do nothing;
  insert into hr.employees(company_id,employee_number,full_name,start_date,job_title,status)
  values(p_company_id,btrim(p_employee_number),btrim(p_full_name),p_start_date,
    nullif(btrim(p_job_title),''),'draft')
  returning id into v_id;
  insert into hr.change_audit(company_id,actor_user_id,resource_type,resource_id,action)
  values(p_company_id,p_actor,'employee',v_id,'create_draft');
  return v_id;
end
$function$;
revoke all on function public.ch_hr_admin_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.ch_hr_admin_create_draft_employee(uuid,text,text,date,text,uuid) from public,anon,authenticated;
grant execute on function public.ch_hr_admin_snapshot(uuid) to service_role;
grant execute on function public.ch_hr_admin_create_draft_employee(uuid,text,text,date,text,uuid) to service_role;

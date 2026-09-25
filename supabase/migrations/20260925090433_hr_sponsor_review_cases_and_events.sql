-- Sponsor compliance internal, reviewed records only. Never an official Home Office SMS.
create table if not exists hr.sponsor_licences(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references hr.employers(company_id) on delete restrict,
 licence_number_ciphertext bytea,
 reported_status text not null default 'unverified'
  check(reported_status in ('unverified','active','suspended','revoked','expired','surrendered')),
 licence_start date,licence_end date,
 checked_by uuid,checked_at timestamptz,
 created_at timestamptz not null default now(),
 unique(id,company_id),
 check(licence_end is null or licence_start is null or licence_end>=licence_start)
);
comment on table hr.sponsor_licences is 'Internal employer-reported sponsorship metadata. Licence number must be encrypted server-side. Status is not Home Office verified.';
alter table hr.sponsor_cases add column if not exists sponsor_licence_id uuid;
alter table hr.sponsor_cases add column if not exists cos_reference_ciphertext bytea;
alter table hr.sponsor_cases add constraint hr_sponsor_case_licence_company_fk
 foreign key(sponsor_licence_id,company_id) references hr.sponsor_licences(id,company_id) on delete restrict;
create table if not exists hr.sponsor_change_events(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references hr.employers(company_id) on delete restrict,
 employee_id uuid,
 event_kind text not null check(event_kind in
 ('worker_salary','worker_duties','worker_location','worker_hours','worker_absence','worker_termination','worker_other','organisation_change','other')),
 event_date date not null,
 summary text not null check(length(btrim(summary)) between 20 and 500),
 provisional_deadline date,
 deadline_verified_by uuid,
 rule_reference text,
 status text not null default 'draft' check(status in ('draft','review_required','reviewed','closed')),
 created_at timestamptz not null default now(),
 foreign key(employee_id,company_id) references hr.employees(id,company_id) on delete restrict
);
comment on table hr.sponsor_change_events is 'Provisional internal compliance records only. Any deadline is human-reviewed and may have exceptions/bank holidays; never automatically transmitted.';
create index if not exists hr_sponsor_events_company_date on hr.sponsor_change_events(company_id,event_date desc);
revoke all on all tables in schema hr from public,anon,authenticated;
grant all on all tables in schema hr to service_role;
alter table hr.sponsor_licences enable row level security;
alter table hr.sponsor_change_events enable row level security;
create or replace function public.ch_hr_admin_create_sponsor_case_draft(
 p_company_id uuid,p_employee_id uuid,p_occupation_code text,p_job_title text,
 p_visa_expiry date,p_rtw_followup date,p_actor uuid)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare v_id uuid;
begin
 if p_company_id is null or p_employee_id is null or p_actor is null
 or length(coalesce(p_occupation_code,''))>20
 or length(coalesce(p_job_title,''))>120
 or (p_visa_expiry is null and p_rtw_followup is null)
 or not exists(select 1 from hr.employees where id=p_employee_id and company_id=p_company_id and status in ('draft','active','on_leave'))
 then raise exception 'Invalid sponsored-worker review case or employer scope'; end if;
 insert into hr.sponsor_cases(employee_id,company_id,occupation_code,job_title,visa_expiry_date,
  right_to_work_followup_date,compliance_status)
 values(p_employee_id,p_company_id,nullif(btrim(p_occupation_code),''),
  nullif(btrim(p_job_title),''),p_visa_expiry,p_rtw_followup,'review_required')
 returning id into v_id;
 insert into hr.compliance_tasks(company_id,employee_id,task_type,title,due_at,status,guidance_version)
 values(p_company_id,p_employee_id,'sponsor_case_review','Review sponsored-worker case and evidence',
  clock_timestamp(),'open','UKVI Part 3 08/26 — human review');
 if p_visa_expiry is not null then
  insert into hr.compliance_tasks(company_id,employee_id,task_type,title,due_at,status,guidance_version)
  values(p_company_id,p_employee_id,'visa_expiry_review','Review visa expiry and sponsorship conditions',
   (p_visa_expiry-90)::timestamp at time zone 'Europe/London','open','UKVI Part 3 08/26 — date review');
 end if;
 if p_rtw_followup is not null then
  insert into hr.compliance_tasks(company_id,employee_id,task_type,title,due_at,status,guidance_version)
  values(p_company_id,p_employee_id,'right_to_work_followup','Complete required right-to-work follow-up check',
   p_rtw_followup::timestamp at time zone 'Europe/London','open','UKVI Part 3 08/26 — date review');
 end if;
 insert into hr.change_audit(company_id,actor_user_id,resource_type,resource_id,action)
 values(p_company_id,p_actor,'sponsor_case',v_id,'create_review_draft');
 return v_id;
end $fn$;
revoke all on function public.ch_hr_admin_create_sponsor_case_draft(uuid,uuid,text,text,date,date,uuid) from public,anon,authenticated;
grant execute on function public.ch_hr_admin_create_sponsor_case_draft(uuid,uuid,text,text,date,date,uuid) to service_role;
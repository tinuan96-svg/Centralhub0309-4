
-- CentralHub Actual: private, fail-closed HR data foundation.
-- No HR UI, user-facing Data API grants, employee creation or external submissions are enabled.
-- Company IDs reference the existing verified company identity, not a shared shop login.
create schema if not exists hr;
revoke all on schema hr from public, anon, authenticated;
grant usage on schema hr to service_role;

create table if not exists hr.employers (
  company_id uuid primary key references public.store_business_identity(id) on delete restrict,
  setup_status text not null default 'setup' check (setup_status in ('setup','verified')),
  payroll_live_enabled boolean not null default false check (payroll_live_enabled = false),
  ukvi_submission_enabled boolean not null default false check (ukvi_submission_enabled = false),
  hmrc_submission_enabled boolean not null default false check (hmrc_submission_enabled = false),
  salary_payment_enabled boolean not null default false check (salary_payment_enabled = false),
  created_at timestamptz not null default now()
);

create table if not exists hr.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references hr.employers(company_id) on delete restrict,
  employee_number text not null,
  full_name text not null check (length(btrim(full_name)) between 1 and 200),
  date_of_birth date,
  email text,
  phone text,
  job_title text,
  department text,
  employment_location text,
  contract_type text,
  start_date date not null,
  end_date date,
  status text not null default 'draft' check(status in ('draft','active','on_leave','ended')),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_employee_dates_check check(end_date is null or end_date >= start_date),
  constraint hr_employee_number_company_unique unique(company_id,employee_number),
  constraint hr_employee_id_company_unique unique(id,company_id)
);
create index if not exists hr_employees_company_status on hr.employees(company_id,status);

create table if not exists hr.employee_sensitive (
  employee_id uuid primary key,
  company_id uuid not null,
  residential_address jsonb,
  emergency_contact jsonb,
  national_insurance_ciphertext bytea,
  payroll_private_data_ciphertext bytea,
  immigration_private_data_ciphertext bytea,
  created_at timestamptz not null default now(),
  foreign key(employee_id,company_id) references hr.employees(id,company_id) on delete restrict
);
comment on table hr.employee_sensitive is 'Ciphertext fields only: application-managed encryption required before collecting NI, payroll or immigration identifiers. No unencrypted sensitive identifier columns.';

create table if not exists hr.sponsor_cases (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  company_id uuid not null,
  occupation_code text,
  job_title text,
  contracted_hours numeric(7,2) check(contracted_hours >= 0),
  sponsored_salary_gbp numeric(13,2) check(sponsored_salary_gbp >= 0),
  sponsorship_start date,
  sponsorship_end date,
  visa_expiry_date date,
  right_to_work_followup_date date,
  compliance_status text not null default 'review_required'
    check(compliance_status in ('review_required','in_review','recorded','closed')),
  created_at timestamptz not null default now(),
  foreign key(employee_id,company_id) references hr.employees(id,company_id) on delete restrict,
  constraint hr_sponsor_dates check(sponsorship_end is null or sponsorship_start is null or sponsorship_end >= sponsorship_start)
);
create index if not exists hr_sponsor_company_visa on hr.sponsor_cases(company_id,visa_expiry_date);

create table if not exists hr.attendance_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  company_id uuid not null,
  clock_in timestamptz not null,
  clock_out timestamptz,
  unpaid_break_minutes integer not null default 0 check(unpaid_break_minutes >= 0),
  approval_status text not null default 'pending'
    check(approval_status in ('pending','approved','rejected','correction_requested')),
  created_at timestamptz not null default now(),
  foreign key(employee_id,company_id) references hr.employees(id,company_id) on delete restrict,
  constraint hr_attendance_chronology check(clock_out is null or clock_out > clock_in)
);
create index if not exists hr_attendance_employee_time on hr.attendance_entries(company_id,employee_id,clock_in desc);

create table if not exists hr.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  company_id uuid not null,
  leave_type text not null check(leave_type in ('annual','sick','unpaid','maternity','paternity','adoption','parental','other')),
  starts_on date not null,
  ends_on date not null,
  approval_status text not null default 'pending'
    check(approval_status in ('pending','approved','rejected','cancelled')),
  created_at timestamptz not null default now(),
  foreign key(employee_id,company_id) references hr.employees(id,company_id) on delete restrict,
  constraint hr_leave_dates check(ends_on >= starts_on)
);
create index if not exists hr_leave_company_period on hr.leave_requests(company_id,starts_on,ends_on);

create table if not exists hr.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references hr.employers(company_id) on delete restrict,
  period_start date not null,
  period_end date not null,
  pay_date date,
  pay_frequency text not null check(pay_frequency in ('weekly','fortnightly','four_weekly','monthly')),
  tax_year text not null,
  calculation_version text,
  status text not null default 'draft' check(status in ('draft','review_pending')),
  created_at timestamptz not null default now(),
  constraint hr_payroll_dates check(period_end >= period_start)
);
create index if not exists hr_payroll_company_period on hr.payroll_runs(company_id,period_end desc);

create table if not exists hr.change_audit (
  id bigint generated always as identity primary key,
  company_id uuid not null references hr.employers(company_id) on delete restrict,
  actor_user_id uuid,
  resource_type text not null,
  resource_id uuid not null,
  action text not null,
  occurred_at timestamptz not null default now(),
  request_id text,
  note text
);
comment on table hr.change_audit is 'Write-only audit metadata. Do not copy names, NI numbers, bank details, salaries, immigration documents, or raw record bodies into this table.';
create index if not exists hr_audit_company_time on hr.change_audit(company_id,occurred_at desc);

-- A separate private schema and zero anon/authenticated grants are intentional;
-- privileged application endpoints must independently enforce live auth and company scope.
revoke all on all tables in schema hr from public, anon, authenticated;
grant all on all tables in schema hr to service_role;
grant usage, select on all sequences in schema hr to service_role;
alter table hr.employers enable row level security;
alter table hr.employees enable row level security;
alter table hr.employee_sensitive enable row level security;
alter table hr.sponsor_cases enable row level security;
alter table hr.attendance_entries enable row level security;
alter table hr.leave_requests enable row level security;
alter table hr.payroll_runs enable row level security;
alter table hr.change_audit enable row level security;

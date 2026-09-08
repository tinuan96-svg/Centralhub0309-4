-- CentralHub Financial Planning & Growth Centre
-- Recommendation-first portfolio planning with explicit admin approval.

create table if not exists public.financial_plan_projects (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete set null,
  title text not null check (length(trim(title)) between 3 and 160),
  description text,
  category text not null default 'development' check (category in ('expansion','development','technology','marketing','operations','property','product','compliance','other')),
  status text not null default 'idea' check (status in ('idea','planned','approved','funded','in_progress','on_hold','completed','cancelled')),
  funding_source text not null default 'unassigned' check (funding_source in ('unassigned','operating_cash','growth_reserve','external_finance','mixed')),
  reserve_type_id uuid references public.finance_reserve_types(id) on delete set null,
  estimated_cost numeric(15,2) not null default 0 check (estimated_cost >= 0),
  committed_cost numeric(15,2) not null default 0 check (committed_cost >= 0),
  actual_cost numeric(15,2) not null default 0 check (actual_cost >= 0),
  expected_monthly_revenue numeric(15,2) not null default 0 check (expected_monthly_revenue >= 0),
  expected_monthly_savings numeric(15,2) not null default 0 check (expected_monthly_savings >= 0),
  expected_growth_pct numeric(8,2) not null default 0,
  strategic_impact smallint not null default 3 check (strategic_impact between 1 and 5),
  risk_level smallint not null default 3 check (risk_level between 1 and 5),
  target_start_date date,
  target_end_date date,
  approved_at timestamptz,
  completed_at timestamptz,
  priority_score numeric(6,2) not null default 0 check (priority_score between 0 and 100),
  ai_recommendation text,
  ai_rationale text,
  ai_confidence numeric(5,4) check (ai_confidence between 0 and 1),
  ai_risk_flags jsonb not null default '[]'::jsonb,
  ai_assumptions jsonb not null default '[]'::jsonb,
  ai_analyzed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_end_date is null or target_start_date is null or target_end_date >= target_start_date)
);

create table if not exists public.financial_plan_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.financial_plan_projects(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 160),
  description text,
  status text not null default 'not_started' check (status in ('not_started','in_progress','blocked','completed','cancelled')),
  planned_cost numeric(15,2) not null default 0 check (planned_cost >= 0),
  actual_cost numeric(15,2) not null default 0 check (actual_cost >= 0),
  start_date date,
  due_date date,
  progress smallint not null default 0 check (progress between 0 and 100),
  sort_order integer not null default 0,
  completed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or start_date is null or due_date >= start_date)
);

create table if not exists public.financial_plan_ai_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.financial_plan_projects(id) on delete cascade,
  analysis_type text not null check (analysis_type in ('project','portfolio','scenario')),
  input_snapshot jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  model text,
  status text not null default 'completed' check (status in ('completed','failed')),
  error_message text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_financial_plan_projects_status on public.financial_plan_projects(status);
create index if not exists idx_financial_plan_projects_start on public.financial_plan_projects(target_start_date);
create index if not exists idx_financial_plan_projects_store on public.financial_plan_projects(store_id);
create index if not exists idx_financial_plan_milestones_project on public.financial_plan_milestones(project_id, sort_order);

create or replace function public.refresh_financial_plan_project_score()
returns trigger language plpgsql set search_path = public as $$
declare
  annual_benefit numeric := (coalesce(new.expected_monthly_revenue,0) + coalesce(new.expected_monthly_savings,0)) * 12;
  return_score numeric;
  timing_score numeric;
begin
  return_score := case when new.estimated_cost <= 0 then 0 else least(40, (annual_benefit / new.estimated_cost) * 20) end;
  timing_score := case
    when new.target_start_date is null then 5
    when new.target_start_date <= current_date + 30 then 15
    when new.target_start_date <= current_date + 90 then 10
    else 5 end;
  new.priority_score := greatest(0, least(100,
    return_score + timing_score + (new.strategic_impact * 8) - ((new.risk_level - 1) * 4)
  ));
  new.updated_at := now();
  if new.status = 'approved' and new.approved_at is null then new.approved_at := now(); end if;
  if new.status = 'completed' and new.completed_at is null then new.completed_at := now(); end if;
  return new;
end; $$;

drop trigger if exists trg_financial_plan_project_score on public.financial_plan_projects;
create trigger trg_financial_plan_project_score before insert or update on public.financial_plan_projects
for each row execute function public.refresh_financial_plan_project_score();

create or replace function public.touch_financial_plan_milestone()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'completed' then new.progress := 100; new.completed_at := coalesce(new.completed_at, now()); end if;
  return new;
end; $$;

drop trigger if exists trg_touch_financial_plan_milestone on public.financial_plan_milestones;
create trigger trg_touch_financial_plan_milestone before update on public.financial_plan_milestones
for each row execute function public.touch_financial_plan_milestone();

alter table public.financial_plan_projects enable row level security;
alter table public.financial_plan_milestones enable row level security;
alter table public.financial_plan_ai_runs enable row level security;

drop policy if exists "Admin manages financial plan projects" on public.financial_plan_projects;
create policy "Admin manages financial plan projects" on public.financial_plan_projects
for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "Admin manages financial plan milestones" on public.financial_plan_milestones;
create policy "Admin manages financial plan milestones" on public.financial_plan_milestones
for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "Admin views financial plan AI runs" on public.financial_plan_ai_runs;
create policy "Admin views financial plan AI runs" on public.financial_plan_ai_runs
for select to authenticated using ((select public.is_admin()));
drop policy if exists "Admin creates financial plan AI runs" on public.financial_plan_ai_runs;
create policy "Admin creates financial plan AI runs" on public.financial_plan_ai_runs
for insert to authenticated with check ((select public.is_admin()));

grant select, insert, update, delete on public.financial_plan_projects to authenticated;
grant select, insert, update, delete on public.financial_plan_milestones to authenticated;
grant select, insert on public.financial_plan_ai_runs to authenticated;

create or replace view public.v_financial_planning_baseline with (security_invoker = true) as
with paid_orders as (
  select * from public.orders
  where coalesce(is_deleted,false)=false
    and lower(coalesce(payment_status,'')) in ('paid','completed','settled','succeeded','success')
    and created_at >= now() - interval '30 days'
), tx as (
  select count(*)::numeric total,
         count(*) filter (where coalesce(is_reconciled,false) or reconciliation_status in ('reconciled','matched'))::numeric reconciled
  from public.bank_transactions
), portfolio as (
  select coalesce(sum(estimated_cost) filter (where status not in ('completed','cancelled')),0) planned_cost,
         coalesce(sum(greatest(estimated_cost-actual_cost,0)) filter (where status in ('approved','funded','in_progress')),0) committed_need,
         coalesce(sum(expected_monthly_revenue + expected_monthly_savings) filter (where status not in ('cancelled','completed')),0) monthly_uplift
  from public.financial_plan_projects
)
select
  coalesce((select sum(current_balance) from public.store_bank_accounts where is_active),0)::numeric(15,2) as bank_balance,
  coalesce((select sum(available_amount) from public.v_finance_reserve_position),0)::numeric(15,2) as reserve_available,
  coalesce((select sum(total) from paid_orders),0)::numeric(15,2) as revenue_last_30_days,
  coalesce((select sum(order_profit) from paid_orders where order_profit is not null),0)::numeric(15,2) as recorded_profit_last_30_days,
  coalesce((select count(*) from paid_orders),0)::bigint as paid_orders_last_30_days,
  coalesce((select count(*) from paid_orders where order_profit is not null),0)::bigint as costed_orders_last_30_days,
  coalesce((select total from tx),0)::bigint as bank_transactions,
  coalesce((select reconciled from tx),0)::bigint as reconciled_transactions,
  case when coalesce((select total from tx),0)=0 then 0 else round(((select reconciled from tx)/(select total from tx))*100,1) end as reconciliation_pct,
  coalesce((select planned_cost from portfolio),0)::numeric(15,2) as planned_project_cost,
  coalesce((select committed_need from portfolio),0)::numeric(15,2) as approved_funding_need,
  coalesce((select monthly_uplift from portfolio),0)::numeric(15,2) as expected_monthly_uplift,
  least(100, round(
    (case when coalesce((select total from tx),0)=0 then 0 else ((select reconciled from tx)/(select total from tx))*60 end) +
    (case when coalesce((select count(*) from paid_orders),0)=0 then 0 else ((select count(*) from paid_orders where order_profit is not null)::numeric/(select count(*) from paid_orders))*40 end)
  ,1)) as data_confidence_pct;

grant select on public.v_financial_planning_baseline to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.financial_plan_projects;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.financial_plan_milestones;
exception when duplicate_object then null; end $$;

comment on table public.financial_plan_projects is 'Admin-approved expansion and development portfolio; AI recommendations never execute spending.';
comment on view public.v_financial_planning_baseline is 'Live planning baseline with explicit finance-data confidence indicators.';

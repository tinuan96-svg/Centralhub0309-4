create table if not exists public.shruthi_learning_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'scheduled',
  track text not null,
  query text,
  model text,
  status text not null default 'running' check (status in ('running','completed','partial','failed')),
  summary text,
  findings_count integer not null default 0,
  sources_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.shruthi_learning_insights (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.shruthi_learning_runs(id) on delete set null,
  track text not null,
  title text not null,
  summary text not null,
  why_it_matters text,
  recommended_action text,
  confidence numeric(4,3) not null default 0.700 check (confidence between 0 and 1),
  impact text not null default 'medium' check (impact in ('low','medium','high','critical')),
  source_urls jsonb not null default '[]'::jsonb,
  source_domains text[] not null default '{}'::text[],
  tags text[] not null default '{}'::text[],
  status text not null default 'new' check (status in ('new','reviewed','adopted','dismissed','expired')),
  fingerprint text not null unique,
  learned_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shruthi_learning_state (
  id text primary key default 'primary',
  enabled boolean not null default true,
  cadence_hours integer not null default 6 check (cadence_hours between 1 and 168),
  mode text not null default 'continuous_research' check (mode in ('continuous_research','daily_digest','paused')),
  current_track text,
  last_run_at timestamptz,
  next_run_at timestamptz,
  latest_summary text,
  total_runs integer not null default 0,
  total_insights integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.shruthi_learning_state(id,enabled,cadence_hours,mode,next_run_at)
values('primary',true,6,'continuous_research',now())
on conflict (id) do update set enabled=true,cadence_hours=6,mode='continuous_research',updated_at=now();

alter table public.shruthi_learning_runs enable row level security;
alter table public.shruthi_learning_insights enable row level security;
alter table public.shruthi_learning_state enable row level security;
revoke all on public.shruthi_learning_runs from anon, authenticated;
revoke all on public.shruthi_learning_insights from anon, authenticated;
revoke all on public.shruthi_learning_state from anon, authenticated;
grant select on public.shruthi_learning_runs to authenticated;
grant select, update on public.shruthi_learning_insights to authenticated;
grant select, update on public.shruthi_learning_state to authenticated;

drop policy if exists shruthi_learning_runs_admin_read on public.shruthi_learning_runs;
create policy shruthi_learning_runs_admin_read on public.shruthi_learning_runs for select to authenticated using (public.is_admin());
drop policy if exists shruthi_learning_insights_admin_read on public.shruthi_learning_insights;
create policy shruthi_learning_insights_admin_read on public.shruthi_learning_insights for select to authenticated using (public.is_admin());
drop policy if exists shruthi_learning_insights_admin_update on public.shruthi_learning_insights;
create policy shruthi_learning_insights_admin_update on public.shruthi_learning_insights for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists shruthi_learning_state_admin_read on public.shruthi_learning_state;
create policy shruthi_learning_state_admin_read on public.shruthi_learning_state for select to authenticated using (public.is_admin());
drop policy if exists shruthi_learning_state_admin_update on public.shruthi_learning_state;
create policy shruthi_learning_state_admin_update on public.shruthi_learning_state for update to authenticated using (public.is_admin()) with check (public.is_admin());

create index if not exists shruthi_learning_runs_started_idx on public.shruthi_learning_runs(started_at desc);
create index if not exists shruthi_learning_insights_learned_idx on public.shruthi_learning_insights(learned_at desc);
create index if not exists shruthi_learning_insights_status_idx on public.shruthi_learning_insights(status, impact, confidence desc);
create index if not exists shruthi_learning_insights_track_idx on public.shruthi_learning_insights(track, learned_at desc);

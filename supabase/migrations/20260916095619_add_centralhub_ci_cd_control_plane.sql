create table if not exists public.ci_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  repository_full_name text not null,
  default_branch text not null default 'main',
  workflow_file text not null,
  platform text not null default 'android' check (platform in ('android','ios','web','multi')),
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ci_builds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ci_projects(id) on delete cascade,
  external_run_id bigint unique,
  external_run_number bigint,
  external_run_attempt integer,
  workflow_name text,
  workflow_file text not null,
  branch text not null default 'main',
  commit_sha text,
  trigger_type text not null default 'manual' check (trigger_type in ('manual','push','pull_request','tag','schedule','api','assistant')),
  status text not null default 'queued' check (status in ('queued','requested','waiting','pending','in_progress','completed','success','failure','cancelled','timed_out','action_required','neutral','skipped','stale')),
  conclusion text,
  run_url text,
  version_name text,
  version_code text,
  requested_by uuid null references auth.users(id) on delete set null,
  dispatch_requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds integer,
  last_synced_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ci_build_steps (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.ci_builds(id) on delete cascade,
  external_job_id bigint,
  external_step_number integer,
  job_name text,
  name text not null,
  status text not null default 'queued',
  conclusion text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds integer,
  log_excerpt text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (build_id, external_job_id, external_step_number)
);

create table if not exists public.ci_artifacts (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.ci_builds(id) on delete cascade,
  external_artifact_id bigint,
  name text not null,
  file_name text,
  platform text,
  kind text,
  size_bytes bigint,
  sha256 text,
  external_url text,
  expires_at timestamptz,
  app_release_id uuid null references public.app_releases(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (build_id, external_artifact_id)
);

create index if not exists ci_builds_project_created_idx on public.ci_builds(project_id, created_at desc);
create index if not exists ci_builds_status_idx on public.ci_builds(status, created_at desc);
create index if not exists ci_build_steps_build_idx on public.ci_build_steps(build_id, external_job_id, external_step_number);
create index if not exists ci_artifacts_build_idx on public.ci_artifacts(build_id, created_at desc);

alter table public.ci_projects enable row level security;
alter table public.ci_builds enable row level security;
alter table public.ci_build_steps enable row level security;
alter table public.ci_artifacts enable row level security;

drop policy if exists centralhub_admin_only on public.ci_projects;
create policy centralhub_admin_only on public.ci_projects for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists centralhub_admin_only on public.ci_builds;
create policy centralhub_admin_only on public.ci_builds for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists centralhub_admin_only on public.ci_build_steps;
create policy centralhub_admin_only on public.ci_build_steps for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists centralhub_admin_only on public.ci_artifacts;
create policy centralhub_admin_only on public.ci_artifacts for all to authenticated using (is_admin()) with check (is_admin());

drop trigger if exists ci_projects_set_updated_at on public.ci_projects;
create trigger ci_projects_set_updated_at before update on public.ci_projects for each row execute function public.update_updated_at_column();
drop trigger if exists ci_builds_set_updated_at on public.ci_builds;
create trigger ci_builds_set_updated_at before update on public.ci_builds for each row execute function public.update_updated_at_column();
drop trigger if exists ci_build_steps_set_updated_at on public.ci_build_steps;
create trigger ci_build_steps_set_updated_at before update on public.ci_build_steps for each row execute function public.update_updated_at_column();
drop trigger if exists ci_artifacts_set_updated_at on public.ci_artifacts;
create trigger ci_artifacts_set_updated_at before update on public.ci_artifacts for each row execute function public.update_updated_at_column();

insert into public.ci_projects (name, slug, repository_full_name, default_branch, workflow_file, platform, metadata)
values ('CentralHub Android', 'centralhub-android', 'tinuan96-svg/Centralhub0309-4', 'main', 'build-centralhub-apk.yml', 'android', jsonb_build_object('release_manager_route', '/marketing/apps/releases', 'live_shell_url', 'https://centralhub.network', 'native_only_builds', true))
on conflict (slug) do update set name = excluded.name, repository_full_name = excluded.repository_full_name, default_branch = excluded.default_branch, workflow_file = excluded.workflow_file, platform = excluded.platform, metadata = public.ci_projects.metadata || excluded.metadata, enabled = true, updated_at = now();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ci_builds') then alter publication supabase_realtime add table public.ci_builds; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ci_build_steps') then alter publication supabase_realtime add table public.ci_build_steps; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ci_artifacts') then alter publication supabase_realtime add table public.ci_artifacts; end if;
end $$;

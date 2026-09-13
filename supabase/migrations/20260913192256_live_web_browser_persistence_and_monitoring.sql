create table if not exists public.live_web_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, url)
);

create table if not exists public.live_web_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  url text not null,
  source text not null default 'live_web',
  visited_at timestamptz not null default now()
);

create index if not exists live_web_history_user_visited_idx on public.live_web_history(user_id, visited_at desc);

create table if not exists public.live_web_monitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default '',
  url text not null,
  enabled boolean not null default true,
  interval_minutes integer not null default 15 check (interval_minutes in (15,30,60,180,360,720,1440)),
  last_checked_at timestamptz,
  next_check_at timestamptz not null default now(),
  last_status_code integer,
  last_title text,
  last_hash text,
  last_text_excerpt text,
  last_prices jsonb not null default '[]'::jsonb,
  last_pack_sizes jsonb not null default '[]'::jsonb,
  last_changed_at timestamptz,
  last_summary text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, url)
);

create index if not exists live_web_monitors_due_idx on public.live_web_monitors(enabled, next_check_at);

create table if not exists public.live_web_monitor_events (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.live_web_monitors(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  detected_at timestamptz not null default now(),
  change_type text not null default 'content',
  severity text not null default 'info',
  summary text not null,
  old_hash text,
  new_hash text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists live_web_monitor_events_monitor_detected_idx on public.live_web_monitor_events(monitor_id, detected_at desc);

alter table public.live_web_bookmarks enable row level security;
alter table public.live_web_history enable row level security;
alter table public.live_web_monitors enable row level security;
alter table public.live_web_monitor_events enable row level security;

do $$ begin
  create policy live_web_bookmarks_owner on public.live_web_bookmarks for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy live_web_history_owner on public.live_web_history for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy live_web_monitors_owner on public.live_web_monitors for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy live_web_monitor_events_owner on public.live_web_monitor_events for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

grant select, insert, update, delete on public.live_web_bookmarks to authenticated;
grant select, insert, update, delete on public.live_web_history to authenticated;
grant select, insert, update, delete on public.live_web_monitors to authenticated;
grant select, insert, update, delete on public.live_web_monitor_events to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.live_web_bookmarks;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.live_web_history;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.live_web_monitors;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.live_web_monitor_events;
exception when duplicate_object then null; end $$;

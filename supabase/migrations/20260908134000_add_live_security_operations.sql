create table if not exists public.security_heartbeats (
  store_id uuid not null references public.stores(id) on delete cascade,
  source text not null,
  status text not null check (status in ('online','degraded','offline','unknown')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  http_status integer,
  tls_valid boolean,
  security_headers jsonb not null default '{}'::jsonb,
  security_score integer not null default 0 check (security_score between 0 and 100),
  detail text,
  checked_at timestamptz not null default now(),
  primary key (store_id, source)
);

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  source text not null,
  event_type text not null,
  severity text not null check (severity in ('info','low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','acknowledged','resolved','ignored')),
  title text not null,
  details jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  occurred_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists security_events_store_time_idx on public.security_events(store_id, occurred_at desc);
create index if not exists security_events_open_idx on public.security_events(severity, occurred_at desc) where status in ('open','acknowledged');
create index if not exists security_events_fingerprint_idx on public.security_events(fingerprint, last_seen_at desc);

alter table public.security_heartbeats enable row level security;
alter table public.security_events enable row level security;
revoke all on public.security_heartbeats, public.security_events from anon;
revoke all on public.security_heartbeats, public.security_events from authenticated;
grant select on public.security_heartbeats, public.security_events to authenticated;
grant update (status, resolved_at) on public.security_events to authenticated;

drop policy if exists centralhub_admin_read_security_heartbeats on public.security_heartbeats;
create policy centralhub_admin_read_security_heartbeats on public.security_heartbeats for select to authenticated using ((select public.is_admin()));
drop policy if exists centralhub_admin_read_security_events on public.security_events;
create policy centralhub_admin_read_security_events on public.security_events for select to authenticated using ((select public.is_admin()));
drop policy if exists centralhub_admin_update_security_events on public.security_events;
create policy centralhub_admin_update_security_events on public.security_events for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

do $$ begin alter publication supabase_realtime add table public.security_heartbeats; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.security_events; exception when duplicate_object then null; end $$;

comment on table public.security_heartbeats is 'Latest independently verified runtime security and availability signal for each store.';
comment on table public.security_events is 'Append-only security telemetry; client users may only acknowledge or resolve events.';

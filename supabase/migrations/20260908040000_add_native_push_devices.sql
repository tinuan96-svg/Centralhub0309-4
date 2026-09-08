create table if not exists public.native_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android',
  app_id text not null default 'com.centralhub.network',
  device_name text,
  is_enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists native_push_devices_user_id_idx
  on public.native_push_devices (user_id);

alter table public.native_push_devices enable row level security;

drop policy if exists native_push_devices_select_own on public.native_push_devices;
drop policy if exists native_push_devices_insert_own on public.native_push_devices;
drop policy if exists native_push_devices_update_own on public.native_push_devices;
drop policy if exists native_push_devices_delete_own on public.native_push_devices;

create policy native_push_devices_select_own
  on public.native_push_devices for select
  to authenticated
  using (auth.uid() = user_id);

create policy native_push_devices_insert_own
  on public.native_push_devices for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy native_push_devices_update_own
  on public.native_push_devices for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy native_push_devices_delete_own
  on public.native_push_devices for delete
  to authenticated
  using (auth.uid() = user_id);

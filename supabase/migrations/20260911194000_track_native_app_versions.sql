alter table public.native_push_devices
  add column if not exists app_version_name text,
  add column if not exists app_version_code bigint,
  add column if not exists app_version_reported_at timestamptz;

create index if not exists idx_native_push_devices_app_version_code
  on public.native_push_devices (app_version_code);

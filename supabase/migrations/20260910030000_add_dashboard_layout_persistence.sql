create table if not exists public.dashboard_layouts (
  scope text primary key,
  version integer not null default 2,
  layout jsonb not null default '{}'::jsonb,
  previous_layout jsonb,
  updated_at timestamptz not null default now()
);

alter table public.dashboard_layouts enable row level security;

grant select, insert, update, delete on public.dashboard_layouts to authenticated;

create policy "Admins can manage dashboard layouts"
on public.dashboard_layouts
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

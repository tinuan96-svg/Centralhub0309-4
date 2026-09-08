create table if not exists public.mollie_webhook_events (
  id uuid primary key default gen_random_uuid(),
  store_slug text not null default 'malluspices',
  mollie_payment_id text not null,
  payment_status text,
  processed boolean not null default false,
  raw_body jsonb not null default '{}'::jsonb,
  error_message text,
  source text not null default 'malluspices:mollie-webhook',
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mollie_webhook_events enable row level security;

drop policy if exists "Admin can read Mollie webhook audit" on public.mollie_webhook_events;
create policy "Admin can read Mollie webhook audit"
  on public.mollie_webhook_events
  for select
  to authenticated
  using (public.is_admin());

create index if not exists idx_mollie_webhook_events_received_at
  on public.mollie_webhook_events(received_at desc);
create index if not exists idx_mollie_webhook_events_store_status
  on public.mollie_webhook_events(store_slug, processed, received_at desc);
create index if not exists idx_mollie_webhook_events_payment_id
  on public.mollie_webhook_events(mollie_payment_id);

grant select on public.mollie_webhook_events to authenticated;
grant all on public.mollie_webhook_events to service_role;

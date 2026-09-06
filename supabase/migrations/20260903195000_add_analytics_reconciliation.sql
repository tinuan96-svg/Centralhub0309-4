create table if not exists public.analytics_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  reconciliation_date date not null,
  ga4_users bigint not null default 0,
  mirror_users bigint not null default 0,
  ga4_sessions bigint not null default 0,
  mirror_sessions bigint not null default 0,
  ga4_page_views bigint not null default 0,
  mirror_page_views bigint not null default 0,
  ga4_product_views bigint not null default 0,
  mirror_product_views bigint not null default 0,
  ga4_add_to_carts bigint not null default 0,
  mirror_add_to_carts bigint not null default 0,
  ga4_checkouts bigint not null default 0,
  mirror_checkouts bigint not null default 0,
  ga4_purchases bigint not null default 0,
  mirror_purchases bigint not null default 0,
  ga4_revenue numeric not null default 0,
  mirror_revenue numeric not null default 0,
  max_variance_percent numeric not null default 0,
  status text not null default 'matched' check (status in ('matched','warning','critical','unavailable')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, reconciliation_date)
);

create index if not exists analytics_reconciliation_runs_store_date_idx
  on public.analytics_reconciliation_runs(store_id, reconciliation_date desc);

alter table public.analytics_reconciliation_runs enable row level security;

drop policy if exists "Admins can read analytics reconciliation" on public.analytics_reconciliation_runs;
create policy "Admins can read analytics reconciliation"
  on public.analytics_reconciliation_runs for select
  to authenticated
  using (public.is_admin());

comment on table public.analytics_reconciliation_runs is
  'Daily GA4 versus CentralHub analytics mirror reconciliation results. Written by the protected reconciliation Edge Function.';

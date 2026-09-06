create table if not exists public.marketing_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  provider_id text not null references public.marketing_providers(id) on delete restrict,
  redirect_uri text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists marketing_oauth_states_expires_idx on public.marketing_oauth_states (expires_at);
create index if not exists marketing_oauth_states_store_provider_idx on public.marketing_oauth_states (store_id, provider_id);

alter table public.marketing_oauth_states enable row level security;

create policy marketing_oauth_states_admin_select on public.marketing_oauth_states
for select to authenticated using (public.is_admin());

create policy marketing_oauth_states_admin_insert on public.marketing_oauth_states
for insert to authenticated with check (public.is_admin());

create policy marketing_oauth_states_admin_update on public.marketing_oauth_states
for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy marketing_oauth_states_admin_delete on public.marketing_oauth_states
for delete to authenticated using (public.is_admin());

comment on table public.marketing_oauth_states is 'One-time CSRF state records for store-scoped marketing provider OAuth flows. State values are stored hashed.';

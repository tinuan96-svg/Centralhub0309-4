-- Issue #4: deny-by-default staff RBAC storage only.
-- This migration does NOT grant any staff access to existing business tables or APIs.
-- Apply only after reviewing the existing admin policies and running rollback tests.
create table if not exists public.ch_staff_roles (
  role_key text primary key check (role_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  label text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.ch_staff_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_key text not null references public.ch_staff_roles(role_key),
  full_name text not null default '',
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  all_stores boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.ch_staff_permissions (
  role_key text not null references public.ch_staff_roles(role_key) on delete cascade,
  permission_key text not null check (permission_key ~ '^[a-z][a-z0-9_.]{2,127}$'),
  primary key (role_key,permission_key)
);
create table if not exists public.ch_staff_permission_overrides (
  user_id uuid not null references public.ch_staff_accounts(user_id) on delete cascade,
  permission_key text not null check (permission_key ~ '^[a-z][a-z0-9_.]{2,127}$'),
  allowed boolean not null,
  primary key(user_id,permission_key)
);
create table if not exists public.ch_staff_store_access (
  user_id uuid not null references public.ch_staff_accounts(user_id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  primary key(user_id,store_id)
);
create table if not exists public.ch_staff_access_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ch_staff_access_audit_user_idx on public.ch_staff_access_audit(target_user_id,created_at desc);
-- Intentionally no client grants or RLS policies. All changes must go through
-- a verified, privileged server-side user-management endpoint.
alter table public.ch_staff_roles enable row level security;
alter table public.ch_staff_accounts enable row level security;
alter table public.ch_staff_permissions enable row level security;
alter table public.ch_staff_permission_overrides enable row level security;
alter table public.ch_staff_store_access enable row level security;
alter table public.ch_staff_access_audit enable row level security;
revoke all on table public.ch_staff_roles, public.ch_staff_accounts,
  public.ch_staff_permissions,public.ch_staff_permission_overrides,
  public.ch_staff_store_access,public.ch_staff_access_audit from anon,authenticated;
revoke all on sequence public.ch_staff_access_audit_id_seq from anon,authenticated;
insert into public.ch_staff_roles(role_key,label,is_system) values
('accountant','Accountant',true),
('customer_care_manager','Customer Care Manager',true),
('billing_staff','Billing Staff',true),
('store_manager','Store Manager',true),
('warehouse_staff','Warehouse / Picking',true),
('marketing_staff','Marketing Staff',true),
('custom','Custom',true)
on conflict (role_key) do nothing;
-- Intentionally no permission grants: nothing becomes accessible until every
-- underlying API/RPC/table/storage endpoint has been mapped and secured.


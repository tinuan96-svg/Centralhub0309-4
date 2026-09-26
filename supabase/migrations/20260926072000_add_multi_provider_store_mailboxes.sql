create table if not exists public.store_email_mailboxes (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete cascade,
 provider text not null check (provider in ('gmail','microsoft','yahoo','imap')), email_address text, display_name text, connection_id uuid,
 enabled boolean not null default true, read_only boolean not null default true check (read_only = true),
 connection_status text not null default 'setup' check (connection_status in ('setup','ready','connected','warning','disabled')),
 scope_granted boolean not null default false, initial_backfill_complete boolean not null default false, sync_cursor text,
 last_scan_at timestamptz,last_success_at timestamptz,last_error text,scan_stats jsonb not null default '{}'::jsonb,
 provider_config jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.store_email_mailboxes enable row level security;
revoke all on table public.store_email_mailboxes from anon, authenticated;
create index if not exists store_email_mailboxes_store_idx on public.store_email_mailboxes(store_id);
create unique index if not exists store_email_mailboxes_provider_address_uidx on public.store_email_mailboxes(store_id,provider,lower(email_address)) where email_address is not null;
insert into public.store_email_mailboxes(store_id,provider,email_address,connection_id,enabled,read_only,connection_status,scope_granted,initial_backfill_complete,sync_cursor,last_scan_at,last_success_at,last_error,scan_stats,provider_config)
select s.store_id,'gmail',nullif(s.scan_stats->>'mailbox',''),s.connection_id,s.gmail_enabled,true,
case when s.gmail_scope_granted and s.last_error is not null then 'warning' when s.gmail_scope_granted then 'connected' when s.connection_id is not null then 'ready' else 'setup' end,
s.gmail_scope_granted,s.initial_backfill_complete,s.last_history_id,s.last_scan_at,s.last_success_at,s.last_error,s.scan_stats,jsonb_build_object('legacy_settings_migrated',true)
from public.store_google_finance_settings s where s.connection_id is not null or s.gmail_enabled or s.gmail_scope_granted on conflict do nothing;
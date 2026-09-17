create table if not exists public.app_publisher_accounts (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null check (provider_id in ('google_play','app_store_connect')),
  account_key text not null,
  display_name text not null,
  account_scope text not null default 'business' check (account_scope in ('business','personal')),
  status text not null default 'not_configured',
  public_config jsonb not null default '{}'::jsonb,
  encrypted_secrets jsonb not null default '{}'::jsonb,
  last_test_at timestamptz,
  last_test_status text,
  last_test_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_id, account_key)
);

create table if not exists public.app_publisher_account_links (
  id uuid primary key default gen_random_uuid(),
  publisher_account_id uuid not null references public.app_publisher_accounts(id) on delete cascade,
  app_id uuid not null references public.app_marketing_apps(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(publisher_account_id, app_id)
);

create unique index if not exists app_publisher_one_enabled_provider_per_app on public.app_publisher_account_links(app_id) where enabled;
alter table public.app_publisher_accounts enable row level security;
alter table public.app_publisher_account_links enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='app_publisher_accounts' and policyname='Admins manage publisher accounts') then
    create policy "Admins manage publisher accounts" on public.app_publisher_accounts for all using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='app_publisher_account_links' and policyname='Admins manage publisher links') then
    create policy "Admins manage publisher links" on public.app_publisher_account_links for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

grant select, insert, update, delete on public.app_publisher_accounts to authenticated;
grant select, insert, update, delete on public.app_publisher_account_links to authenticated;

insert into public.app_publisher_accounts(provider_id,account_key,display_name,account_scope,status,metadata)
values
 ('google_play','business_apps','Business Apps - Google Play','business','not_configured',jsonb_build_object('shared_across_business_apps',true,'centralhub_personal_excluded',true)),
 ('app_store_connect','business_apps','Business Apps - App Store Connect','business','not_configured',jsonb_build_object('shared_across_business_apps',true,'centralhub_personal_excluded',true))
on conflict (provider_id,account_key) do nothing;

insert into public.app_publisher_account_links(publisher_account_id,app_id,enabled)
select pa.id,a.id,true
from public.app_publisher_accounts pa
join public.app_marketing_apps a on a.platform = case when pa.provider_id='google_play' then 'android' else 'ios' end
join public.stores s on s.id=a.store_id
where pa.account_key='business_apps'
  and lower(coalesce(s.slug,'')) in ('malluspices','keralagrocery','pocketgrocery','tamilretail')
  and not exists (select 1 from public.app_publisher_account_links l where l.publisher_account_id=pa.id and l.app_id=a.id);

create or replace function public.sync_shared_publisher_account(p_account_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_account public.app_publisher_accounts%rowtype; r record; v_public jsonb; v_status text;
begin
  select * into v_account from public.app_publisher_accounts where id=p_account_id;
  if not found then return; end if;
  v_status := case when v_account.status in ('configured','invalid','disabled') then v_account.status else 'disabled' end;
  for r in select l.app_id,a.store_id,a.platform,a.package_identifier,a.external_app_id,a.display_name from public.app_publisher_account_links l join public.app_marketing_apps a on a.id=l.app_id where l.publisher_account_id=p_account_id and l.enabled=true loop
    if v_account.provider_id='google_play' and r.platform='android' then
      v_public := coalesce(v_account.public_config,'{}'::jsonb) || jsonb_build_object('package_name',r.package_identifier,'shared_publisher_account_id',v_account.id,'shared_publisher_account_name',v_account.display_name);
    elsif v_account.provider_id='app_store_connect' and r.platform='ios' then
      v_public := coalesce(v_account.public_config,'{}'::jsonb) || jsonb_build_object('bundle_id',r.package_identifier,'app_id',coalesce(r.external_app_id,''),'shared_publisher_account_id',v_account.id,'shared_publisher_account_name',v_account.display_name);
    else continue; end if;
    insert into public.marketing_provider_configs(store_id,provider_id,status,public_config,encrypted_secrets,last_test_at,last_test_status,last_test_error,metadata,app_label,updated_at)
    values(r.store_id,v_account.provider_id,v_status,v_public,coalesce(v_account.encrypted_secrets,'{}'::jsonb),v_account.last_test_at,v_account.last_test_status,v_account.last_test_error,jsonb_build_object('credential_scope','shared_business_publisher','publisher_account_id',v_account.id,'app_id',r.app_id,'centralhub_personal_excluded',true),v_account.display_name || ' · ' || coalesce(r.display_name,r.package_identifier),now())
    on conflict (store_id,provider_id) do update set status=excluded.status,public_config=excluded.public_config,encrypted_secrets=excluded.encrypted_secrets,last_test_at=excluded.last_test_at,last_test_status=excluded.last_test_status,last_test_error=excluded.last_test_error,metadata=coalesce(public.marketing_provider_configs.metadata,'{}'::jsonb)||excluded.metadata,app_label=excluded.app_label,updated_at=now();
  end loop;
end $$;

create or replace function public.trg_sync_shared_publisher_account() returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.sync_shared_publisher_account(new.id); return new; end $$;
drop trigger if exists sync_shared_publisher_account_after_change on public.app_publisher_accounts;
create trigger sync_shared_publisher_account_after_change after insert or update on public.app_publisher_accounts for each row execute function public.trg_sync_shared_publisher_account();

create or replace function public.trg_sync_shared_publisher_link() returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.sync_shared_publisher_account(coalesce(new.publisher_account_id,old.publisher_account_id)); return coalesce(new,old); end $$;
drop trigger if exists sync_shared_publisher_link_after_change on public.app_publisher_account_links;
create trigger sync_shared_publisher_link_after_change after insert or update or delete on public.app_publisher_account_links for each row execute function public.trg_sync_shared_publisher_link();

select public.sync_shared_publisher_account(id) from public.app_publisher_accounts where account_key='business_apps';

comment on table public.app_publisher_accounts is 'Shared app-store publisher credentials. Business accounts can serve multiple app identities; CentralHub personal publishing stays separate.';
comment on table public.app_publisher_account_links is 'Links registered app identities to the shared Play/App Store publisher account without sharing signing keys.';

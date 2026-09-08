-- CentralHub final security and integrity hardening.
-- CentralHub is a single-admin internal control plane. Service-role integrations keep
-- their privileged access; browser access is restricted to the canonical admin JWT.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = 'public', 'auth'
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- Stop future migrations from silently restoring anonymous access.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- Remove legacy anonymous table/view privileges in one pass. Public catalogue reads
-- are re-granted explicitly below.
revoke all privileges on all tables in schema public from anon;

-- Treat every CentralHub base table as internal by default. The four catalogue tables
-- below retain anonymous SELECT only, while all writes remain admin-only.
do $$
declare
  r record;
  p record;
  public_catalog text[] := array['products','categories','brands','banners'];
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
  loop
    execute format('alter table public.%I enable row level security', r.relname);

    if not (r.relname = any(public_catalog)) then
      for p in
        select policyname
        from pg_policies
        where schemaname='public' and tablename=r.relname
      loop
        execute format('drop policy if exists %I on public.%I', p.policyname, r.relname);
      end loop;

      execute format(
        'create policy centralhub_admin_only on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
        r.relname
      );
    else
      -- Remove every write/all policy and replace it with explicit admin-only writes.
      for p in
        select policyname
        from pg_policies
        where schemaname='public' and tablename=r.relname and cmd in ('INSERT','UPDATE','DELETE','ALL')
      loop
        execute format('drop policy if exists %I on public.%I', p.policyname, r.relname);
      end loop;
      execute format('create policy centralhub_admin_insert on public.%I for insert to authenticated with check (public.is_admin())', r.relname);
      execute format('create policy centralhub_admin_update on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', r.relname);
      execute format('create policy centralhub_admin_delete on public.%I for delete to authenticated using (public.is_admin())', r.relname);
    end if;
  end loop;
end $$;

-- Explicit public catalogue allowance retained for compatibility. No anonymous writes.
do $$
declare
  t text;
begin
  foreach t in array array['products','categories','brands','banners'] loop
    if to_regclass('public.' || t) is not null then
      execute format('grant select on table public.%I to anon', t);
      if not exists (
        select 1 from pg_policies
        where schemaname='public' and tablename=t and cmd='SELECT'
          and (roles @> array['public'::name] or roles @> array['anon'::name])
      ) then
        execute format('create policy centralhub_public_catalog_read on public.%I for select to anon using (true)', t);
      end if;
    end if;
  end loop;
end $$;

-- Views must execute with the caller's RLS context rather than the view creator's.
do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relkind='v'
  loop
    execute format('alter view public.%I set (security_invoker=true)', r.relname);
  end loop;
end $$;

-- SECURITY DEFINER was historically overused. Convert application functions to
-- invoker security so the admin-only RLS boundary is actually enforced. Keep only
-- the admin predicate itself and the deliberately public GA4 config resolver as
-- definers.
do $$
declare
  r record;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind='f'
      and p.prosecdef
      and p.proname not in ('is_admin','analytics_get_public_tracking_config')
  loop
    execute format('alter function public.%I(%s) security invoker', r.proname, r.args);
  end loop;
end $$;

-- No anonymous RPC execution by default. The public GA4 configuration resolver is
-- the sole intentional direct anonymous RPC; analytics ingestion itself goes through
-- the protected Edge Function/service-role path.
revoke execute on all functions in schema public from anon;
revoke execute on function public.is_admin() from anon;

do $$
begin
  if to_regprocedure('public.analytics_get_public_tracking_config(text)') is not null then
    grant execute on function public.analytics_get_public_tracking_config(text) to anon, authenticated;
  end if;
end $$;

-- Pin the two remaining mutable helper search paths flagged by the database advisor.
alter function public.whatsapp_delivery_effective_status(text,timestamptz,timestamptz,timestamptz)
  set search_path = public, pg_temp;
alter function public.bank_category_safe_for_auto_reconcile(text,text)
  set search_path = public, pg_temp;

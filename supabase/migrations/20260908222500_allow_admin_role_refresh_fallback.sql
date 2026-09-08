-- Keep CentralHub admin authorization working for already-minted sessions after
-- app_metadata role changes. The signed auth.uid() is checked against auth.users
-- as a fallback, so stale JWT app_metadata cannot block legitimate admin writes.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or exists (
      select 1
      from auth.users u
      where u.id = auth.uid()
        and coalesce(u.raw_app_meta_data ->> 'role', '') = 'admin'
    ),
    false
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

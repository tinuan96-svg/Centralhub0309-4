-- Issue #4: remove stale JWT admin-claim privilege escalation.
-- An identity promoted/demoted while a token remains valid must have its
-- database permissions governed by LIVE, trusted Auth and profile records.
-- The previous implementation allowed auth.jwt().app_metadata.role = 'admin'
-- to grant admin RLS even after the Auth Admin API demoted that user to staff.
-- We intentionally do not trust raw_user_meta_data or the JWT role claim.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.user_profiles p on p.id = u.id
    where u.id = (select auth.uid())
      and u.raw_app_meta_data->>'role' = 'admin'
      and p.profile_role = 'admin'
      and p.is_active = true
      and not exists (
        select 1 from public.ch_staff_accounts sa where sa.user_id = u.id
      )
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

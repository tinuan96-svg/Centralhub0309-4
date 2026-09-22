-- Issue #4: keep staff RLS, application access context and manual activation
-- synchronized. Trust Auth app_metadata from auth.users, not JWT or editable
-- user_metadata; require confirmed password change and active user profile.
create or replace function public.is_active_staff()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (
    select 1 from public.ch_staff_accounts s
    join public.user_profiles p on p.id=s.user_id
    join auth.users a on a.id=s.user_id
    where s.user_id=(select auth.uid())
      and s.status='active' and p.is_active=true
      and p.profile_role='user'
      and a.raw_app_meta_data->>'role'='staff'
      and a.raw_app_meta_data->>'must_change_password'='false'
  );
$$;

-- Personal explicit overrides take precedence over template grants.
-- Super Admin-only actions remain unavailable to ANY staff account.
create or replace function public.staff_has_permission(required_permission text)
returns boolean language sql stable security definer set search_path=''
as $$
  select public.is_active_staff()
    and required_permission <> all(array[
      'users.view','users.manage','security.manage','settings.manage'
    ])
    and coalesce(
      (select o.allowed from public.ch_staff_permission_overrides o
       where o.user_id=(select auth.uid())
         and o.permission_key=required_permission),
      exists (
        select 1 from public.ch_staff_accounts s
        join public.ch_staff_permissions r on r.role_key=s.role_key
        where s.user_id=(select auth.uid())
          and r.permission_key=required_permission
      )
    );
$$;
-- Existing EXECUTE grants for the same function identities are retained.

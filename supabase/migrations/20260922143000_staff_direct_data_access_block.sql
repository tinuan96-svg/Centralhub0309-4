-- Issue #4: staff identities MUST NOT inherit generic authenticated grants.
-- The staff application uses explicit, audited server actions for business data.
-- This gate is a restrictive AND with every pre-existing table policy. Existing
-- administrators, storefront anonymous users and service-role workers are unchanged.
create or replace function public.ch_is_staff_identity()
returns boolean
language sql stable security definer set search_path = ''
as $$
 select coalesce(
   (auth.jwt() -> 'app_metadata' ->> 'role') = 'staff'
   or exists (
     select 1 from auth.users u
      where u.id = auth.uid()
        and u.raw_app_meta_data ->> 'role' = 'staff'
   )
   or exists (
     select 1 from public.ch_staff_accounts sa
      where sa.user_id = auth.uid()
   ), false
 );
$$;
revoke all on function public.ch_is_staff_identity() from public, anon;
grant execute on function public.ch_is_staff_identity() to authenticated;

do $body$
declare t record;
begin
  for t in
    select schemaname, tablename
      from pg_tables
     where schemaname='public' and rowsecurity
  loop
    if not exists (
      select 1 from pg_policies
       where schemaname=t.schemaname and tablename=t.tablename
         and policyname='ch_staff_direct_access_block'
    ) then
      execute format(
        'create policy ch_staff_direct_access_block on %I.%I as restrictive
         for all to authenticated
         using (not public.ch_is_staff_identity())
         with check (not public.ch_is_staff_identity())',
        t.schemaname, t.tablename
      );
    end if;
  end loop;
end;
$body$;

-- Storage is a separate schema and its broad authenticated policies also
-- must not grant staff uploads/reads through raw SDK calls.
create policy ch_staff_storage_direct_access_block
on storage.objects as restrictive for all to authenticated
using (not public.ch_is_staff_identity())
with check (not public.ch_is_staff_identity());
create policy ch_staff_storage_bucket_direct_access_block
on storage.buckets as restrictive for all to authenticated
using (not public.ch_is_staff_identity())
with check (not public.ch_is_staff_identity());

-- Important: SECURITY DEFINER RPCs, functions, Edge Functions and privileged
-- Next.js routes still require explicit caller checking before staff activation.
-- These restrictive RLS policies are one defense, NOT full authorization.

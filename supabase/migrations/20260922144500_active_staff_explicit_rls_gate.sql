-- Refine the earlier restrictive staff gate: pending/suspended staff remain blocked
-- from every public RLS table. Active staff may proceed to each table's normal
-- permissive policies, where explicit permission + store scope is required.
do $body$
declare t record;
begin
  for t in
    select schemaname,tablename from pg_policies
    where schemaname='public' and policyname='ch_staff_direct_access_block'
  loop
    execute format(
      'alter policy ch_staff_direct_access_block on %I.%I
       using ((not public.ch_is_staff_identity()) or public.is_active_staff())
       with check ((not public.ch_is_staff_identity()) or public.is_active_staff())',
      t.schemaname,t.tablename
    );
  end loop;
end;
$body$;
-- Storage remains deny-by-default for ALL staff identities until each upload
-- workflow gets a dedicated bucket/path permission policy.

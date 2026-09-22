-- Issue #4: deny all direct staff writes to legacy business tables.
-- IMPORTANT: the previous 'orders.edit' and 'finance.reconcile' row policies
-- allowed unrestricted column updates, including order totals/payment status
-- and bank transaction amounts. Row-level permission alone cannot distinguish
-- safe workflow fields from protected financial/destructive fields.
-- Staff reads remain store/permission filtered. Audited service-role actions
-- (e.g. ch_staff_change_support_status) enforce exact columns + store +
-- live permission + immutable audit in a single transaction.
-- Super Admin and pre-existing non-staff RLS behavior remains unchanged.
do $gate$
declare p record;
begin
  for p in
    select schemaname,tablename,policyname,cmd
    from pg_policies
    where schemaname='public' and permissive='RESTRICTIVE'
      and policyname in (
        'ch_staff_strict_insert','ch_staff_strict_update','ch_staff_strict_delete'
      )
  loop
    if p.cmd='INSERT' then
      execute format(
        'alter policy %I on %I.%I with check (not public.ch_is_staff_identity())',
        p.policyname,p.schemaname,p.tablename
      );
    elsif p.cmd='UPDATE' then
      execute format(
        'alter policy %I on %I.%I using (not public.ch_is_staff_identity())
         with check (not public.ch_is_staff_identity())',
        p.policyname,p.schemaname,p.tablename
      );
    elsif p.cmd='DELETE' then
      execute format(
        'alter policy %I on %I.%I using (not public.ch_is_staff_identity())',
        p.policyname,p.schemaname,p.tablename
      );
    end if;
  end loop;
end
$gate$;

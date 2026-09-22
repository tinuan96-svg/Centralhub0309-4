-- CentralHub #4: READ-ONLY database release gate.
-- Execute against the target Supabase project before inviting or activating
-- staff. No data rows, roles, policies, grants or functions are changed.
-- A passing preflight is not a substitute for a separate real-identity E2E test.
do $issue4_preflight$
declare
  v_unprotected_tables text;
  v_owner_views text;
  v_bad_correlations text;
  v_exposed_writers text;
  v_function regprocedure;
begin
  select string_agg(format('%I.%I',n.nspname,c.relname),', ' order by c.relname)
    into v_unprotected_tables
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p')
    and not c.relrowsecurity
    and pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT');
  if v_unprotected_tables is not null then
    raise exception 'issue4_unprotected_authenticated_tables: %',v_unprotected_tables;
  end if;

  select string_agg(c.relname,', ' order by c.relname)
    into v_owner_views
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='v'
    and pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT')
    and not coalesce('security_invoker=true'=any(c.reloptions),false);
  if v_owner_views is not null then
    raise exception 'issue4_authenticated_owner_privilege_views: %',v_owner_views;
  end if;

  select string_agg(format('%I.%I',p.tablename,p.policyname),', ' order by p.tablename,p.policyname)
    into v_bad_correlations
  from pg_catalog.pg_policies p
  where p.schemaname='public' and (
    (p.tablename='order_items' and p.policyname in ('staff_order_items_select','ch_staff_strict_select')
      and (p.qual not ilike '%parent_order.id = order_items.order_id%' or p.qual ilike '%parent_order.id = parent_order.order_id%'))
    or
    (p.tablename='shipments' and p.policyname in ('staff_shipments_select','ch_staff_strict_select')
      and (p.qual not ilike '%parent_order.id = shipments.order_id%' or p.qual ilike '%parent_order.id = parent_order.order_id%'))
  );
  if v_bad_correlations is not null then
    raise exception 'issue4_cross_store_correlation_regressed: %',v_bad_correlations;
  end if;
  if (select count(*) from pg_catalog.pg_policies where schemaname='public'
      and ((tablename='order_items' and policyname in ('staff_order_items_select','ch_staff_strict_select'))
        or (tablename='shipments' and policyname in ('staff_shipments_select','ch_staff_strict_select'))))<>4 then
    raise exception 'issue4_correlated_order_policies_missing';
  end if;

  select string_agg(format('%I.%I',p.tablename,p.policyname),', ' order by p.tablename,p.policyname)
    into v_exposed_writers
  from pg_catalog.pg_policies p
  where p.schemaname='public' and p.policyname in ('staff_order_items_update','staff_shipments_update');
  if v_exposed_writers is not null then
    raise exception 'issue4_unbounded_staff_child_writes: %',v_exposed_writers;
  end if;

  foreach v_function in array array[
    'public.ch_staff_claim_picking(uuid,uuid,uuid)'::regprocedure,
    'public.ch_staff_complete_picking(uuid,uuid,uuid,integer)'::regprocedure,
    'public.ch_staff_complete_packing(uuid,uuid,uuid)'::regprocedure,
    'public.ch_staff_change_support_status(uuid,uuid,uuid,text,text)'::regprocedure
  ] loop
    if pg_catalog.has_function_privilege('anon',v_function,'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE') then
      raise exception 'issue4_staff_mutator_execute_grant_invalid: %',v_function;
    end if;
  end loop;
end
$issue4_preflight$;
select 'PASS: Issue #4 read-only DB privilege preflight' as result;

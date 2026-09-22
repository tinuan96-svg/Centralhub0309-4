-- Issue #4: make finance reporting staff-aware while preserving Super Admin behavior.
-- Store-scoped staff MUST request an assigned store. Only all-store staff may
-- request p_store_id = null. The finance SECURITY DEFINER reports all call this.
create or replace function public.finance_can_manage(p_store_id uuid default null)
returns boolean language sql stable set search_path='pg_catalog','public'
as $$
 select public.is_admin()
    or (
      public.staff_has_permission('finance.view')
      and (
        (p_store_id is not null and public.staff_has_store_access(p_store_id))
        or (p_store_id is null and public.staff_has_all_stores())
      )
    );
$$;
revoke all on function public.finance_can_manage(uuid) from public,anon;
grant execute on function public.finance_can_manage(uuid) to authenticated,service_role;

-- Keep the old no-argument helper admin-only for legacy callers; staff reports
-- must pass their requested store explicitly.
create or replace function public.finance_can_manage()
returns boolean language sql stable set search_path='pg_catalog','public'
as $$ select public.is_admin(); $$;

-- Patch the five existing finance report functions to use the requested store
-- when authorising. Function bodies/return contracts otherwise stay unchanged.
do $body$
declare r record; d text;
begin
  for r in
    select p.oid,p.oid::regprocedure::text sig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'get_finance_order_profitability','get_finance_customer_profitability',
      'get_finance_product_profitability','get_finance_monthly_pnl_range'
    )
  loop
    d:=pg_get_functiondef(r.oid);
    d:=replace(d,'public.finance_can_manage()','public.finance_can_manage(p_store_id)');
    execute d;
  end loop;
end $body$;

-- Supplier performance has no store parameter and aggregates global supplier
-- data, so staff access is intentionally all-stores only.
create or replace function public.finance_can_manage_suppliers()
returns boolean language sql stable set search_path='pg_catalog','public'
as $$
 select public.is_admin()
    or (public.staff_has_permission('finance.view') and public.staff_has_all_stores());
$$;
revoke all on function public.finance_can_manage_suppliers() from public,anon;
grant execute on function public.finance_can_manage_suppliers() to authenticated,service_role;
do $body$
declare r record; d text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_finance_supplier_performance'
  loop
    d:=pg_get_functiondef(r.oid);
    d:=replace(d,'public.finance_can_manage()','public.finance_can_manage_suppliers()');
    execute d;
  end loop;
end $body$;

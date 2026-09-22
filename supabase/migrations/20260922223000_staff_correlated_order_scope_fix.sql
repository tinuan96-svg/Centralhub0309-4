-- Issue #4 security fix: qualify outer-row order_id in correlated RLS checks.
--
-- The prior expression `o.id = order_id` was parsed as `o.id = o.order_id`
-- because public.orders ALSO has a column named order_id. That predicate
-- checked each *inner order against itself*, not the outer order_item/shipment.
-- With an assigned order in any store this could disclose records of other
-- stores to an authenticated staff identity with view permissions.
--
-- Explicitly bind the outer row. These policies are additive to the existing
-- restrictive staff-identity gates, and preserve legacy Super Admin access.
alter policy ch_staff_strict_select on public.order_items
  using (
    not public.ch_is_staff_identity()
    or (
      public.is_active_staff()
      and public.staff_has_permission('orders.view')
      and exists (
        select 1 from public.orders as parent_order
         where parent_order.id = public.order_items.order_id
           and public.staff_has_store_access(parent_order.store_id)
      )
    )
  );

alter policy staff_order_items_select on public.order_items
  using (
    public.staff_has_permission('orders.view')
    and exists (
      select 1 from public.orders as parent_order
       where parent_order.id = public.order_items.order_id
         and public.staff_has_store_access(parent_order.store_id)
    )
  );

alter policy ch_staff_strict_select on public.shipments
  using (
    not public.ch_is_staff_identity()
    or (
      public.is_active_staff()
      and public.staff_has_permission('shipping.view')
      and exists (
        select 1 from public.orders as parent_order
         where parent_order.id = public.shipments.order_id
           and public.staff_has_store_access(parent_order.store_id)
      )
    )
  );

alter policy staff_shipments_select on public.shipments
  using (
    public.staff_has_permission('shipping.view')
    and exists (
      select 1 from public.orders as parent_order
       where parent_order.id = public.shipments.order_id
         and public.staff_has_store_access(parent_order.store_id)
    )
  );

-- Arbitrary direct staff writes are prohibited by restrictive policies.
-- Removing the old permissive write policies eliminates misleading,
-- unbounded grants; vetted staff write actions use audited server RPCs.
drop policy if exists staff_order_items_update on public.order_items;
drop policy if exists staff_shipments_update on public.shipments;

-- Assert the database parses the outer reference as the outer table, not
-- parent_order.order_id. Migration failure rolls back all alterations.
do $verify$
declare v_table text; v_policy text; v_expr text;
begin
  for v_table,v_policy in
    select * from (values
      ('order_items','ch_staff_strict_select'),
      ('order_items','staff_order_items_select'),
      ('shipments','ch_staff_strict_select'),
      ('shipments','staff_shipments_select')
    ) as t(table_name,policy_name)
  loop
    select p.qual into v_expr from pg_policies p
      where p.schemaname='public' and p.tablename=v_table
        and p.policyname=v_policy;
    if v_expr is null or position(v_table || '.order_id' in v_expr)=0
      or position('parent_order.id = parent_order.order_id' in v_expr)>0 then
      raise exception 'staff_store_scope_policy_not_correlated: %.%',v_table,v_policy;
    end if;
  end loop;
end $verify$;

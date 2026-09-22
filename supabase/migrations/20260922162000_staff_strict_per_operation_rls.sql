-- Issue #4: fail-closed staff access gate for EVERY RLS public table.
-- The previous permissive broad authenticated policies can be combined with
-- permissive staff policies by OR. This separate restrictive policy ensures
-- each action always requires its own staff permission AND row-level store.
-- Existing administrators and non-staff service users are unchanged.
-- New RLS tables must receive the same default policy before exposing staff.

do $apply$
declare t record;
begin
  for t in
    select n.nspname as schemaname,c.relname as tablename
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname=t.schemaname and tablename=t.tablename
        and policyname='ch_staff_strict_default_block'
    ) then
      execute format(
       'create policy ch_staff_strict_default_block on %I.%I as restrictive
        for all to authenticated
        using (not public.ch_is_staff_identity())
        with check (not public.ch_is_staff_identity())',
        t.schemaname,t.tablename
      );
    end if;
  end loop;
end;
$apply$;

-- These explicit tables are the ONLY ones where an active staff identity
-- can pass the restrictive gate. Every operation has an independent rule.

-- orders
drop policy if exists ch_staff_strict_default_block on public.orders;
create policy ch_staff_strict_select on public.orders as restrictive for select to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('orders.view') and public.staff_has_store_access(store_id))));
create policy ch_staff_strict_insert on public.orders as restrictive for insert to authenticated with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('orders.create') and public.staff_has_store_access(store_id))));
create policy ch_staff_strict_update on public.orders as restrictive for update to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('orders.edit') and public.staff_has_store_access(store_id)))) with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('orders.edit') and public.staff_has_store_access(store_id))));
create policy ch_staff_strict_delete on public.orders as restrictive for delete to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('orders.delete') and public.staff_has_store_access(store_id))));

-- order_items
drop policy if exists ch_staff_strict_default_block on public.order_items;
create policy ch_staff_strict_select on public.order_items as restrictive for select to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('orders.view') and exists (select 1 from public.orders o where o.id=order_id and public.staff_has_store_access(o.store_id)))));
create policy ch_staff_strict_insert on public.order_items as restrictive for insert to authenticated with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));
create policy ch_staff_strict_update on public.order_items as restrictive for update to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('orders.edit') and exists (select 1 from public.orders o where o.id=order_id and public.staff_has_store_access(o.store_id))))) with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('orders.edit') and exists (select 1 from public.orders o where o.id=order_id and public.staff_has_store_access(o.store_id)))));
create policy ch_staff_strict_delete on public.order_items as restrictive for delete to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));

-- customers
drop policy if exists ch_staff_strict_default_block on public.customers;
create policy ch_staff_strict_select on public.customers as restrictive for select to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('customers.view') and public.staff_has_store_access(store_id))));
create policy ch_staff_strict_insert on public.customers as restrictive for insert to authenticated with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));
create policy ch_staff_strict_update on public.customers as restrictive for update to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('customers.edit') and public.staff_has_store_access(store_id)))) with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('customers.edit') and public.staff_has_store_access(store_id))));
create policy ch_staff_strict_delete on public.customers as restrictive for delete to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));

-- support_tickets
drop policy if exists ch_staff_strict_default_block on public.support_tickets;
create policy ch_staff_strict_select on public.support_tickets as restrictive for select to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('support.view') and public.staff_has_store_access(store_id))));
create policy ch_staff_strict_insert on public.support_tickets as restrictive for insert to authenticated with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));
create policy ch_staff_strict_update on public.support_tickets as restrictive for update to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('support.edit') and public.staff_has_store_access(store_id)))) with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('support.edit') and public.staff_has_store_access(store_id))));
create policy ch_staff_strict_delete on public.support_tickets as restrictive for delete to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));

-- bank_transactions
drop policy if exists ch_staff_strict_default_block on public.bank_transactions;
create policy ch_staff_strict_select on public.bank_transactions as restrictive for select to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('finance.view') and public.staff_has_store_access(store_id))));
create policy ch_staff_strict_insert on public.bank_transactions as restrictive for insert to authenticated with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));
create policy ch_staff_strict_update on public.bank_transactions as restrictive for update to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('finance.reconcile') and public.staff_has_store_access(store_id)))) with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('finance.reconcile') and public.staff_has_store_access(store_id))));
create policy ch_staff_strict_delete on public.bank_transactions as restrictive for delete to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));

-- expenses
drop policy if exists ch_staff_strict_default_block on public.expenses;
create policy ch_staff_strict_select on public.expenses as restrictive for select to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('finance.view') and public.staff_has_store_access(store_id))));
create policy ch_staff_strict_insert on public.expenses as restrictive for insert to authenticated with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));
create policy ch_staff_strict_update on public.expenses as restrictive for update to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('finance.edit') and public.staff_has_store_access(store_id)))) with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('finance.edit') and public.staff_has_store_access(store_id))));
create policy ch_staff_strict_delete on public.expenses as restrictive for delete to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));

-- marketing_campaigns
drop policy if exists ch_staff_strict_default_block on public.marketing_campaigns;
create policy ch_staff_strict_select on public.marketing_campaigns as restrictive for select to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('marketing.view') and public.staff_has_store_access(store_id))));
create policy ch_staff_strict_insert on public.marketing_campaigns as restrictive for insert to authenticated with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));
create policy ch_staff_strict_update on public.marketing_campaigns as restrictive for update to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('marketing.edit') and public.staff_has_store_access(store_id)))) with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('marketing.edit') and public.staff_has_store_access(store_id))));
create policy ch_staff_strict_delete on public.marketing_campaigns as restrictive for delete to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));

-- inventory_logs
drop policy if exists ch_staff_strict_default_block on public.inventory_logs;
create policy ch_staff_strict_select on public.inventory_logs as restrictive for select to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('inventory.view') and public.staff_has_store_access(store_id))));
create policy ch_staff_strict_insert on public.inventory_logs as restrictive for insert to authenticated with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));
create policy ch_staff_strict_update on public.inventory_logs as restrictive for update to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false))) with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));
create policy ch_staff_strict_delete on public.inventory_logs as restrictive for delete to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));

-- inventory_forecasts
drop policy if exists ch_staff_strict_default_block on public.inventory_forecasts;
create policy ch_staff_strict_select on public.inventory_forecasts as restrictive for select to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('inventory.view') and public.staff_has_store_access(store_id))));
create policy ch_staff_strict_insert on public.inventory_forecasts as restrictive for insert to authenticated with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));
create policy ch_staff_strict_update on public.inventory_forecasts as restrictive for update to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false))) with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));
create policy ch_staff_strict_delete on public.inventory_forecasts as restrictive for delete to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));

-- purchase_orders
drop policy if exists ch_staff_strict_default_block on public.purchase_orders;
create policy ch_staff_strict_select on public.purchase_orders as restrictive for select to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('procurement.view') and public.staff_has_all_stores())));
create policy ch_staff_strict_insert on public.purchase_orders as restrictive for insert to authenticated with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('procurement.create') and public.staff_has_all_stores())));
create policy ch_staff_strict_update on public.purchase_orders as restrictive for update to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('procurement.edit') and public.staff_has_all_stores()))) with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('procurement.edit') and public.staff_has_all_stores())));
create policy ch_staff_strict_delete on public.purchase_orders as restrictive for delete to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('procurement.delete') and public.staff_has_all_stores())));

-- purchase_order_items
drop policy if exists ch_staff_strict_default_block on public.purchase_order_items;
create policy ch_staff_strict_select on public.purchase_order_items as restrictive for select to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('procurement.view') and public.staff_has_all_stores())));
create policy ch_staff_strict_insert on public.purchase_order_items as restrictive for insert to authenticated with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('procurement.create') and public.staff_has_all_stores())));
create policy ch_staff_strict_update on public.purchase_order_items as restrictive for update to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('procurement.edit') and public.staff_has_all_stores()))) with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('procurement.edit') and public.staff_has_all_stores())));
create policy ch_staff_strict_delete on public.purchase_order_items as restrictive for delete to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));

-- suppliers
drop policy if exists ch_staff_strict_default_block on public.suppliers;
create policy ch_staff_strict_select on public.suppliers as restrictive for select to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('procurement.view') and public.staff_has_all_stores())));
create policy ch_staff_strict_insert on public.suppliers as restrictive for insert to authenticated with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));
create policy ch_staff_strict_update on public.suppliers as restrictive for update to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false))) with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));
create policy ch_staff_strict_delete on public.suppliers as restrictive for delete to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));

-- supplier_invoices
drop policy if exists ch_staff_strict_default_block on public.supplier_invoices;
create policy ch_staff_strict_select on public.supplier_invoices as restrictive for select to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and ((public.staff_has_permission('procurement.view') or public.staff_has_permission('finance.view')) and public.staff_has_store_access(store_id))));
create policy ch_staff_strict_insert on public.supplier_invoices as restrictive for insert to authenticated with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));
create policy ch_staff_strict_update on public.supplier_invoices as restrictive for update to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and ((public.staff_has_permission('procurement.edit') or public.staff_has_permission('finance.edit')) and public.staff_has_store_access(store_id)))) with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and ((public.staff_has_permission('procurement.edit') or public.staff_has_permission('finance.edit')) and public.staff_has_store_access(store_id))));
create policy ch_staff_strict_delete on public.supplier_invoices as restrictive for delete to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));

-- finance_documents
drop policy if exists ch_staff_strict_default_block on public.finance_documents;
create policy ch_staff_strict_select on public.finance_documents as restrictive for select to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and ((public.staff_has_permission('billing.view') or public.staff_has_permission('finance.view')) and public.staff_has_store_access(store_id))));
create policy ch_staff_strict_insert on public.finance_documents as restrictive for insert to authenticated with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));
create policy ch_staff_strict_update on public.finance_documents as restrictive for update to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false))) with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));
create policy ch_staff_strict_delete on public.finance_documents as restrictive for delete to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));

-- shipments
drop policy if exists ch_staff_strict_default_block on public.shipments;
create policy ch_staff_strict_select on public.shipments as restrictive for select to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('shipping.view') and exists (select 1 from public.orders o where o.id=order_id and public.staff_has_store_access(o.store_id)))));
create policy ch_staff_strict_insert on public.shipments as restrictive for insert to authenticated with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));
create policy ch_staff_strict_update on public.shipments as restrictive for update to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('shipping.edit') and exists (select 1 from public.orders o where o.id=order_id and public.staff_has_store_access(o.store_id))))) with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('shipping.edit') and exists (select 1 from public.orders o where o.id=order_id and public.staff_has_store_access(o.store_id)))));
create policy ch_staff_strict_delete on public.shipments as restrictive for delete to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));

-- products
drop policy if exists ch_staff_strict_default_block on public.products;
create policy ch_staff_strict_select on public.products as restrictive for select to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and ((public.staff_has_permission('products.view') or public.staff_has_permission('inventory.view')) and public.staff_has_all_stores())));
create policy ch_staff_strict_insert on public.products as restrictive for insert to authenticated with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));
create policy ch_staff_strict_update on public.products as restrictive for update to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('products.edit') and public.staff_has_all_stores()))) with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('products.edit') and public.staff_has_all_stores())));
create policy ch_staff_strict_delete on public.products as restrictive for delete to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('products.delete') and public.staff_has_all_stores())));

-- categories
drop policy if exists ch_staff_strict_default_block on public.categories;
create policy ch_staff_strict_select on public.categories as restrictive for select to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('products.view') and public.staff_has_all_stores())));
create policy ch_staff_strict_insert on public.categories as restrictive for insert to authenticated with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));
create policy ch_staff_strict_update on public.categories as restrictive for update to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('products.edit') and public.staff_has_all_stores()))) with check ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (public.staff_has_permission('products.edit') and public.staff_has_all_stores())));
create policy ch_staff_strict_delete on public.categories as restrictive for delete to authenticated using ((not public.ch_is_staff_identity()) or (public.is_active_staff() and (false)));

-- Storage has its own deny-by-default policy. Security-definer RPCs and
-- service-role API handlers bypass RLS and still need separately verified gates.

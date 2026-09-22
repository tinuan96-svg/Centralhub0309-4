-- Issue #4 security boundary: authoritative staff status/permission/store checks.
-- Existing admin policies remain unchanged; staff access is additive and explicit.
create or replace function public.is_active_staff()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (
    select 1 from public.ch_staff_accounts s
    join public.user_profiles p on p.id=s.user_id
    where s.user_id=(select auth.uid()) and s.status='active' and p.is_active=true
  );
$$;
create or replace function public.staff_has_permission(required_permission text)
returns boolean language sql stable security definer set search_path=''
as $$
  select public.is_active_staff() and exists (
    select 1 from public.ch_staff_permission_overrides o
    where o.user_id=(select auth.uid()) and o.permission_key=required_permission and o.allowed=true
  );
$$;
create or replace function public.staff_has_store_access(required_store uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select public.is_active_staff() and exists (
    select 1 from public.ch_staff_accounts s
    where s.user_id=(select auth.uid()) and
      (s.all_stores=true or exists (
        select 1 from public.ch_staff_store_access a
        where a.user_id=s.user_id and a.store_id=required_store
      ))
  );
$$;
revoke all on function public.is_active_staff() from public,anon;
revoke all on function public.staff_has_permission(text) from public,anon;
revoke all on function public.staff_has_store_access(uuid) from public,anon;
grant execute on function public.is_active_staff() to authenticated;
grant execute on function public.staff_has_permission(text) to authenticated;
grant execute on function public.staff_has_store_access(uuid) to authenticated;

-- Broad authenticated write policies pre-dated staff accounts. With staff Auth
-- now possible they must no longer be an authorization bypass.
drop policy if exists "inventory_audit_label_photos_authenticated_delete" on public.inventory_audit_label_photos;
drop policy if exists "inventory_audit_label_photos_authenticated_select" on public.inventory_audit_label_photos;
drop policy if exists "inventory_audit_label_photos_authenticated_update" on public.inventory_audit_label_photos;
create policy "inventory_audit_label_photos_admin_select" on public.inventory_audit_label_photos for select to authenticated using (public.is_admin());
create policy "inventory_audit_label_photos_admin_update" on public.inventory_audit_label_photos for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "inventory_audit_label_photos_admin_delete" on public.inventory_audit_label_photos for delete to authenticated using (public.is_admin());

drop policy if exists "inventory_audit_session_items_authenticated" on public.inventory_audit_session_items;
create policy "inventory_audit_session_items_admin" on public.inventory_audit_session_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "inventory_audit_sessions_authenticated" on public.inventory_audit_sessions;
create policy "inventory_audit_sessions_admin" on public.inventory_audit_sessions for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "product_barcodes_authenticated_insert" on public.product_barcodes;
drop policy if exists "product_barcodes_authenticated_select" on public.product_barcodes;
drop policy if exists "product_barcodes_authenticated_update" on public.product_barcodes;
create policy "product_barcodes_admin_select" on public.product_barcodes for select to authenticated using (public.is_admin());
create policy "product_barcodes_admin_insert" on public.product_barcodes for insert to authenticated with check (public.is_admin());
create policy "product_barcodes_admin_update" on public.product_barcodes for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Core store-scoped staff data policies. Permission + row store are BOTH required.
create policy "staff_orders_select" on public.orders for select to authenticated
using (public.staff_has_permission('orders.view') and public.staff_has_store_access(store_id));
create policy "staff_orders_insert" on public.orders for insert to authenticated
with check (public.staff_has_permission('orders.create') and public.staff_has_store_access(store_id));
create policy "staff_orders_update" on public.orders for update to authenticated
using (public.staff_has_permission('orders.edit') and public.staff_has_store_access(store_id))
with check (public.staff_has_permission('orders.edit') and public.staff_has_store_access(store_id));

create policy "staff_order_items_select" on public.order_items for select to authenticated
using (public.staff_has_permission('orders.view') and exists (
  select 1 from public.orders o where o.id=order_id and public.staff_has_store_access(o.store_id)
));
create policy "staff_order_items_update" on public.order_items for update to authenticated
using (public.staff_has_permission('orders.edit') and exists (
  select 1 from public.orders o where o.id=order_id and public.staff_has_store_access(o.store_id)
)) with check (public.staff_has_permission('orders.edit') and exists (
  select 1 from public.orders o where o.id=order_id and public.staff_has_store_access(o.store_id)
));

create policy "staff_customers_select" on public.customers for select to authenticated
using (public.staff_has_permission('customers.view') and public.staff_has_store_access(store_id));
create policy "staff_customers_update" on public.customers for update to authenticated
using (public.staff_has_permission('customers.edit') and public.staff_has_store_access(store_id))
with check (public.staff_has_permission('customers.edit') and public.staff_has_store_access(store_id));

create policy "staff_support_tickets_select" on public.support_tickets for select to authenticated
using (public.staff_has_permission('support.view') and public.staff_has_store_access(store_id));
create policy "staff_support_tickets_update" on public.support_tickets for update to authenticated
using ((public.staff_has_permission('support.edit') or public.staff_has_permission('support.reply')) and public.staff_has_store_access(store_id))
with check ((public.staff_has_permission('support.edit') or public.staff_has_permission('support.reply')) and public.staff_has_store_access(store_id));

create policy "staff_bank_transactions_select" on public.bank_transactions for select to authenticated
using (public.staff_has_permission('finance.view') and public.staff_has_store_access(store_id));
create policy "staff_bank_transactions_update" on public.bank_transactions for update to authenticated
using ((public.staff_has_permission('finance.edit') or public.staff_has_permission('finance.reconcile')) and public.staff_has_store_access(store_id))
with check ((public.staff_has_permission('finance.edit') or public.staff_has_permission('finance.reconcile')) and public.staff_has_store_access(store_id));

create policy "staff_expenses_select" on public.expenses for select to authenticated
using (public.staff_has_permission('finance.view') and public.staff_has_store_access(store_id));
create policy "staff_expenses_update" on public.expenses for update to authenticated
using (public.staff_has_permission('finance.edit') and public.staff_has_store_access(store_id))
with check (public.staff_has_permission('finance.edit') and public.staff_has_store_access(store_id));

create policy "staff_marketing_campaigns_select" on public.marketing_campaigns for select to authenticated
using (public.staff_has_permission('marketing.view') and public.staff_has_store_access(store_id));
create policy "staff_marketing_campaigns_update" on public.marketing_campaigns for update to authenticated
using (public.staff_has_permission('marketing.edit') and public.staff_has_store_access(store_id))
with check (public.staff_has_permission('marketing.edit') and public.staff_has_store_access(store_id));

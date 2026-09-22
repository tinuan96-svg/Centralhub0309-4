create or replace function public.staff_has_all_stores()
returns boolean language sql stable security definer set search_path=''
as $$
 select public.is_active_staff() and exists (
   select 1 from public.ch_staff_accounts s where s.user_id=(select auth.uid()) and s.all_stores=true
 );
$$;
revoke all on function public.staff_has_all_stores() from public,anon;
grant execute on function public.staff_has_all_stores() to authenticated;

-- Legacy central_inventory had no RLS. Protect it before any staff identity is activated.
alter table public.central_inventory enable row level security;
create policy "central_inventory_admin_all" on public.central_inventory for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy "staff_central_inventory_select" on public.central_inventory for select to authenticated
using (public.staff_has_permission('inventory.view') and public.staff_has_all_stores());
create policy "staff_central_inventory_update" on public.central_inventory for update to authenticated
using (public.staff_has_permission('inventory.edit') and public.staff_has_all_stores())
with check (public.staff_has_permission('inventory.edit') and public.staff_has_all_stores());

create policy "staff_inventory_logs_select" on public.inventory_logs for select to authenticated
using (public.staff_has_permission('inventory.view') and public.staff_has_store_access(store_id));
create policy "staff_inventory_forecasts_select" on public.inventory_forecasts for select to authenticated
using (public.staff_has_permission('inventory.view') and public.staff_has_store_access(store_id));

-- Purchase-order/supplier master rows currently have no store_id. Until the
-- schema can prove row ownership, only staff explicitly assigned ALL STORES
-- can access these global resources.
create policy "staff_purchase_orders_select" on public.purchase_orders for select to authenticated
using (public.staff_has_permission('procurement.view') and public.staff_has_all_stores());
create policy "staff_purchase_orders_insert" on public.purchase_orders for insert to authenticated
with check (public.staff_has_permission('procurement.create') and public.staff_has_all_stores());
create policy "staff_purchase_orders_update" on public.purchase_orders for update to authenticated
using (public.staff_has_permission('procurement.edit') and public.staff_has_all_stores())
with check (public.staff_has_permission('procurement.edit') and public.staff_has_all_stores());
create policy "staff_purchase_order_items_select" on public.purchase_order_items for select to authenticated
using (public.staff_has_permission('procurement.view') and public.staff_has_all_stores());
create policy "staff_purchase_order_items_insert" on public.purchase_order_items for insert to authenticated
with check (public.staff_has_permission('procurement.create') and public.staff_has_all_stores());
create policy "staff_purchase_order_items_update" on public.purchase_order_items for update to authenticated
using (public.staff_has_permission('procurement.edit') and public.staff_has_all_stores())
with check (public.staff_has_permission('procurement.edit') and public.staff_has_all_stores());
create policy "staff_suppliers_select" on public.suppliers for select to authenticated
using (public.staff_has_permission('procurement.view') and public.staff_has_all_stores());

create policy "staff_supplier_invoices_select" on public.supplier_invoices for select to authenticated
using ((public.staff_has_permission('procurement.view') or public.staff_has_permission('finance.view'))
  and public.staff_has_store_access(store_id));
create policy "staff_supplier_invoices_update" on public.supplier_invoices for update to authenticated
using ((public.staff_has_permission('procurement.edit') or public.staff_has_permission('finance.edit'))
  and public.staff_has_store_access(store_id))
with check ((public.staff_has_permission('procurement.edit') or public.staff_has_permission('finance.edit'))
  and public.staff_has_store_access(store_id));

create policy "staff_finance_documents_select" on public.finance_documents for select to authenticated
using ((public.staff_has_permission('billing.view') or public.staff_has_permission('finance.view'))
  and public.staff_has_store_access(store_id));

create policy "staff_shipments_select" on public.shipments for select to authenticated
using (public.staff_has_permission('shipping.view') and exists (
 select 1 from public.orders o where o.id=order_id and public.staff_has_store_access(o.store_id)
));
create policy "staff_shipments_update" on public.shipments for update to authenticated
using (public.staff_has_permission('shipping.edit') and exists (
 select 1 from public.orders o where o.id=order_id and public.staff_has_store_access(o.store_id)
)) with check (public.staff_has_permission('shipping.edit') and exists (
 select 1 from public.orders o where o.id=order_id and public.staff_has_store_access(o.store_id)
));

-- Product/category masters are network-global. Public SELECT policies remain
-- for storefront compatibility; staff writes require ALL STORES.
create policy "staff_products_update" on public.products for update to authenticated
using (public.staff_has_permission('products.edit') and public.staff_has_all_stores())
with check (public.staff_has_permission('products.edit') and public.staff_has_all_stores());
create policy "staff_categories_update" on public.categories for update to authenticated
using (public.staff_has_permission('products.edit') and public.staff_has_all_stores())
with check (public.staff_has_permission('products.edit') and public.staff_has_all_stores());

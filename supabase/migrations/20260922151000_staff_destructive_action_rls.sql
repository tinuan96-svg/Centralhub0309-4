create policy "staff_orders_delete" on public.orders for delete to authenticated
using (public.staff_has_permission('orders.delete') and public.staff_has_store_access(store_id));
create policy "staff_purchase_orders_delete" on public.purchase_orders for delete to authenticated
using (public.staff_has_permission('procurement.delete') and public.staff_has_all_stores());
create policy "staff_products_delete" on public.products for delete to authenticated
using (public.staff_has_permission('products.delete') and public.staff_has_all_stores());

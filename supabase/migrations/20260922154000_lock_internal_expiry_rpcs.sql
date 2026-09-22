-- Trigger-only SECURITY DEFINER helpers should not be callable over PostgREST.
revoke execute on function public.capture_open_inventory_audit_count() from public,anon,authenticated;
revoke execute on function public.consume_sellable_expiry_batches_on_stock_decrease() from public,anon,authenticated;
revoke execute on function public.ensure_single_expiry_batch_for_product() from public,anon,authenticated;
revoke execute on function public.refresh_expiry_state_on_stock_change() from public,anon,authenticated;
revoke execute on function public.sync_product_expiry_batch_summary() from public,anon,authenticated;

-- Maintenance/expiry routines are intentionally not staff actions in Issue #4.
-- Preserve service-role automation and existing Super Admin authenticated usage,
-- but block anonymous callers.
revoke execute on function public.block_products_inside_expiry_20d() from public,anon;
revoke execute on function public.refresh_all_product_expiry_states() from public,anon;
revoke execute on function public.refresh_product_expiry_state(uuid) from public,anon;
grant execute on function public.block_products_inside_expiry_20d() to authenticated,service_role;
grant execute on function public.refresh_all_product_expiry_states() to authenticated,service_role;
grant execute on function public.refresh_product_expiry_state(uuid) to authenticated,service_role;

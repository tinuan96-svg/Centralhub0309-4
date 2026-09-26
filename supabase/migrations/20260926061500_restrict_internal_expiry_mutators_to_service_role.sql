-- Internal expiry mutators are invoked by privileged server/database flows, not browser-authenticated users.
REVOKE EXECUTE ON FUNCTION public.block_products_inside_expiry_20d() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.block_products_inside_expiry_20d() TO service_role;
REVOKE EXECUTE ON FUNCTION public.refresh_all_product_expiry_states() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_all_product_expiry_states() TO service_role;
REVOKE EXECUTE ON FUNCTION public.refresh_product_expiry_state(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_product_expiry_state(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.replace_product_expiry_batches_for_audit(uuid,jsonb,integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_product_expiry_batches_for_audit(uuid,jsonb,integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.replace_product_expiry_boxes_for_audit(uuid,jsonb,integer,integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_product_expiry_boxes_for_audit(uuid,jsonb,integer,integer) TO service_role;

-- GRANT EXECUTE on missing visibility functions to authenticated users
-- These were revoked in the comprehensive security audit

GRANT EXECUTE ON FUNCTION public.get_products_for_store_simple(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_visibility_summary(uuid) TO authenticated;

-- Also grant to service_role just in case (though audit did this)
GRANT EXECUTE ON FUNCTION public.get_products_for_store_simple(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_visibility_summary(uuid) TO service_role;

COMMENT ON TABLE store_products IS 'Store-specific product overrides including visibility and pricing.';

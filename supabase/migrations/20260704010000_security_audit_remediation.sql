-- ============================================================
-- SECURITY AUDIT REMEDIATION
-- Addresses issues identified in the Security Audit
-- ============================================================

-- 1. FIX: Enable RLS on missed tables
ALTER TABLE IF EXISTS public.pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.malluspices_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.store_deletion_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.central_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stores ENABLE ROW LEVEL SECURITY;

-- 2. FIX: Ensure Admin-Only Policies exist for sensitive tables
DO $$
DECLARE
    t_name text;
    v_admin_tables text[] := ARRAY[
        'pricing_rules', 'sync_logs', 'sync_queue', 'malluspices_orders',
        'store_deletion_audit', 'central_inventory', 'user_profiles',
        'user_nav_permissions', 'webhook_logs', 'stores'
    ];
BEGIN
    FOREACH t_name IN ARRAY v_admin_tables
    LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t_name) THEN
            EXECUTE format('DROP POLICY IF EXISTS "Admin-Only Full Access" ON public.%I', t_name);
            EXECUTE format('CREATE POLICY "Admin-Only Full Access" ON public.%I
                FOR ALL TO authenticated
                USING (public.is_admin())
                WITH CHECK (public.is_admin())', t_name);
        END IF;
    END LOOP;
END $$;

-- 3. FIX: Revoke SELECT from 'anon' on sensitive objects to prevent GraphQL discoverability
-- This addresses "Public Can See Object in GraphQL Schema"
REVOKE SELECT ON TABLE public.pricing_rules FROM anon;
REVOKE SELECT ON TABLE public.sync_logs FROM anon;
REVOKE SELECT ON TABLE public.sync_queue FROM anon;
REVOKE SELECT ON TABLE public.malluspices_orders FROM anon;
REVOKE SELECT ON TABLE public.store_deletion_audit FROM anon;
REVOKE SELECT ON TABLE public.store_products FROM anon;
REVOKE SELECT ON TABLE public.user_profiles FROM anon;
REVOKE SELECT ON TABLE public.webhook_logs FROM anon;
REVOKE SELECT ON TABLE public.central_inventory FROM anon;

-- 4. FIX: Move 'http' extension to its own schema
-- This addresses "Extension in Public"
-- NOTE: Some environments do not support SET SCHEMA for the http extension.
-- If it fails, we fall back to revoking permissions from the public role.
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'http') THEN
        BEGIN
            ALTER EXTENSION http SET SCHEMA extensions;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Extension http does not support SET SCHEMA. Revoking public execute instead.';
            REVOKE EXECUTE ON FUNCTION public.http_get(text) FROM PUBLIC;
            REVOKE EXECUTE ON FUNCTION public.http_post(text, text, text) FROM PUBLIC;
            REVOKE EXECUTE ON FUNCTION public.http_put(text, text, text) FROM PUBLIC;
            REVOKE EXECUTE ON FUNCTION public.http_patch(text, text, text) FROM PUBLIC;
            REVOKE EXECUTE ON FUNCTION public.http_delete(text) FROM PUBLIC;
            REVOKE EXECUTE ON FUNCTION public.http_head(text) FROM PUBLIC;
        END;
    END IF;
END $$;

-- 5. FIX: Revoke global permissions and enforce specific access
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- 6. FIX: Functions - Revoke EXECUTE from PUBLIC/anon/authenticated for SECURITY DEFINER functions
-- This addresses "Signed-In Users Can Execute SECURITY DEFINER Function"
DO $$
DECLARE
    func_record record;
BEGIN
    FOR func_record IN
        SELECT quote_ident(p.proname) as name, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.prosecdef = true
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC', func_record.name, func_record.args);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated', func_record.name, func_record.args);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon', func_record.name, func_record.args);
        -- Service role still needs it for background processing
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', func_record.name, func_record.args);
    END LOOP;
END $$;

-- 7. Selective Re-grants of Functions
-- We grant back to authenticated, but the functions MUST check is_admin() internally
-- if they perform sensitive actions.

-- Admin-only UI functions
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_products(text, text, text, uuid, uuid, numeric, numeric, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_product_visibility(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_set_product_visibility(uuid[], uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_product_visibility(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_product_visible_in_store(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_store(uuid) TO authenticated;

-- Functions that are safe for authenticated users
GRANT EXECUTE ON FUNCTION public.get_cashback_percentage(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cashback_tier(numeric) TO authenticated;

-- Public store functions (needed for 'anon' too)
GRANT EXECUTE ON FUNCTION public.get_store_products(text, text, uuid, numeric, numeric, boolean, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_categories(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_products_clean(text, text, text, boolean, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_product_image(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dynamic_banner_products(uuid, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_homepage_section_products(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_homepage_section_products(uuid, text[]) TO anon, authenticated;

-- 8. FIX: SECURITY DEFINER Views
REVOKE SELECT ON public.current_orders_sheet FROM anon;
REVOKE SELECT ON public.current_orders_sheet FROM authenticated;
GRANT SELECT ON public.current_orders_sheet TO service_role;

REVOKE SELECT ON public.sync_status_dashboard FROM anon;
REVOKE SELECT ON public.sync_status_dashboard FROM authenticated;
GRANT SELECT ON public.sync_status_dashboard TO service_role;

-- 9. Final check on products/categories
GRANT SELECT ON public.products TO anon, authenticated;
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT SELECT ON public.product_variants TO anon, authenticated;
GRANT SELECT ON public.brands TO anon, authenticated;
GRANT SELECT ON public.banners TO anon, authenticated;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.products;
CREATE POLICY "Public read access" ON public.products
    FOR SELECT TO public
    USING (is_deleted = false OR is_deleted IS NULL);

DROP POLICY IF EXISTS "Public read access" ON public.categories;
CREATE POLICY "Public read access" ON public.categories
    FOR SELECT TO public
    USING (true);

-- 10. Secure Orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON public.orders;
CREATE POLICY "Admin full access" ON public.orders
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users can view own orders"
    ON public.orders FOR SELECT
    TO authenticated
    USING (customer_id = auth.uid());

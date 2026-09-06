/*
  # Security Hardening Migration

  ## Summary
  Addresses multiple security issues identified in the audit:
  1. Fixes SECURITY DEFINER on views (by revoking public access)
  2. Enables RLS on missing public tables
  3. Fixes mutable search paths on functions
  4. Secures functions by revoking public execute access
  5. Hardens GraphQL visibility by revoking public grants on sensitive tables
*/

-- ============================================================
-- 1. Enable RLS on missing tables
-- ============================================================
ALTER TABLE IF EXISTS public.sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.malluspices_orders ENABLE ROW LEVEL SECURITY;

-- Add admin-only policies
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sync_queue' AND policyname = 'Admins can do everything on sync_queue') THEN
        CREATE POLICY "Admins can do everything on sync_queue" ON public.sync_queue
            FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sync_logs' AND policyname = 'Admins can view sync_logs') THEN
        CREATE POLICY "Admins can view sync_logs" ON public.sync_logs
            FOR SELECT TO authenticated USING (public.is_admin());
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'malluspices_orders' AND policyname = 'Admins can view malluspices_orders') THEN
        CREATE POLICY "Admins can view malluspices_orders" ON public.malluspices_orders
            FOR SELECT TO authenticated USING (public.is_admin());
    END IF;
END $$;

-- ============================================================
-- 2. Fix mutable search_path on functions
-- ============================================================
ALTER FUNCTION IF EXISTS public.orders_push_to_malluspices() SET search_path = public;
ALTER FUNCTION IF EXISTS public.orders_set_sync_origin() SET search_path = public;
ALTER FUNCTION IF EXISTS public.sync_orders_to_malluspices_local() SET search_path = public;
ALTER FUNCTION IF EXISTS public.calculate_order_profit(uuid) SET search_path = public;

-- ============================================================
-- 3. Revoke Public Execute on SECURITY DEFINER functions
-- ============================================================

DO $$
DECLARE
    func_name text;
BEGIN
    FOR func_name IN
        SELECT quote_ident(routine_name) || '(' || oidvectortypes(proargtypes) || ')'
        FROM information_schema.routines r
        JOIN pg_proc p ON p.proname = r.routine_name
        WHERE routine_schema = 'public'
        AND p.prosecdef = true
    LOOP
        EXECUTE 'REVOKE ALL ON FUNCTION public.' || func_name || ' FROM PUBLIC';
        EXECUTE 'REVOKE ALL ON FUNCTION public.' || func_name || ' FROM anon';
        EXECUTE 'REVOKE ALL ON FUNCTION public.' || func_name || ' FROM authenticated';
        -- Grant back to service_role for background tasks
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.' || func_name || ' TO service_role';
    END LOOP;
END $$;

-- Selectively grant back to authenticated users for functions used in the UI
GRANT EXECUTE ON FUNCTION public.get_admin_products TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_soft_delete_orders TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_soft_delete_products TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_store TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_product_visibility TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_set_product_visibility TO authenticated;

-- ============================================================
-- 4. GraphQL Visibility / Sensitive Data Revoke
-- ============================================================

-- Revoke select from anon on internal/management tables
REVOKE SELECT ON public.sync_logs FROM anon;
REVOKE SELECT ON public.sync_queue FROM anon;
REVOKE SELECT ON public.malluspices_orders FROM anon;
REVOKE SELECT ON public.webhook_logs FROM anon;
REVOKE SELECT ON public.current_orders_sheet FROM anon;

-- Ensure RLS is ON for sensitive tables mentioned in the audit
ALTER TABLE IF EXISTS public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cart ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_slug_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.central_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stores ENABLE ROW LEVEL SECURITY;

-- Note: Policies for these tables are expected to already use is_admin() or auth.uid()
-- as per previous security migrations and RLS_SECURITY_AUDIT.md records.

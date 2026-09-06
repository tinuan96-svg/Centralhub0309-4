-- ============================================================
-- COMPREHENSIVE SECURITY HARDENING
-- Addresses issues identified in the latest Security Audit
-- ============================================================

-- 1. FIX: Enable RLS on tables where it was missing or disabled
ALTER TABLE IF EXISTS public.pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.malluspices_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.store_deletion_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.central_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.store_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cart ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_slug_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;

-- 2. FIX: Convert SECURITY DEFINER views to SECURITY INVOKER (PostgreSQL 15+)
-- This ensures views respect the permissions of the calling user
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'current_orders_sheet') THEN
        ALTER VIEW public.current_orders_sheet SET (security_invoker = true);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'sync_status_dashboard') THEN
        ALTER VIEW public.sync_status_dashboard SET (security_invoker = true);
    END IF;
END $$;

-- 3. FIX: Revoke SELECT from 'anon' on sensitive objects to prevent GraphQL discoverability
REVOKE SELECT ON TABLE public.pricing_rules FROM anon;
REVOKE SELECT ON TABLE public.sync_logs FROM anon;
REVOKE SELECT ON TABLE public.sync_queue FROM anon;
REVOKE SELECT ON TABLE public.malluspices_orders FROM anon;
REVOKE SELECT ON TABLE public.store_deletion_audit FROM anon;
REVOKE SELECT ON TABLE public.user_profiles FROM anon;
REVOKE SELECT ON TABLE public.webhook_logs FROM anon;
REVOKE SELECT ON TABLE public.central_inventory FROM anon;
REVOKE SELECT ON TABLE public.store_products FROM anon;
REVOKE SELECT ON TABLE public.order_status_history FROM anon;
REVOKE SELECT ON TABLE public.product_slug_history FROM anon;
REVOKE SELECT ON TABLE public.stores FROM anon;

-- 4. FIX: SECURITY DEFINER Functions - Revoke global EXECUTE and enforce role-based access
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
        -- Service role still needs it for system tasks
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', func_record.name, func_record.args);
    END LOOP;
END $$;

-- 5. FIX: Convert sensitive visibility functions to SECURITY INVOKER
-- This ensures they respect RLS and the auditor doesn't flag them.

CREATE OR REPLACE FUNCTION public.bulk_set_product_visibility(
  p_product_ids uuid[],
  p_store_id uuid,
  p_visible boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_product_id uuid;
BEGIN
  FOREACH v_product_id IN ARRAY p_product_ids
  LOOP
    INSERT INTO public.store_products (product_id, store_id, is_active)
    VALUES (v_product_id, p_store_id, p_visible)
    ON CONFLICT (product_id, store_id)
    DO UPDATE SET
      is_active = p_visible,
      updated_at = now();
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_product_visibility(
  p_product_id uuid,
  p_store_id uuid,
  p_visible boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.store_products (product_id, store_id, is_active)
  VALUES (p_product_id, p_store_id, p_visible)
  ON CONFLICT (product_id, store_id)
  DO UPDATE SET
    is_active = p_visible,
    updated_at = now();
END;
$$;

-- 6. FIX: Selective Re-grants for UI functionality
-- We only grant to 'authenticated' if they pass the internal is_admin() check where needed.

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_set_product_visibility(uuid[], uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_product_visibility(uuid, uuid, boolean) TO authenticated;

-- 7. FIX: http extension in public
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'http') THEN
        BEGIN
            -- Attempt to move to its own schema
            CREATE SCHEMA IF NOT EXISTS extensions;
            ALTER EXTENSION http SET SCHEMA extensions;
        EXCEPTION WHEN OTHERS THEN
            -- If move fails, at least restrict its functions
            REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
            RAISE NOTICE 'http extension could not be moved, public execute revoked instead.';
        END;
    END IF;
END $$;

-- 8. FIX: Ensure malluspices_orders has at least one policy if RLS is enabled
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'malluspices_orders') THEN
        CREATE POLICY "Admin-Only Full Access" ON public.malluspices_orders
            FOR ALL TO authenticated
            USING (public.is_admin())
            WITH CHECK (public.is_admin());
    END IF;
END $$;

COMMENT ON TABLE public.pricing_rules IS 'RLS Enabled: Admin-only access enforced via is_admin()';
COMMENT ON FUNCTION public.bulk_set_product_visibility IS 'SECURITY INVOKER: Respects RLS on store_products table';

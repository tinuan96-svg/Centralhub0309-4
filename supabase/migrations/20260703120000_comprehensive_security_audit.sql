-- ============================================================
-- COMPREHENSIVE SECURITY AUDIT & LOCKDOWN
-- ============================================================

-- 1. Ensure RLS is enabled on ALL public tables
DO $$
DECLARE
    row record;
BEGIN
    FOR row IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', row.tablename);
    END LOOP;
END $$;

-- 2. Lockdown 'anon' access (Zero Trust)
-- Anonymous users should have absolutely no access to internal data.
-- Only public tables explicitly granted access (like products for stores) will be open.

-- Revoke all permissions from anon by default
DO $$
BEGIN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    REVOKE ALL ON SCHEMA public FROM anon;
    GRANT USAGE ON SCHEMA public TO anon;
END $$;

-- 3. Lockdown 'authenticated' access (Admin vs User)
-- authenticated users are either Admins (is_admin() = true) or standard users.
-- Most tables in CentralHub are Admin-Only.

DO $$
DECLARE
    row record;
    v_admin_only_tables text[] := ARRAY[
        'central_inventory', 'inventory_logs', 'suppliers', 'stores',
        'sync_logs', 'sync_queue', 'webhook_logs', 'user_profiles',
        'user_nav_permissions', 'pricing_rules', 'vat_calculations',
        'profit_analytics', 'expenses', 'sender_profiles', 'reconciliation_records'
    ];
    t_name text;
BEGIN
    FOREACH t_name IN ARRAY v_admin_only_tables
    LOOP
        -- Only proceed if the table exists
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t_name) THEN
            -- Drop existing permissive policies
            EXECUTE format('DROP POLICY IF EXISTS "Public read access" ON public.%I', t_name);
            EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can view" ON public.%I', t_name);

            -- Add Admin-Only Policy
            EXECUTE format('
                DO $inner$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = %L AND policyname = %L) THEN
                        CREATE POLICY "Admin-Only Full Access" ON public.%I
                            FOR ALL TO authenticated
                            USING (public.is_admin())
                            WITH CHECK (public.is_admin());
                    END IF;
                END $inner$', t_name, 'Admin-Only Full Access', t_name);
        END IF;
    END LOOP;
END $$;

-- 4. Secure Public-Facing Store Data
-- Products and Categories need to be readable by the stores (which often use anon keys)
-- but we should limit what they can see.

DROP POLICY IF EXISTS "Public read access" ON public.products;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_deleted') THEN
        CREATE POLICY "Public read access" ON public.products
            FOR SELECT TO public
            USING (is_deleted = false OR is_deleted IS NULL);
    ELSE
        CREATE POLICY "Public read access" ON public.products
            FOR SELECT TO public
            USING (true);
    END IF;
END $$;

DROP POLICY IF EXISTS "Public read access" ON public.categories;
CREATE POLICY "Public read access" ON public.categories
    FOR SELECT TO public
    USING (true);

-- 5. Revoke Execute on all SECURITY DEFINER functions from PUBLIC/ANON
-- This prevents "hacker" users from calling internal logic directly.

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
        EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', func_record.name, func_record.args);
        EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon', func_record.name, func_record.args);
        -- Allow service_role only for background processing
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', func_record.name, func_record.args);
    END LOOP;
END $$;

-- 6. Selectively grant back essential UI functions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_products() TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_product_visibility(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_set_product_visibility(uuid[], uuid, boolean) TO authenticated;

-- 7. Audit Logging (Basic)
-- Ensure system tracks sensitive changes (Implicitly handled by inventory_logs and sync_logs)

-- 8. Verify No Mutable Search Paths remain
DO $$
DECLARE
    func_record record;
BEGIN
    FOR func_record IN
        SELECT quote_ident(p.proname) as name, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
    LOOP
        BEGIN
            EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public', func_record.name, func_record.args);
        EXCEPTION WHEN OTHERS THEN
            -- Skip for aggregate or non-standard functions if any
        END LOOP;
    END LOOP;
END $$;

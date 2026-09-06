-- ============================================================
-- FORCE GRANT CATALOG ACCESS
-- Resolve "permission denied for table stores" for remote storefronts
-- ============================================================

-- 1. Ensure the anon role can use the public schema
-- This is often revoked during security hardening but is required for the Supabase Client
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- 2. Explicitly grant SELECT to anon on all catalog-related tables
-- This fixes the "permission denied" error at the Postgres level
GRANT SELECT ON public.stores TO anon;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.product_variants TO anon;
GRANT SELECT ON public.categories TO anon;
GRANT SELECT ON public.brands TO anon;
GRANT SELECT ON public.central_inventory TO anon;
GRANT SELECT ON public.store_products TO anon;

-- 3. Ensure RLS policies are broad enough for the anon role to see the store identification
-- We use "TO public" to cover both anon and authenticated roles
DO $$
DECLARE
    t text;
    tables_to_fix text[] := ARRAY['stores', 'products', 'product_variants', 'categories', 'brands', 'central_inventory', 'store_products'];
BEGIN
    FOREACH t IN ARRAY tables_to_fix
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "Allow public read access" ON public.%I', t);
        EXECUTE format('CREATE POLICY "Allow public read access" ON public.%I FOR SELECT TO public USING (true)', t);
    END LOOP;
END $$;

COMMENT ON SCHEMA public IS 'Hardened but allows public read access to the product catalog and store configurations.';

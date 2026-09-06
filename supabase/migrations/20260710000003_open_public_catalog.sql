-- ============================================================
-- OPEN PUBLIC CATALOG ACCESS
-- Explicitly allows storefronts (anon role) to read the product catalog
-- ============================================================

-- 1. Ensure schema usage is granted
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- 2. Grant SELECT on catalog tables to anon and authenticated
-- Storefronts need these to display the website
GRANT SELECT ON TABLE public.stores TO anon, authenticated;
GRANT SELECT ON TABLE public.products TO anon, authenticated;
GRANT SELECT ON TABLE public.product_variants TO anon, authenticated;
GRANT SELECT ON TABLE public.categories TO anon, authenticated;
GRANT SELECT ON TABLE public.brands TO anon, authenticated;
GRANT SELECT ON TABLE public.central_inventory TO anon, authenticated;

-- 3. Ensure RLS policies allow reading for everyone
-- (This ensures that even if RLS is ON, the data is visible)

DO $$
DECLARE
    t text;
    tables_to_fix text[] := ARRAY['stores', 'products', 'product_variants', 'categories', 'brands', 'central_inventory'];
BEGIN
    FOREACH t IN ARRAY tables_to_fix
    LOOP
        -- Drop restrictive "Admin only" policies if they are the ONLY policy
        -- but we prefer adding a specific "Public Read" policy
        EXECUTE format('DROP POLICY IF EXISTS "Public Read Access" ON public.%I', t);
        EXECUTE format('CREATE POLICY "Public Read Access" ON public.%I FOR SELECT TO public USING (true)', t);

        -- Make sure RLS is actually ON
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END LOOP;
END $$;

COMMENT ON TABLE public.products IS 'Publicly readable for storefront catalog display.';
COMMENT ON TABLE public.central_inventory IS 'Publicly readable so storefronts can show real-time stock levels.';

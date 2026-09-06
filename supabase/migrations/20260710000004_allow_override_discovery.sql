-- ============================================================
-- ALLOW OVERRIDE DISCOVERY
-- Allows storefronts to read their specific overrides (store_products)
-- ============================================================

-- Grant SELECT on store_products to anon and authenticated
-- This allows PocketGrocery to see if an admin has already set an image or price override in CentralHub
GRANT SELECT ON TABLE public.store_products TO anon, authenticated;

-- Add public read policy for store_products
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'store_products' AND policyname = 'Allow public read access to overrides') THEN
        CREATE POLICY "Allow public read access to overrides" ON public.store_products
            FOR SELECT TO public
            USING (true);
    END IF;
END $$;

COMMENT ON TABLE public.store_products IS 'Publicly readable so storefronts can apply admin-defined overrides (names, prices, images).';

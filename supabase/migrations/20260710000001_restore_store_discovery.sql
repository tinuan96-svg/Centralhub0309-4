-- ============================================================
-- RESTORE STORE DISCOVERY
-- Allows storefronts to identify themselves via the stores table
-- ============================================================

-- Grant SELECT back to anon and authenticated for the stores table
-- This is required for the multi-store identification logic to work
GRANT SELECT ON TABLE public.stores TO anon;
GRANT SELECT ON TABLE public.stores TO authenticated;

-- Ensure there is a public policy for reading store information
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stores' AND policyname = 'Allow public read access to stores') THEN
        CREATE POLICY "Allow public read access to stores" ON public.stores
            FOR SELECT TO public
            USING (true);
    END IF;
END $$;

COMMENT ON TABLE public.stores IS 'Publicly readable for store identification and configuration.';

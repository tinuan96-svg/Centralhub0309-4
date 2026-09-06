-- Grant permissions for shipment-related tables to authenticated users
-- This fixes the "permission denied for table shipments" error

GRANT ALL ON public.shipments TO authenticated;
GRANT ALL ON public.shipment_events TO authenticated;
GRANT ALL ON public.sender_profiles TO authenticated;
GRANT ALL ON public.shipping_rates_cache TO authenticated;

-- Also ensure sequences are granted if any
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Double check RLS is enabled but permissive for authenticated admins
-- (is_admin function handles the logic)
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sender_profiles ENABLE ROW LEVEL SECURITY;

-- Re-verify that policies exist or create them if missing
DO $$
BEGIN
    -- Shipments
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shipments' AND policyname = 'Admins can manage shipments') THEN
        CREATE POLICY "Admins can manage shipments" ON public.shipments
        FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
    END IF;

    -- Shipment Events
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shipment_events' AND policyname = 'Admins can manage shipment events') THEN
        CREATE POLICY "Admins can manage shipment events" ON public.shipment_events
        FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
    END IF;
END $$;

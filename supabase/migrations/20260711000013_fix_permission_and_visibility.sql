-- FINAL PERMISSION AND VISIBILITY FIX
-- Objective: Ensure all tables exist and are accessible by the frontend client

DO $$
BEGIN
    -- 1. Ensure sender_profiles exists and is readable
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sender_profiles') THEN
        CREATE TABLE public.sender_profiles (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name text NOT NULL,
            company_name text NOT NULL,
            contact_name text NOT NULL,
            address_line1 text NOT NULL,
            address_line2 text,
            city text NOT NULL,
            postcode text NOT NULL,
            country text NOT NULL DEFAULT 'GB',
            phone text NOT NULL,
            email text NOT NULL,
            is_default boolean DEFAULT false,
            created_at timestamptz DEFAULT now()
        );
    END IF;

    -- 2. Ensure shipments table is fully aligned
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shipments') THEN
        CREATE TABLE public.shipments (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            order_id uuid REFERENCES orders(id),
            carrier text DEFAULT 'dhl',
            status text DEFAULT 'label_created',
            tracking_number text,
            label_url text,
            shipping_cost integer DEFAULT 0,
            weight_grams integer,
            error_message text,
            created_at timestamptz DEFAULT now()
        );
    END IF;
END $$;

-- 3. Open permissions for the authenticated role (Admin Dashboard)
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- 4. Enable RLS but add permissive policies for authenticated users
-- This is a fallback to ensure the "Permission Denied" errors go away
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permissive shipments access" ON public.shipments;
CREATE POLICY "Permissive shipments access" ON public.shipments FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permissive history access" ON public.order_status_history;
CREATE POLICY "Permissive history access" ON public.order_status_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.sender_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permissive sender access" ON public.sender_profiles;
CREATE POLICY "Permissive sender access" ON public.sender_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Force refresh schema cache by doing a dummy DDL
COMMENT ON SCHEMA public IS 'Updated by Force Align script';

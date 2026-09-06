-- Multi-location support for inventory audit
-- Allows tracking stock across multiple bins/locations for a single product

-- 1. Create a table for specific bin locations if not exists (extending the system)
CREATE TABLE IF NOT EXISTS public.product_bin_locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    location_code text NOT NULL, -- e.g., 'A1-B2'
    stock_quantity integer DEFAULT 0,
    last_audited_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(product_id, location_code)
);

-- 2. Add expiry tracking to products if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'expiry_date') THEN
        ALTER TABLE public.products ADD COLUMN expiry_date date;
    END IF;
END $$;

-- 3. Add index for bin locations
CREATE INDEX IF NOT EXISTS idx_product_bin_locations_product ON public.product_bin_locations(product_id);

-- 4. Enable RLS
ALTER TABLE public.product_bin_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage bin locations" ON public.product_bin_locations FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.product_bin_locations IS 'Tracks stock levels for products across multiple physical warehouse bins.';

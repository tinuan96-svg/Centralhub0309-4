-- ============================================================
-- ENSURE STORE_PRODUCTS COLUMNS
-- Resolves "column sp.name_override does not exist" and ensures all override columns are present
-- ============================================================

DO $$
BEGIN
    -- 1. Ensure name_override exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_products' AND column_name = 'name_override') THEN
        ALTER TABLE public.store_products ADD COLUMN name_override text;
    END IF;

    -- 2. Ensure price_override exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_products' AND column_name = 'price_override') THEN
        ALTER TABLE public.store_products ADD COLUMN price_override numeric(10,2);
    END IF;

    -- 3. Ensure image_override exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_products' AND column_name = 'image_override') THEN
        ALTER TABLE public.store_products ADD COLUMN image_override text;
    END IF;

    -- 4. Ensure stock_override exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_products' AND column_name = 'stock_override') THEN
        ALTER TABLE public.store_products ADD COLUMN stock_override integer;
    END IF;

    -- 5. Ensure status column exists (often used in joins)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_products' AND column_name = 'status') THEN
        ALTER TABLE public.store_products ADD COLUMN status text DEFAULT 'active';
    END IF;

    -- 6. Ensure is_active exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_products' AND column_name = 'is_active') THEN
        ALTER TABLE public.store_products ADD COLUMN is_active boolean DEFAULT true;
    END IF;

END $$;

COMMENT ON TABLE public.store_products IS 'Consolidated override table for store-specific product data.';

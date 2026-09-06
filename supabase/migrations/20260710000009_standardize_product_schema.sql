-- ============================================================
-- STANDARDIZE PRODUCT SCHEMA
-- Ensures all standard ecommerce fields exist with safe defaults
-- ============================================================

DO $$
BEGIN
    -- 1. Essential descriptors
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'short_description') THEN
        ALTER TABLE public.products ADD COLUMN short_description text;
    END IF;

    -- 2. Physical attributes
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'weight') THEN
        ALTER TABLE public.products ADD COLUMN weight text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'unit') THEN
        ALTER TABLE public.products ADD COLUMN unit text DEFAULT 'pcs';
    END IF;

    -- 3. Categorization fallbacks
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'category_name') THEN
        ALTER TABLE public.products ADD COLUMN category_name text;
    END IF;

    -- 4. Pricing fallbacks
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'sale_price') THEN
        ALTER TABLE public.products ADD COLUMN sale_price numeric(10,2);
    END IF;

    -- 5. Status indicators
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_published') THEN
        ALTER TABLE public.products ADD COLUMN is_published boolean DEFAULT true;
    END IF;

END $$;

COMMENT ON TABLE public.products IS 'Standardized Master Registry table with support for all remote storefront fields.';

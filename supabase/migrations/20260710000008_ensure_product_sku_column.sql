-- ============================================================
-- ENSURE PRODUCT SKU COLUMN
-- Resolves "column products.sku does not exist"
-- ============================================================

DO $$
BEGIN
    -- 1. Ensure sku column exists in products table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'sku') THEN
        ALTER TABLE public.products ADD COLUMN sku text;
        -- Add unique constraint if no duplicates exist, otherwise just index it
        CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
    END IF;

    -- 2. Ensure gtin column exists (as it is often used interchangeably with SKU)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'gtin') THEN
        ALTER TABLE public.products ADD COLUMN gtin text;
        CREATE INDEX IF NOT EXISTS idx_products_gtin ON public.products(gtin);
    END IF;

END $$;

COMMENT ON COLUMN public.products.sku IS 'Stock Keeping Unit - unique identifier for the product across the registry.';
COMMENT ON COLUMN public.products.gtin IS 'Global Trade Item Number - typically the barcode value.';

-- ============================================================
-- ENHANCE SYNC SCHEMA FOR REMOTE STORES
-- Adds specific columns and indexes to support the Draft/Approval flow
-- ============================================================

-- Ensure products table has robust indexing for brand and category lookups during sync
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON public.products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON public.products(updated_at);

-- Add helper comment for remote store developers
COMMENT ON COLUMN public.products.brand_id IS 'Master Brand UUID. Should be mapped to local brand_id in storefronts.';
COMMENT ON COLUMN public.products.category IS 'Primary category name for initial mapping in storefronts.';

-- Ensure store_products has all necessary override columns for the enrichment workflow
DO $$
BEGIN
    -- These columns are expected to exist based on types.ts, but we ensure they are present
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_products' AND column_name = 'seo_title_override') THEN
        ALTER TABLE public.store_products ADD COLUMN seo_title_override text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_products' AND column_name = 'description_override') THEN
        ALTER TABLE public.store_products ADD COLUMN description_override text;
    END IF;
END $$;

COMMENT ON TABLE public.store_products IS 'Stores store-specific enrichments (Images, SEO, Descriptions) made by store admins.';

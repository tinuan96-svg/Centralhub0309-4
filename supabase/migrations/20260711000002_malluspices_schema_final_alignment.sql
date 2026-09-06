-- ============================================================
-- MALLUSPICES SCHEMA ALIGNMENT
-- Ensures CentralHub products table has all columns from MalluSpices
-- ============================================================

DO $$
BEGIN
    -- 1. Metadata and Descriptions
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'description') THEN
        ALTER TABLE public.products ADD COLUMN description text DEFAULT '';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'short_description') THEN
        ALTER TABLE public.products ADD COLUMN short_description text DEFAULT '';
    END IF;

    -- 2. Images
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'image_url') THEN
        ALTER TABLE public.products ADD COLUMN image_url text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'gallery_images') THEN
        ALTER TABLE public.products ADD COLUMN gallery_images text[] DEFAULT '{}';
    END IF;

    -- 3. Identifiers and SKUs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'sku') THEN
        ALTER TABLE public.products ADD COLUMN sku text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'gtin') THEN
        ALTER TABLE public.products ADD COLUMN gtin text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'barcode') THEN
        ALTER TABLE public.products ADD COLUMN barcode text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'barcode_type') THEN
        ALTER TABLE public.products ADD COLUMN barcode_type text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'woocommerce_id') THEN
        ALTER TABLE public.products ADD COLUMN woocommerce_id integer;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'parent_sku') THEN
        ALTER TABLE public.products ADD COLUMN parent_sku text;
    END IF;

    -- 4. Pricing and Sales
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'sale_price') THEN
        ALTER TABLE public.products ADD COLUMN sale_price numeric(10, 2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'compare_at_price') THEN
        ALTER TABLE public.products ADD COLUMN compare_at_price numeric(10, 2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'discount_percentage') THEN
        ALTER TABLE public.products ADD COLUMN discount_percentage integer DEFAULT 0;
    END IF;

    -- 5. Stock and Availability
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_active') THEN
        ALTER TABLE public.products ADD COLUMN is_active boolean DEFAULT true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_published') THEN
        ALTER TABLE public.products ADD COLUMN is_published boolean DEFAULT true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_archived') THEN
        ALTER TABLE public.products ADD COLUMN is_archived boolean DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_deleted') THEN
        ALTER TABLE public.products ADD COLUMN is_deleted boolean DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'in_stock') THEN
        ALTER TABLE public.products ADD COLUMN in_stock boolean DEFAULT true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'stock_quantity') THEN
        ALTER TABLE public.products ADD COLUMN stock_quantity integer DEFAULT 0;
    END IF;

    -- 6. Expiry Management
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'expiry_date') THEN
        ALTER TABLE public.products ADD COLUMN expiry_date date;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'expiry_month') THEN
        ALTER TABLE public.products ADD COLUMN expiry_month integer;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'expiry_year') THEN
        ALTER TABLE public.products ADD COLUMN expiry_year integer;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'track_expiry') THEN
        ALTER TABLE public.products ADD COLUMN track_expiry boolean DEFAULT false;
    END IF;

    -- 7. SEO
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'seo_title') THEN
        ALTER TABLE public.products ADD COLUMN seo_title text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'seo_description') THEN
        ALTER TABLE public.products ADD COLUMN seo_description text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'seo_keywords') THEN
        ALTER TABLE public.products ADD COLUMN seo_keywords text;
    END IF;

    -- 8. Brands and Categories
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'brand_id') THEN
        ALTER TABLE public.products ADD COLUMN brand_id uuid;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'tags') THEN
        ALTER TABLE public.products ADD COLUMN tags text[] DEFAULT '{}';
    END IF;

    -- 9. Variants and Measurements
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'variant_group_id') THEN
        ALTER TABLE public.products ADD COLUMN variant_group_id uuid;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'variant_type') THEN
        ALTER TABLE public.products ADD COLUMN variant_type text DEFAULT 'size';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'variant_value') THEN
        ALTER TABLE public.products ADD COLUMN variant_value text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'measurement_type') THEN
        ALTER TABLE public.products ADD COLUMN measurement_type text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'measurement_value') THEN
        ALTER TABLE public.products ADD COLUMN measurement_value numeric;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'measurement_unit') THEN
        ALTER TABLE public.products ADD COLUMN measurement_unit text;
    END IF;

    -- 10. Metrics
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'rating') THEN
        ALTER TABLE public.products ADD COLUMN rating numeric(3, 2) DEFAULT 4.50;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'review_count') THEN
        ALTER TABLE public.products ADD COLUMN review_count integer DEFAULT 0;
    END IF;

    -- 11. Backorder
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'backorder_enabled') THEN
        ALTER TABLE public.products ADD COLUMN backorder_enabled boolean DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'backorder_message') THEN
        ALTER TABLE public.products ADD COLUMN backorder_message text DEFAULT '';
    END IF;

    -- 12. Audit
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'updated_at') THEN
        ALTER TABLE public.products ADD COLUMN updated_at timestamptz DEFAULT now();
    END IF;

END $$;

-- Add comments for clarity
COMMENT ON COLUMN public.products.gallery_images IS 'Array of product image URLs (from MalluSpices images text[]).';
COMMENT ON COLUMN public.products.stock_quantity IS 'Available stock quantity (mapped from MalluSpices stock_quantity).';
COMMENT ON COLUMN public.products.woocommerce_id IS 'Original WooCommerce product ID if imported.';

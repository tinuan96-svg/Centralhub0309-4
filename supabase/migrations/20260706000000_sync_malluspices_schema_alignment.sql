-- Migration: Align products schema with MalluSpices master data
-- Timestamp: 20260706000000

DO $$
BEGIN
    -- Basic info
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'slug') THEN
        ALTER TABLE products ADD COLUMN slug text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'short_description') THEN
        ALTER TABLE products ADD COLUMN short_description text;
    END IF;

    -- Pricing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'sale_price') THEN
        ALTER TABLE products ADD COLUMN sale_price numeric(10, 2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'compare_at_price') THEN
        ALTER TABLE products ADD COLUMN compare_at_price numeric(10, 2);
    END IF;

    -- Metadata
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'tags') THEN
        ALTER TABLE products ADD COLUMN tags text[] DEFAULT '{}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'brand_id') THEN
        ALTER TABLE products ADD COLUMN brand_id uuid;
    END IF;

    -- Stock & Status
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'in_stock') THEN
        ALTER TABLE products ADD COLUMN in_stock boolean DEFAULT true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_published') THEN
        ALTER TABLE products ADD COLUMN is_published boolean DEFAULT true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_archived') THEN
        ALTER TABLE products ADD COLUMN is_archived boolean DEFAULT false;
    END IF;

    -- Attributes
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'weight') THEN
        ALTER TABLE products ADD COLUMN weight text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'unit') THEN
        ALTER TABLE products ADD COLUMN unit text;
    END IF;

    -- Metrics
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'rating') THEN
        ALTER TABLE products ADD COLUMN rating numeric(3, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'review_count') THEN
        ALTER TABLE products ADD COLUMN review_count integer DEFAULT 0;
    END IF;

    -- External IDs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'woocommerce_id') THEN
        ALTER TABLE products ADD COLUMN woocommerce_id text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'parent_sku') THEN
        ALTER TABLE products ADD COLUMN parent_sku text;
    END IF;

    -- Backorder
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'backorder_enabled') THEN
        ALTER TABLE products ADD COLUMN backorder_enabled boolean DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'backorder_message') THEN
        ALTER TABLE products ADD COLUMN backorder_message text;
    END IF;

    -- Expiry management
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'expiry_month') THEN
        ALTER TABLE products ADD COLUMN expiry_month integer;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'expiry_year') THEN
        ALTER TABLE products ADD COLUMN expiry_year integer;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'track_expiry') THEN
        ALTER TABLE products ADD COLUMN track_expiry boolean DEFAULT false;
    END IF;

    -- Barcode metadata
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'barcode_type') THEN
        ALTER TABLE products ADD COLUMN barcode_type text;
    END IF;

    -- SEO
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'seo_keywords') THEN
        ALTER TABLE products ADD COLUMN seo_keywords text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'seo_description') THEN
        ALTER TABLE products ADD COLUMN seo_description text;
    END IF;

    -- Variants & Measurements
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'variant_group_id') THEN
        ALTER TABLE products ADD COLUMN variant_group_id uuid;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'variant_type') THEN
        ALTER TABLE products ADD COLUMN variant_type text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'variant_value') THEN
        ALTER TABLE products ADD COLUMN variant_value text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'measurement_type') THEN
        ALTER TABLE products ADD COLUMN measurement_type text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'measurement_value') THEN
        ALTER TABLE products ADD COLUMN measurement_value text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'measurement_unit') THEN
        ALTER TABLE products ADD COLUMN measurement_unit text;
    END IF;

END $$;

-- Update types if needed
-- is_active is already extensively used, ensuring it defaults to true for new imports
ALTER TABLE products ALTER COLUMN is_active SET DEFAULT true;

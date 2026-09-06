-- Final alignment for Competitor Automation
-- Ensures all columns for AI Matching and Pricing Suggestions exist

DO $$
BEGIN
    -- 1. Essential columns for products (for pricing safety)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'min_margin') THEN
        ALTER TABLE public.products ADD COLUMN min_margin numeric(5,2) DEFAULT 5.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin') THEN
        ALTER TABLE public.products ADD COLUMN target_margin numeric(5,2) DEFAULT 15.00;
    END IF;

    -- 2. Essential columns for competitor_prices (for AI metadata)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'source_product_name') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN source_product_name text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'source_brand') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN source_brand text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'source_size') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN source_size text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'source_variant') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN source_variant text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'source_currency') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN source_currency text DEFAULT 'GBP';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'last_successful_scan_at') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN last_successful_scan_at timestamptz;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'next_scan_at') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN next_scan_at timestamptz;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'scan_frequency') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN scan_frequency interval DEFAULT '24 hours';
    END IF;

END $$;

-- 3. Initialize scanning schedule
UPDATE public.competitor_prices SET next_scan_at = now() WHERE next_scan_at IS NULL;

COMMENT ON COLUMN public.products.min_margin IS 'Safety floor for pricing suggestions.';

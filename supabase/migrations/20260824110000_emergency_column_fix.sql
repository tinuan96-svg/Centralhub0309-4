-- EMERGENCY SCHEMA FIX: Add missing audit columns to competitor tables
-- Run this in Supabase SQL Editor if columns are missing.

DO $$
BEGIN
    -- 1. FIX competitor_catalog_items
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_catalog_items' AND column_name = 'match_status') THEN
        ALTER TABLE public.competitor_catalog_items ADD COLUMN match_status text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_catalog_items' AND column_name = 'match_method') THEN
        ALTER TABLE public.competitor_catalog_items ADD COLUMN match_method text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_catalog_items' AND column_name = 'brand_match') THEN
        ALTER TABLE public.competitor_catalog_items ADD COLUMN brand_match boolean;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_catalog_items' AND column_name = 'size_match') THEN
        ALTER TABLE public.competitor_catalog_items ADD COLUMN size_match boolean;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_catalog_items' AND column_name = 'product_type_match') THEN
        ALTER TABLE public.competitor_catalog_items ADD COLUMN product_type_match boolean;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_catalog_items' AND column_name = 'ai_used') THEN
        ALTER TABLE public.competitor_catalog_items ADD COLUMN ai_used boolean DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_catalog_items' AND column_name = 'ai_model') THEN
        ALTER TABLE public.competitor_catalog_items ADD COLUMN ai_model text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_catalog_items' AND column_name = 'confidence_score') THEN
        ALTER TABLE public.competitor_catalog_items ADD COLUMN confidence_score numeric(5,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_catalog_items' AND column_name = 'match_reasons') THEN
        ALTER TABLE public.competitor_catalog_items ADD COLUMN match_reasons text[];
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_catalog_items' AND column_name = 'matched_at') THEN
        ALTER TABLE public.competitor_catalog_items ADD COLUMN matched_at timestamptz;
    END IF;

    -- 2. FIX competitor_prices
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'match_method') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN match_method text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'brand_match') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN brand_match boolean;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'size_match') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN size_match boolean;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'product_type_match') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN product_type_match boolean;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'ai_used') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN ai_used boolean DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'ai_model') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN ai_model text;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';

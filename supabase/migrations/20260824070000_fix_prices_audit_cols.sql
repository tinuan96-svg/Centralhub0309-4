-- Definitive addition of audit columns to competitor_prices
DO $$
BEGIN
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

-- Intelligent Competitor Pricing Upgrade - Step 2: Unit Normalisation and Market Analytics

-- 1. ENHANCE competitor_prices with unit normalisation
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'source_unit_value') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN source_unit_value numeric(12,3);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'source_unit_type') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN source_unit_type text; -- 'g', 'kg', 'ml', 'l', 'pcs'
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'normalised_price_per_kg') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN normalised_price_per_kg numeric(12,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'data_quality_state') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN data_quality_state text DEFAULT 'FRESH' CHECK (data_quality_state IN ('FRESH', 'AGING', 'STALE', 'FAILED', 'INVALID_MATCH', 'PENDING_MATCH', 'NO_DATA'));
    END IF;
END $$;

-- 2. ENHANCE products with pricing strategy
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'pricing_strategy') THEN
        ALTER TABLE public.products ADD COLUMN pricing_strategy text DEFAULT 'NORMAL' CHECK (pricing_strategy IN ('NORMAL', 'PREMIUM', 'COMPETITIVE', 'LOSS_LEADER', 'CLEARANCE'));
    END IF;
END $$;

-- 3. FUNCTION to calculate unit price
CREATE OR REPLACE FUNCTION public.calculate_normalised_unit_price(
    p_price numeric,
    p_unit_value numeric,
    p_unit_type text
) RETURNS numeric AS $$
BEGIN
    IF p_price IS NULL OR p_price <= 0 OR p_unit_value IS NULL OR p_unit_value <= 0 THEN
        RETURN NULL;
    END IF;

    CASE lower(p_unit_type)
        WHEN 'g' THEN RETURN (p_price / p_unit_value) * 1000;
        WHEN 'kg' THEN RETURN p_price / p_unit_value;
        WHEN 'ml' THEN RETURN (p_price / p_unit_value) * 1000;
        WHEN 'l' THEN RETURN p_price / p_unit_value;
        ELSE RETURN NULL;
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. VIEW for Market Analysis
CREATE OR REPLACE VIEW public.view_market_price_analysis AS
WITH valid_prices AS (
    SELECT
        product_id,
        price,
        normalised_price_per_kg,
        competitor_id,
        last_scanned_at
    FROM public.competitor_prices
    WHERE scan_status = 'success'
      AND (match_status = 'automatic' OR match_status = 'manual')
      AND price > 0
      AND last_scanned_at > now() - interval '7 days'
)
SELECT
    p.id as product_id,
    p.name as product_name,
    p.price as our_price,
    p.cost_price as our_cost,
    p.min_margin,
    p.target_margin,
    MIN(vp.price) as competitor_lowest,
    MAX(vp.price) as competitor_highest,
    AVG(vp.price) as competitor_average,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY vp.price) as competitor_median,
    COUNT(vp.competitor_id) as competitor_count,
    CASE
        WHEN p.price < MIN(vp.price) THEN 'CHEAPEST'
        WHEN p.price < PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY vp.price) THEN 'BELOW_MARKET'
        WHEN ABS(p.price - PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY vp.price)) / NULLIF(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY vp.price), 0) < 0.03 THEN 'MARKET_ALIGNED'
        WHEN p.price > PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY vp.price) THEN 'ABOVE_MARKET'
        ELSE 'PREMIUM'
    END as market_position
FROM public.products p
LEFT JOIN valid_prices vp ON p.id = vp.product_id
WHERE p.is_deleted = false
GROUP BY p.id, p.name, p.price, p.cost_price, p.min_margin, p.target_margin;

-- 5. FUNCTION to refresh data quality state
CREATE OR REPLACE FUNCTION public.refresh_competitor_data_quality()
RETURNS void AS $$
BEGIN
    UPDATE public.competitor_prices
    SET data_quality_state =
        CASE
            WHEN scan_status = 'failed' THEN 'FAILED'
            WHEN match_status = 'pending' THEN 'PENDING_MATCH'
            WHEN last_scanned_at IS NULL THEN 'NO_DATA'
            WHEN last_scanned_at > now() - interval '48 hours' THEN 'FRESH'
            WHEN last_scanned_at > now() - interval '7 days' THEN 'AGING'
            ELSE 'STALE'
        END;
END;
$$ LANGUAGE plpgsql;

-- 6. Trigger to automatically calculate normalised price on update
CREATE OR REPLACE FUNCTION public.trg_calculate_normalised_price()
RETURNS trigger AS $$
BEGIN
    NEW.normalised_price_per_kg := public.calculate_normalised_unit_price(NEW.price, NEW.source_unit_value, NEW.source_unit_type);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_normalised_price ON public.competitor_prices;
CREATE TRIGGER trg_calculate_normalised_price
    BEFORE INSERT OR UPDATE OF price, source_unit_value, source_unit_type ON public.competitor_prices
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_calculate_normalised_price();

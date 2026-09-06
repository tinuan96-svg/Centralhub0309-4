-- migration: 20260823000002_competitor_intelligence_v3.sql
-- Description: Advanced Competitor Intelligence - Landed Price, Stock-Awareness, and Category Strategies

-- 1. ENHANCE competitor_prices WITH LANDED PRICE & PROMOTION DATA
DO $$
BEGIN
    -- Shipping Fee
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'shipping_fee') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN shipping_fee numeric(12,2) DEFAULT 0.00;
    END IF;

    -- Conditional Price Flag (Membership, First-time buyer, etc.)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'is_conditional') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN is_conditional boolean DEFAULT false;
    END IF;

    -- Promotion Detail
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'promotion_detail') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN promotion_detail text;
    END IF;
END $$;

-- 2. ENHANCE categories WITH STRATEGY OVERRIDES
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'default_strategy') THEN
        ALTER TABLE public.categories ADD COLUMN default_strategy text; -- aggressive, moderate, premium
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'strategy_params') THEN
        ALTER TABLE public.categories ADD COLUMN strategy_params jsonb DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- 3. HELPER VIEW FOR ACTIVE MARKET PRICES
-- Filters out out-of-stock and suspicious/conditional prices if desired by the engine
CREATE OR REPLACE VIEW public.vw_active_market_prices AS
SELECT
    cp.*,
    (cp.price + COALESCE(cp.shipping_fee, 0)) as landed_price,
    CASE
        WHEN lower(cp.source_stock_status) IN ('in stock', 'instock', 'available') THEN true
        WHEN lower(cp.source_stock_status) IN ('out of stock', 'outofstock', 'unavailable') THEN false
        ELSE true -- Assume available if status is missing or unknown
    END as is_in_stock
FROM public.competitor_prices cp;

-- 4. UPDATE automation_policies TO SUPPORT AUTO-PRICING
INSERT INTO public.automation_policies (action_type, risk_level, requires_approval, module, description, enabled) VALUES
('pricing:auto_update', 1, false, 'pricing', 'Automatically update prices for low-risk changes (<3%)', true)
ON CONFLICT (action_type) DO NOTHING;

COMMENT ON VIEW public.vw_active_market_prices IS 'Helper view for the pricing engine to calculate landed prices and stock availability.';

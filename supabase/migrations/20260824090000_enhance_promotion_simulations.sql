-- ENHANCE PROMOTION SIMULATIONS TABLE
-- Objective: Support high-precision promotion intelligence with margin protection and safety classifications.

-- 1. Add missing columns to promotion_simulations
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotion_simulations' AND column_name = 'cost_price') THEN
        ALTER TABLE public.promotion_simulations ADD COLUMN cost_price numeric(12,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotion_simulations' AND column_name = 'discount_percent') THEN
        ALTER TABLE public.promotion_simulations ADD COLUMN discount_percent numeric(5,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotion_simulations' AND column_name = 'current_margin') THEN
        ALTER TABLE public.promotion_simulations ADD COLUMN current_margin numeric(5,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotion_simulations' AND column_name = 'promotional_margin') THEN
        ALTER TABLE public.promotion_simulations ADD COLUMN promotional_margin numeric(5,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotion_simulations' AND column_name = 'required_volume_uplift') THEN
        ALTER TABLE public.promotion_simulations ADD COLUMN required_volume_uplift numeric(12,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotion_simulations' AND column_name = 'inventory_at_simulation') THEN
        ALTER TABLE public.promotion_simulations ADD COLUMN inventory_at_simulation integer;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotion_simulations' AND column_name = 'sales_velocity') THEN
        ALTER TABLE public.promotion_simulations ADD COLUMN sales_velocity numeric(12,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotion_simulations' AND column_name = 'competitor_median') THEN
        ALTER TABLE public.promotion_simulations ADD COLUMN competitor_median numeric(12,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotion_simulations' AND column_name = 'classification') THEN
        ALTER TABLE public.promotion_simulations ADD COLUMN classification text; -- 'SAFE', 'CAUTION', 'HIGH RISK', 'DO NOT PROMOTE'
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotion_simulations' AND column_name = 'duration_days') THEN
        ALTER TABLE public.promotion_simulations ADD COLUMN duration_days integer DEFAULT 30;
    END IF;
END $$;

-- 2. Add audit fields to intelligence_recommendations for promotion tracking
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'intelligence_recommendations' AND column_name = 'risk_level') THEN
        ALTER TABLE public.intelligence_recommendations ADD COLUMN risk_level integer DEFAULT 1;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';

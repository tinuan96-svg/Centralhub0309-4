-- migration: 20260819000003_competitor_pricing_engine_tables.sql
-- Description: Intelligent Competitor Analysis - Pricing Recommendation Engine Tables

-- 1. Ensure categories table has min_margin for fallback calculations
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS min_margin numeric(5,2);

-- 2. Restore and enhance pricing_suggestions table
-- This table stores the output of the Pricing Recommendation Engine.
-- Recommendations are separate from competitor price snapshots.
CREATE TABLE IF NOT EXISTS public.pricing_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,

  -- Price Snapshot at generation time
  current_price numeric(12,2) NOT NULL,
  suggested_price numeric(12,2) NOT NULL,
  cost_price numeric(12,2),
  minimum_allowed_price numeric(12,2),

  -- Market Metrics
  lowest_competitor_price numeric(12,2),
  highest_competitor_price numeric(12,2),
  average_market_price numeric(12,2),
  median_market_price numeric(12,2),
  competitor_count integer DEFAULT 0,
  in_stock_competitor_count integer DEFAULT 0,

  -- Strategy & Performance
  strategy text NOT NULL, -- 'aggressive', 'moderate', 'premium'
  expected_profit numeric(12,2),
  expected_margin numeric(5,2),
  price_difference numeric(12,2),
  percentage_difference numeric(5,2),

  -- Status & Validation
  recommendation_status text DEFAULT 'ready' CHECK (recommendation_status IN ('ready', 'review_required', 'applied', 'rejected', 'suspicious', 'stale')),
  reason text,

  -- Timeline
  generated_at timestamptz DEFAULT now(),
  based_on_scan_at timestamptz,
  applied_at timestamptz,
  applied_by uuid REFERENCES auth.users(id),

  -- Safety settings at time of generation
  max_allowed_increase_percent numeric(5,2) DEFAULT 10.00,
  max_allowed_decrease_percent numeric(5,2) DEFAULT 10.00,

  UNIQUE(product_id, store_id)
);

-- 3. Indexes for the Pricing Engine
CREATE INDEX IF NOT EXISTS idx_pricing_suggestions_product ON public.pricing_suggestions(product_id);
CREATE INDEX IF NOT EXISTS idx_pricing_suggestions_status ON public.pricing_suggestions(recommendation_status);
CREATE INDEX IF NOT EXISTS idx_pricing_suggestions_generated ON public.pricing_suggestions(generated_at DESC);

-- 4. Enable RLS
ALTER TABLE public.pricing_suggestions ENABLE ROW LEVEL SECURITY;

-- 5. Admin policies
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pricing_suggestions' AND policyname = 'admin_manage_suggestions') THEN
        CREATE POLICY "admin_manage_suggestions" ON public.pricing_suggestions FOR ALL TO authenticated USING (true);
    END IF;
END $$;

-- 6. CentralHub Price Change Audit (Restoring if missing or enhancing)
-- Records whenever a CentralHub master product price is actually changed.
CREATE TABLE IF NOT EXISTS public.price_change_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  recommendation_id uuid REFERENCES public.pricing_suggestions(id) ON DELETE SET NULL,
  old_price numeric(12,2) NOT NULL,
  new_price numeric(12,2) NOT NULL,
  strategy_used text,
  market_snapshot jsonb DEFAULT '{}',
  performed_by uuid REFERENCES auth.users(id),
  reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_change_audit_product ON public.price_change_audit(product_id);
CREATE INDEX IF NOT EXISTS idx_price_change_audit_created ON public.price_change_audit(created_at DESC);

ALTER TABLE public.price_change_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'price_change_audit' AND policyname = 'admin_manage_price_audit') THEN
        CREATE POLICY "admin_manage_price_audit" ON public.price_change_audit FOR ALL TO authenticated USING (true);
    END IF;
END $$;

COMMENT ON TABLE public.pricing_suggestions IS 'Output of the automated pricing engine containing approved market recommendations.';
COMMENT ON TABLE public.price_change_audit IS 'Audit log of actual master catalog price changes applied by admins.';

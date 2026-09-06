-- RESTORE COMPETITOR PRICING ENGINE
-- Objective: Ensure all tables and columns required by the Price Opportunity Engine are present.

DO $$
BEGIN
    -- 1. Ensure competitor_prices has advanced metrics columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'shipping_fee') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN shipping_fee numeric(12,2) DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitor_prices' AND column_name = 'is_conditional') THEN
        ALTER TABLE public.competitor_prices ADD COLUMN is_conditional boolean DEFAULT false;
    END IF;

    -- 2. Restore pricing_suggestions table if missing
    CREATE TABLE IF NOT EXISTS public.pricing_suggestions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
      store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
      current_price numeric(12,2) NOT NULL,
      suggested_price numeric(12,2) NOT NULL,
      cost_price numeric(12,2),
      minimum_allowed_price numeric(12,2),
      lowest_competitor_price numeric(12,2),
      highest_competitor_price numeric(12,2),
      average_market_price numeric(12,2),
      median_market_price numeric(12,2),
      competitor_count integer DEFAULT 0,
      in_stock_competitor_count integer DEFAULT 0,
      strategy text NOT NULL,
      expected_profit numeric(12,2),
      expected_margin numeric(12,2),
      price_difference numeric(12,2),
      percentage_difference numeric(12,2),
      recommendation_status text DEFAULT 'ready' CHECK (recommendation_status IN ('ready', 'review_required', 'applied', 'rejected', 'suspicious', 'stale')),
      reason text,
      generated_at timestamptz DEFAULT now(),
      applied_at timestamptz,
      applied_by uuid REFERENCES auth.users(id),
      UNIQUE(product_id, store_id)
    );

    -- 3. Restore price_change_audit table if missing
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

END $$;

-- 4. Enable RLS and Policies
ALTER TABLE public.pricing_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_change_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pricing_suggestions' AND policyname = 'admin_manage_suggestions') THEN
        CREATE POLICY "admin_manage_suggestions" ON public.pricing_suggestions FOR ALL TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'price_change_audit' AND policyname = 'admin_manage_price_audit') THEN
        CREATE POLICY "admin_manage_price_audit" ON public.price_change_audit FOR ALL TO authenticated USING (true);
    END IF;
END $$;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_pricing_suggestions_product ON public.pricing_suggestions(product_id);
CREATE INDEX IF NOT EXISTS idx_pricing_suggestions_status ON public.pricing_suggestions(recommendation_status);
CREATE INDEX IF NOT EXISTS idx_price_change_audit_product ON public.price_change_audit(product_id);

-- Notify PostgREST
NOTIFY pgrst, 'reload schema';

-- CENTRALHUB INTELLIGENCE & AUTOMATION SUITE RESTORATION
-- This migration restores the missing infrastructure for Customer Intelligence, Inventory Forecasting, Marketing Automation, and Safety Controls.

-- 1. SYSTEM SETTINGS & KILL SWITCHES
CREATE TABLE IF NOT EXISTS public.system_intelligence_settings (
    key text PRIMARY KEY,
    value boolean DEFAULT false,
    description text,
    updated_at timestamptz DEFAULT now(),
    updated_by uuid REFERENCES auth.users(id)
);

-- Initialize Global Safety Controls
INSERT INTO public.system_intelligence_settings (key, value, description) VALUES
('automation_global_enabled', false, 'Master kill switch for all automation'),
('automation_mode_active', false, 'false = DRY RUN (log only), true = ACTIVE (mutate data)'),
('executive_bi_enabled', true, 'Enable/Disable Executive Dashboard'),
('automation_lifecycle_enabled', false, 'Customer lifecycle automation'),
('automation_inventory_enabled', false, 'Inventory reorder automation'),
('automation_pricing_enabled', false, 'Competitor pricing automation'),
('automation_marketing_enabled', false, 'Marketing campaign automation'),
('automation_purchasing_enabled', false, 'PO draft generation automation'),
('automation_recovery_enabled', false, 'Abandoned cart/customer recovery'),
('automation_content_enabled', false, 'AI content generation automation')
ON CONFLICT (key) DO NOTHING;

-- 2. CUSTOMER INTELLIGENCE (Analytical Cache)
CREATE TABLE IF NOT EXISTS public.customer_intelligence (
    customer_key text PRIMARY KEY, -- email or phone or internal ID
    customer_email text,
    customer_phone text,
    recency_days integer,
    frequency integer,
    monetary_value numeric,
    rfm_score integer,
    lifetime_value numeric DEFAULT 0,
    lifetime_profit numeric DEFAULT 0,
    lifecycle_stage text DEFAULT 'new',
    churn_probability numeric DEFAULT 0,
    risk_level text DEFAULT 'low',
    avg_reorder_interval_days integer,
    health_score integer DEFAULT 100,
    last_order_at timestamptz,
    order_count integer DEFAULT 0,
    store_id uuid REFERENCES public.stores(id),
    last_calculated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_lifecycle_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stage text NOT NULL UNIQUE,
    min_recency_days integer,
    max_recency_days integer,
    min_frequency integer,
    min_monetary_value numeric,
    priority integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- Seed basic lifecycle stages
INSERT INTO public.customer_lifecycle_config (stage, min_recency_days, max_recency_days, min_frequency, priority) VALUES
('vip', NULL, 30, 10, 100),
('loyal', NULL, 60, 5, 80),
('active', NULL, 45, 2, 60),
('at_risk', 90, 180, 1, 40),
('churned', 180, NULL, 1, 20)
ON CONFLICT (stage) DO NOTHING;

-- 3. INVENTORY INTELLIGENCE
CREATE TABLE IF NOT EXISTS public.inventory_forecasts (
    product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
    avg_daily_sales numeric DEFAULT 0,
    sales_velocity_30d numeric DEFAULT 0,
    days_of_cover integer DEFAULT 0,
    risk_level text DEFAULT 'healthy',
    confidence_level text DEFAULT 'low',
    recommended_reorder_qty integer DEFAULT 0,
    calculated_at timestamptz DEFAULT now()
);

-- 4. REVENUE & MARGIN INTELLIGENCE
CREATE TABLE IF NOT EXISTS public.product_economics (
    product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
    current_price numeric,
    cost_price numeric,
    gross_profit_per_unit numeric,
    margin_percent numeric,
    margin_health text, -- healthy, watch, low, negative
    product_role text, -- traffic_driver, profit_driver, etc.
    profitability_score integer,
    units_sold_30d integer DEFAULT 0,
    last_calculated_at timestamptz DEFAULT now()
);

-- 5. RECOMMENDATION & APPROVAL SYSTEM
CREATE TABLE IF NOT EXISTS public.intelligence_recommendations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_type text NOT NULL, -- inventory_reorder, pricing_opportunity, marketing_uplift, recovery
    entity_type text NOT NULL, -- product, customer, campaign
    entity_id text, -- product_id or customer_key
    store_id uuid REFERENCES public.stores(id),
    title text NOT NULL,
    description text,
    reason text,
    proposed_action text,
    expected_impact text,
    confidence numeric DEFAULT 0,
    risk_level integer DEFAULT 1, -- 1=Low, 2=Med, 3=High
    status text DEFAULT 'recommended', -- recommended, reviewed, approved, rejected, executed, stale
    metadata jsonb DEFAULT '{}'::jsonb,
    is_stale boolean DEFAULT false,
    source_snapshot jsonb DEFAULT '{}'::jsonb, -- Store state at generation time for stale checks
    created_at timestamptz DEFAULT now(),
    actioned_at timestamptz,
    expires_at timestamptz
);

-- Unique constraint to prevent duplicate recommendations for the same entity
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_rec ON public.intelligence_recommendations (recommendation_type, entity_id)
WHERE status IN ('recommended', 'reviewed');

CREATE TABLE IF NOT EXISTS public.intelligence_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id uuid REFERENCES public.intelligence_recommendations(id),
    user_id uuid REFERENCES auth.users(id),
    action text NOT NULL, -- approve, reject, execute, refresh, stale_mark
    status text NOT NULL, -- success, failed
    error_message text,
    previous_value jsonb,
    result_value jsonb,
    entity_type text,
    entity_id text,
    created_at timestamptz DEFAULT now()
);

-- 6. MARKETING INTELLIGENCE & ATTRIBUTION
CREATE TABLE IF NOT EXISTS public.marketing_attribution_results (
    order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
    customer_key text,
    attribution_model text NOT NULL, -- first_touch, last_touch
    attributed_revenue numeric NOT NULL,
    attributed_profit numeric NOT NULL,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    touchpoint_at timestamptz,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promotion_simulations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid REFERENCES public.products(id),
    store_id uuid REFERENCES public.stores(id),
    base_price numeric,
    proposed_price numeric,
    expected_volume_uplift numeric,
    projected_revenue numeric,
    projected_profit numeric,
    break_even_uplift numeric,
    stockout_risk text,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

-- 7. AUTOMATION ENGINE INFRASTRUCTURE
CREATE TABLE IF NOT EXISTS public.automation_execution_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id text,
    action_type text NOT NULL,
    status text NOT NULL, -- dry_run_success, executed, failed, policy_blocked, stale
    mode text NOT NULL, -- dry_run, active
    idempotency_key text UNIQUE,
    entity_type text,
    entity_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    error_message text,
    execution_duration_ms integer,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.intelligence_recommendation_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    summary text,
    primary_impact_type text, -- profit, growth, inventory_safety
    priority_score integer DEFAULT 0,
    confidence_level text, -- high, medium, low
    recommendation_ids uuid[] DEFAULT '{}',
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- RLS POLICIES

-- Enable RLS
ALTER TABLE public.system_intelligence_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_lifecycle_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_economics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_attribution_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_execution_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_recommendation_groups ENABLE ROW LEVEL SECURITY;

-- Staff/Admin access policies
DO $$
BEGIN
    -- System Settings
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'system_intelligence_settings' AND policyname = 'Admins can manage system settings') THEN
        CREATE POLICY "Admins can manage system settings" ON public.system_intelligence_settings
            FOR ALL TO authenticated USING (public.is_admin());
    END IF;

    -- Intelligence Data (Read for all authenticated, Write for system/admins)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_intelligence' AND policyname = 'Authenticated can view intelligence') THEN
        CREATE POLICY "Authenticated can view intelligence" ON public.customer_intelligence FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_forecasts' AND policyname = 'Authenticated can view intelligence') THEN
        CREATE POLICY "Authenticated can view intelligence" ON public.inventory_forecasts FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_economics' AND policyname = 'Authenticated can view intelligence') THEN
        CREATE POLICY "Authenticated can view intelligence" ON public.product_economics FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'intelligence_recommendations' AND policyname = 'Authenticated can view intelligence') THEN
        CREATE POLICY "Authenticated can view intelligence" ON public.intelligence_recommendations FOR SELECT TO authenticated USING (true);
    END IF;

    -- Recommendations (Allow update for approval)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'intelligence_recommendations' AND policyname = 'Admins can update recommendations') THEN
        CREATE POLICY "Admins can update recommendations" ON public.intelligence_recommendations
            FOR UPDATE TO authenticated USING (public.is_admin());
    END IF;

    -- Audit & Logs
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'intelligence_audit_log' AND policyname = 'Authenticated can view logs') THEN
        CREATE POLICY "Authenticated can view logs" ON public.intelligence_audit_log FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'automation_execution_log' AND policyname = 'Authenticated can view logs') THEN
        CREATE POLICY "Authenticated can view logs" ON public.automation_execution_log FOR SELECT TO authenticated USING (true);
    END IF;

    -- Additional Intelligence Tables
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_lifecycle_config' AND policyname = 'Authenticated can view intelligence') THEN
        CREATE POLICY "Authenticated can view intelligence" ON public.customer_lifecycle_config FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'marketing_attribution_results' AND policyname = 'Authenticated can view intelligence') THEN
        CREATE POLICY "Authenticated can view intelligence" ON public.marketing_attribution_results FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'promotion_simulations' AND policyname = 'Authenticated can view intelligence') THEN
        CREATE POLICY "Authenticated can view intelligence" ON public.promotion_simulations FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'intelligence_recommendation_groups' AND policyname = 'Authenticated can view intelligence') THEN
        CREATE POLICY "Authenticated can view intelligence" ON public.intelligence_recommendation_groups FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_customer_intel_rfm ON public.customer_intelligence(rfm_score);
CREATE INDEX IF NOT EXISTS idx_customer_intel_stage ON public.customer_intelligence(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_inv_forecast_risk ON public.inventory_forecasts(risk_level);
CREATE INDEX IF NOT EXISTS idx_product_econ_health ON public.product_economics(margin_health);
CREATE INDEX IF NOT EXISTS idx_rec_status ON public.intelligence_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_rec_type ON public.intelligence_recommendations(recommendation_type);
CREATE INDEX IF NOT EXISTS idx_attrib_customer ON public.marketing_attribution_results(customer_key);
CREATE INDEX IF NOT EXISTS idx_exec_log_key ON public.automation_execution_log(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_exec_log_created ON public.automation_execution_log(created_at DESC);

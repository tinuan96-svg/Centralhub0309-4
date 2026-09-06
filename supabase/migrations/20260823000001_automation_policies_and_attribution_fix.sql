-- CENTRALHUB — PHASE 3C FINAL INTEGRITY REPAIR
-- This migration fixes the attribution primary key and adds missing automation infrastructure.

-- 1. ATTRIBUTION FIX (Phase 11)
-- Drop the existing primary key and create a composite one to allow both First and Last touch for the same order.
ALTER TABLE public.marketing_attribution_results DROP CONSTRAINT IF EXISTS marketing_attribution_results_pkey;
ALTER TABLE public.marketing_attribution_results ADD PRIMARY KEY (order_id, attribution_model);

-- 2. AUTOMATION POLICIES (Phase 2)
CREATE TABLE IF NOT EXISTS public.automation_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    action_type text UNIQUE NOT NULL, -- e.g. 'inventory:reorder', 'pricing:update', 'marketing:whatsapp'
    risk_level integer NOT NULL DEFAULT 1, -- 0=Read, 1=Low, 2=Med, 3=High
    requires_approval boolean DEFAULT true,
    enabled boolean DEFAULT false,
    module text NOT NULL, -- inventory, pricing, marketing, lifecycle
    fresh_data_required boolean DEFAULT true,
    description text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Seed Initial Policies
INSERT INTO public.automation_policies (action_type, risk_level, requires_approval, module, description) VALUES
('inventory:reorder', 2, true, 'inventory', 'Generate PO drafts when stock is low'),
('pricing:update', 2, true, 'pricing', 'Update product prices based on competitor data'),
('marketing:whatsapp', 3, true, 'marketing', 'Send automated WhatsApp messages to customers'),
('marketing:email', 3, true, 'marketing', 'Send automated marketing emails'),
('lifecycle:refresh', 1, false, 'lifecycle', 'Daily background calculation of customer segments'),
('recovery:abandoned_cart', 2, true, 'marketing', 'Send recovery messages for abandoned carts')
ON CONFLICT (action_type) DO NOTHING;

-- 3. AUTOMATION WORKFLOWS (Phase 3)
CREATE TABLE IF NOT EXISTS public.automation_workflows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    module text NOT NULL,
    trigger_type text NOT NULL, -- schedule, event, threshold
    trigger_config jsonb DEFAULT '{}'::jsonb,
    conditions jsonb DEFAULT '[]'::jsonb,
    steps jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT false,
    version integer DEFAULT 1,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. CUSTOMER INTELLIGENCE SCHEMA HARDENING (Phase 10)
-- Fix the primary key to support both global and store-specific intelligence.
-- We use a composite PK of (customer_key, store_id).
-- For GLOBAL records, we use '00000000-0000-0000-0000-000000000000' as the store_id.
ALTER TABLE public.customer_intelligence DROP CONSTRAINT IF EXISTS customer_intelligence_pkey;
ALTER TABLE public.customer_intelligence ALTER COLUMN store_id SET DEFAULT '00000000-0000-0000-0000-000000000000';
UPDATE public.customer_intelligence SET store_id = '00000000-0000-0000-0000-000000000000' WHERE store_id IS NULL;
ALTER TABLE public.customer_intelligence ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE public.customer_intelligence ADD PRIMARY KEY (customer_key, store_id);
ALTER TABLE public.customer_intelligence ADD COLUMN IF NOT EXISTS calculation_scope text DEFAULT 'global'; -- 'global' or 'store'

-- 5. SECURITY HARDENING (Phase 24)
-- Tighten RLS on safety-critical tables.
DROP POLICY IF EXISTS "Admins can manage system settings" ON public.system_intelligence_settings;
CREATE POLICY "Staff/Admins can manage system settings" ON public.system_intelligence_settings
    FOR ALL TO authenticated USING (
        (auth.jwt() ->> 'role' = 'admin') OR (auth.jwt() ->> 'role' = 'staff')
    );

ALTER TABLE public.automation_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff/Admins can manage automation policies" ON public.automation_policies
    FOR ALL TO authenticated USING (
        (auth.jwt() ->> 'role' = 'admin') OR (auth.jwt() ->> 'role' = 'staff')
    );

ALTER TABLE public.automation_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff/Admins can manage automation workflows" ON public.automation_workflows
    FOR ALL TO authenticated USING (
        (auth.jwt() ->> 'role' = 'admin') OR (auth.jwt() ->> 'role' = 'staff')
    );

-- 6. INDEXES
CREATE INDEX IF NOT EXISTS idx_auto_policies_module ON public.automation_policies(module);
CREATE INDEX IF NOT EXISTS idx_auto_workflows_active ON public.automation_workflows(is_active) WHERE is_active = true;

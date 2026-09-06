-- 1. FIX CUSTOMER INTELLIGENCE SCHEMA (Phase 2)
-- Remove the unsafe fake UUID approach. Use NULL for global.
ALTER TABLE public.customer_intelligence DROP CONSTRAINT IF EXISTS customer_intelligence_pkey CASCADE;
-- Remove FK to stores to allow NULL/Global records without constraint issues in analytical table
ALTER TABLE public.customer_intelligence DROP CONSTRAINT IF EXISTS customer_intelligence_store_id_fkey;
ALTER TABLE public.customer_intelligence ALTER COLUMN store_id DROP NOT NULL;
ALTER TABLE public.customer_intelligence ALTER COLUMN store_id DROP DEFAULT;

-- Use conditional unique indexes that handle NULL correctly for one record per customer_key.
DROP INDEX IF EXISTS idx_cust_intel_global_unique;
DROP INDEX IF EXISTS idx_cust_intel_store_unique;
DROP INDEX IF EXISTS idx_cust_intel_scope_hardened;
CREATE UNIQUE INDEX idx_cust_intel_global_unique ON public.customer_intelligence (customer_key) WHERE (store_id IS NULL);
CREATE UNIQUE INDEX idx_cust_intel_store_unique ON public.customer_intelligence (customer_key, store_id) WHERE (store_id IS NOT NULL);

-- Add ID for internal PK reference if needed
ALTER TABLE public.customer_intelligence ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() PRIMARY KEY;

-- 2. FIX AUTOMATION EXECUTION LOG SCHEMA (Phase 3)
DO $$
BEGIN
    ALTER TABLE public.automation_execution_log ADD COLUMN IF NOT EXISTS risk_level integer;
    ALTER TABLE public.automation_execution_log ADD COLUMN IF NOT EXISTS trigger_event jsonb DEFAULT '{}'::jsonb;
    ALTER TABLE public.automation_execution_log ADD COLUMN IF NOT EXISTS execution_result jsonb DEFAULT '{}'::jsonb;
    ALTER TABLE public.automation_execution_log ADD COLUMN IF NOT EXISTS started_at timestamptz DEFAULT now();
    ALTER TABLE public.automation_execution_log ADD COLUMN IF NOT EXISTS completed_at timestamptz;
END $$;

-- 3. FIX RECOMMENDATION UPSERT & STORE SCOPE (Phase 9)
-- Ensure we can have historical recommendations but only one "active" one per type/entity/store.
-- Note: PostgreSQL 15+ allows UNIQUE NULLS NOT DISTINCT. For compatibility with older versions,
-- we use a functional index and will handle upsert mapping.
DROP INDEX IF EXISTS idx_unique_active_rec;
DROP INDEX IF EXISTS idx_unique_active_rec_scoped;
DROP INDEX IF EXISTS idx_unique_active_rec_global;
CREATE UNIQUE INDEX idx_unique_active_rec_global ON public.intelligence_recommendations (recommendation_type, entity_id)
WHERE status IN ('recommended', 'reviewed', 'approved') AND store_id IS NULL;

CREATE UNIQUE INDEX idx_unique_active_rec_scoped ON public.intelligence_recommendations (recommendation_type, entity_id, store_id)
WHERE status IN ('recommended', 'reviewed', 'approved') AND store_id IS NOT NULL;

-- 4. HARDEN RLS SECURITY (Phase 24)
-- Use existing CentralHub admin check: (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
DO $$
BEGIN
    -- system_intelligence_settings
    DROP POLICY IF EXISTS "Staff/Admins can manage system settings" ON public.system_intelligence_settings;
    CREATE POLICY "Admins can manage system settings" ON public.system_intelligence_settings
        FOR ALL TO authenticated USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

    -- automation_policies
    DROP POLICY IF EXISTS "Staff/Admins can manage automation policies" ON public.automation_policies;
    CREATE POLICY "Admins can manage automation policies" ON public.automation_policies
        FOR ALL TO authenticated USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

    -- automation_workflows
    DROP POLICY IF EXISTS "Staff/Admins can manage automation workflows" ON public.automation_workflows;
    CREATE POLICY "Admins can manage automation workflows" ON public.automation_workflows
        FOR ALL TO authenticated USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

    -- recommendations (Read for all, Update for admin)
    DROP POLICY IF EXISTS "Admins can update recommendations" ON public.intelligence_recommendations;
    DROP POLICY IF EXISTS "Admins can manage recommendations" ON public.intelligence_recommendations;
    CREATE POLICY "Admins can manage recommendations" ON public.intelligence_recommendations
        FOR ALL TO authenticated USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

    -- automation_execution_log
    DROP POLICY IF EXISTS "Authenticated can view logs" ON public.automation_execution_log;
    CREATE POLICY "Admins can manage execution logs" ON public.automation_execution_log
        FOR ALL TO authenticated USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

    -- intelligence_audit_log
    DROP POLICY IF EXISTS "Authenticated can view logs" ON public.intelligence_audit_log;
    CREATE POLICY "Admins can manage audit logs" ON public.intelligence_audit_log
        FOR ALL TO authenticated USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

    -- promotion_simulations
    DROP POLICY IF EXISTS "Admins can manage simulations" ON public.promotion_simulations;
    CREATE POLICY "Admins can manage simulations" ON public.promotion_simulations
        FOR ALL TO authenticated USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
END $$;

-- 5. CANONICAL POLICIES (Phase 5)
-- Truncate and re-seed to ensure consistency
TRUNCATE public.automation_policies;
INSERT INTO public.automation_policies (action_type, risk_level, requires_approval, module, description, enabled) VALUES
('inventory:reorder', 2, true, 'inventory', 'Generate PO drafts when stock is low', true),
('pricing:update', 2, true, 'pricing', 'Update product prices based on competitor data', true),
('marketing:whatsapp', 3, true, 'marketing', 'Send automated WhatsApp messages to customers', true),
('marketing:email', 3, true, 'marketing', 'Send automated marketing emails', true),
('lifecycle:refresh', 1, false, 'lifecycle', 'Daily background calculation of customer segments', true),
('recovery:abandoned_cart', 2, true, 'recovery', 'Send recovery messages for abandoned carts', true),
('marketing:opportunity_scan', 1, false, 'marketing', 'Scan for new marketing uplift opportunities', true),
('product:economics_refresh', 1, false, 'pricing', 'Recalculate product margin and revenue metrics', true),
('pricing:recommendation_generation', 1, false, 'pricing', 'Generate price change recommendations', true),
('content:generate', 2, true, 'content', 'Generate AI marketing copy', true);

-- 6. FINAL SAFETY STATE (Phase 30)
UPDATE public.system_intelligence_settings SET value = false WHERE key = 'automation_global_enabled';
UPDATE public.system_intelligence_settings SET value = false WHERE key = 'automation_mode_active';
UPDATE public.system_intelligence_settings SET value = false WHERE key LIKE 'automation_%_enabled';
UPDATE public.system_intelligence_settings SET value = true WHERE key = 'executive_bi_enabled';

-- Restore authenticated-admin access for intelligence tables consumed directly by the CentralHub frontend.
-- RLS remains enabled; only users passing the existing is_admin() gate receive access.
ALTER TABLE public.customer_lifecycle_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_recommendation_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_simulations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customer lifecycle config admin access" ON public.customer_lifecycle_config;
CREATE POLICY "Customer lifecycle config admin access"
ON public.customer_lifecycle_config
FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Intelligence recommendation groups admin access" ON public.intelligence_recommendation_groups;
CREATE POLICY "Intelligence recommendation groups admin access"
ON public.intelligence_recommendation_groups
FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Promotion simulations admin access" ON public.promotion_simulations;
CREATE POLICY "Promotion simulations admin access"
ON public.promotion_simulations
FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

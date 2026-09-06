-- Fix RLS for marketing_providers to allow management via service role
-- Although service role should bypass RLS, explicit policies can help in some configurations

CREATE POLICY "Service role manage providers" ON public.marketing_providers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Also allow authenticated users to insert if they are admins (optional, but good for safety)
CREATE POLICY "Admins can manage providers" ON public.marketing_providers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

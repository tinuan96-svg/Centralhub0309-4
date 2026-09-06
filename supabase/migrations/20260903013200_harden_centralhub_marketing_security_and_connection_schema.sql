-- Keep the repository migration history aligned with the live Supabase schema.
ALTER TABLE public.marketing_connections
  ADD COLUMN IF NOT EXISTS encrypted_credentials jsonb;

COMMENT ON COLUMN public.marketing_connections.encrypted_credentials IS
  'Non-secret metadata describing encrypted credential storage; never store plaintext provider secrets here.';

-- CentralHub is a single-admin control plane. Tighten legacy broad policies.
DROP POLICY IF EXISTS "Staff manage integrations" ON public.marketing_integrations;
CREATE POLICY "Staff manage integrations" ON public.marketing_integrations
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "marketing_tracking_links_authenticated" ON public.marketing_tracking_links;
CREATE POLICY "marketing_tracking_links_admin" ON public.marketing_tracking_links
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage providers" ON public.marketing_providers;
CREATE POLICY "Admins can manage providers" ON public.marketing_providers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "centralhub_admin_full_access_store_business_identity" ON public.store_business_identity;
CREATE POLICY "centralhub_admin_full_access_store_business_identity" ON public.store_business_identity
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Keep attribution reporting internal while allowing the admin dashboard to read it.
DROP POLICY IF EXISTS "Authenticated can view intelligence" ON public.marketing_attribution_results;
CREATE POLICY "Marketing attribution results admin read" ON public.marketing_attribution_results
  FOR SELECT TO authenticated
  USING (public.is_admin());

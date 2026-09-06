-- CENTRALHUB MARKETING OS
-- Store-isolation hardening.
--
-- The application supports an explicit "All Stores" reporting mode, but
-- individual marketing records must never be exposed merely because a user
-- is authenticated. CentralHub admin users are allowed to manage/report
-- across stores; non-admin users must not inherit cross-store access from
-- generic marketing policies.

-- 1. Replace the permissive marketing policies from the initial Marketing OS
--    migration. Those policies used `store_id IN (SELECT id FROM stores)`,
--    which effectively granted every authenticated user access to every
--    marketing store record.
--
--    NOTE: `customers` is deliberately NOT changed here. Customer Care has
--    its own access model and is outside this Marketing OS hardening migration.

DROP POLICY IF EXISTS "Store segment access" ON public.marketing_segments;
DROP POLICY IF EXISTS "Store connection access" ON public.marketing_connections;
DROP POLICY IF EXISTS "Store asset access" ON public.marketing_assets;
DROP POLICY IF EXISTS "Store campaign access" ON public.marketing_campaigns;
DROP POLICY IF EXISTS "Store metric access" ON public.marketing_metrics;
DROP POLICY IF EXISTS "Store event access" ON public.marketing_events;
DROP POLICY IF EXISTS "Store sync job access" ON public.marketing_sync_jobs;
DROP POLICY IF EXISTS "Store creative access" ON public.marketing_creatives;
DROP POLICY IF EXISTS "Store audience access" ON public.marketing_audiences;
DROP POLICY IF EXISTS "Store audience sync access" ON public.marketing_audience_sync;
DROP POLICY IF EXISTS "Store insight access" ON public.marketing_insights;

-- 2. CentralHub admin is the authoritative cross-store marketing control
--    plane. The application continues to filter every query by selected
--    store_id, while RLS prevents accidental cross-store exposure.

CREATE POLICY "Marketing segments admin access"
  ON public.marketing_segments FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Marketing connections admin access"
  ON public.marketing_connections FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Marketing assets admin access"
  ON public.marketing_assets FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Marketing campaigns admin access"
  ON public.marketing_campaigns FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Marketing metrics admin access"
  ON public.marketing_metrics FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Marketing events admin access"
  ON public.marketing_events FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Marketing sync jobs admin access"
  ON public.marketing_sync_jobs FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Marketing creatives admin access"
  ON public.marketing_creatives FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Marketing audiences admin access"
  ON public.marketing_audiences FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Marketing audience sync admin access"
  ON public.marketing_audience_sync FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Marketing insights admin access"
  ON public.marketing_insights FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. Providers are definitions, not store data. Keep them readable to signed
--    in staff while connection/account data remains admin-controlled.
DROP POLICY IF EXISTS "Staff view providers" ON public.marketing_providers;
CREATE POLICY "Staff view marketing providers"
  ON public.marketing_providers FOR SELECT TO authenticated
  USING (true);

-- 4. Prevent accidental duplicate external assets within one connection.
--    Two different stores can still use the same external asset ID because
--    their connection_id values are different.
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_assets_connection_external_unique
  ON public.marketing_assets(connection_id, external_id);

-- 5. Keep store/provider reporting fast and deterministic.
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_store_provider
  ON public.marketing_campaigns(store_id, provider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_events_store_timestamp
  ON public.marketing_events(store_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_sync_jobs_store_status
  ON public.marketing_sync_jobs(store_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_audiences_store
  ON public.marketing_audiences(store_id, created_at DESC);

COMMENT ON TABLE public.marketing_connections IS
  'Store-specific provider connections. Never share provider credentials/accounts between stores.';

COMMENT ON TABLE public.marketing_metrics IS
  'Normalized marketing performance. Every row is owned by exactly one store and provider; All Stores reporting aggregates these rows without merging store identities.';

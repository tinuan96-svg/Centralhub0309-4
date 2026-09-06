-- CentralHub production security hardening, 2026-09-06.
-- Mirrors the migration already applied to Supabase project icnvrpnzjjcbvgcqgiua.
-- This migration is deliberately non-destructive: no business rows are deleted or rewritten.

-- Remove direct anonymous access to internal configuration and identity surfaces.
REVOKE ALL PRIVILEGES ON TABLE public.analytics_store_configs FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.app_config FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.customer_lifecycle_config FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.integration_cron_tokens FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.marketing_provider_configs FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.marketing_providers FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.site_health_store_configs FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.store_business_identity FROM anon;

-- Authenticated application users keep the CRUD operations granted to them by RLS,
-- but do not need PostgreSQL table-control capabilities.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.analytics_store_configs FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.app_config FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.customer_lifecycle_config FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.integration_cron_tokens FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.marketing_provider_configs FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.marketing_providers FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.site_health_store_configs FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.store_business_identity FROM authenticated;

-- centralhub_feature_health is an admin diagnostic view. Once it runs as the caller
-- (security_invoker), these narrowly scoped admin read policies preserve the same
-- aggregate health data without bypassing the underlying RLS policies.
DROP POLICY IF EXISTS "CentralHub admins can view order sync queue" ON public.order_sync_queue;
CREATE POLICY "CentralHub admins can view order sync queue"
  ON public.order_sync_queue
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "CentralHub admins can view all push subscriptions" ON public.push_subscriptions;
CREATE POLICY "CentralHub admins can view all push subscriptions"
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "CentralHub admins can view all system notifications" ON public.system_notifications;
CREATE POLICY "CentralHub admins can view all system notifications"
  ON public.system_notifications
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Make RLS evaluate as the authenticated caller rather than the postgres view owner.
ALTER VIEW public.centralhub_feature_health SET (security_invoker = true);

-- Keep the diagnostic private and read-only for application users.
REVOKE ALL PRIVILEGES ON TABLE public.centralhub_feature_health FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.centralhub_feature_health FROM authenticated;
GRANT SELECT ON TABLE public.centralhub_feature_health TO authenticated;

-- Store-owned marketing application configuration.
-- Each store/provider can use credentials belonging to that store's own developer/app account.
-- Secrets remain encrypted server-side and are never returned to browser clients.
CREATE TABLE IF NOT EXISTS public.marketing_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  provider_id text NOT NULL REFERENCES public.marketing_providers(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  encrypted_client_secret text NOT NULL,
  redirect_uri text NOT NULL,
  app_label text,
  status text NOT NULL DEFAULT 'configured' CHECK (status IN ('configured','invalid','disabled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, provider_id)
);

ALTER TABLE public.marketing_provider_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Marketing provider configs admin access" ON public.marketing_provider_configs;
CREATE POLICY "Marketing provider configs admin access"
  ON public.marketing_provider_configs FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_marketing_provider_configs_store_provider
  ON public.marketing_provider_configs(store_id, provider_id);

COMMENT ON TABLE public.marketing_provider_configs IS
  'Store-owned OAuth/API application configuration. Use the store own platform developer app credentials; do not use one shared app identity across stores where provider policy or branding makes store identity relevant.';
COMMENT ON COLUMN public.marketing_provider_configs.encrypted_client_secret IS
  'AES-GCM encrypted provider app secret. Never expose to browser clients.';
COMMENT ON COLUMN public.marketing_provider_configs.redirect_uri IS
  'Provider callback URI registered for the store-owned application. Prefer a store-owned domain/callback when the provider supports it.';

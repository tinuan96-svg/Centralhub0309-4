-- Repair the one-time CentralHub managed OAuth configuration contract.
-- The Edge Function stores platform credentials here and safely seeds per-store provider configs.

CREATE TABLE IF NOT EXISTS public.marketing_platform_oauth_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL UNIQUE CHECK (provider_id IN ('google','meta')),
  client_id text NOT NULL,
  encrypted_client_secret text NOT NULL,
  encrypted_developer_token text,
  login_customer_id text,
  app_label text,
  redirect_uri text NOT NULL,
  status text NOT NULL DEFAULT 'configured' CHECK (status IN ('configured','disabled','not_configured')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_platform_oauth_apps ENABLE ROW LEVEL SECURITY;

-- No browser policy is intentionally granted. The admin-only Edge Function uses the service role.
REVOKE ALL ON public.marketing_platform_oauth_apps FROM anon, authenticated;

ALTER TABLE public.marketing_provider_configs
  ADD COLUMN IF NOT EXISTS encrypted_secrets jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS encrypted_developer_token text,
  ADD COLUMN IF NOT EXISTS login_customer_id text,
  ADD COLUMN IF NOT EXISTS app_label text,
  ADD COLUMN IF NOT EXISTS public_config jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_marketing_platform_oauth_apps_provider_status
  ON public.marketing_platform_oauth_apps(provider_id, status);

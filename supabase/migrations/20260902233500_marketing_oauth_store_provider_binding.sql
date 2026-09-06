ALTER TABLE public.marketing_oauth_states
  ADD COLUMN IF NOT EXISTS provider_config_id uuid REFERENCES public.marketing_provider_configs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_oauth_states_provider_config
  ON public.marketing_oauth_states(provider_config_id);

COMMENT ON COLUMN public.marketing_oauth_states.provider_config_id IS
  'Pins an OAuth transaction to the exact store-owned provider application configuration used to start it.';

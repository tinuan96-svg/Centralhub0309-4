-- Analytics provider registry and store-level integration metadata.
-- Google-facing identities remain store-specific; CentralHub IDs are internal only.

INSERT INTO public.marketing_providers (id, display_name, category, auth_method, capabilities, is_active, is_verified, setup_instructions)
VALUES
('google_analytics', 'Google Analytics 4', 'analytics', 'oauth2', '["realtime","traffic_acquisition","user_acquisition","pages","events","ecommerce","attribution","geography","devices"]'::jsonb, true, true, 'Connect the store''s own GA4 property. Never use a shared CentralHub property.'),
('google_search_console', 'Google Search Console', 'search', 'oauth2', '["queries","pages","countries","devices","clicks","impressions","ctr","position"]'::jsonb, true, true, 'Connect the store''s own Search Console property.'),
('google_ads', 'Google Ads', 'advertising', 'oauth2', '["campaigns","spend","impressions","clicks","conversions","conversion_value"]'::jsonb, true, true, 'Connect the store''s own Google Ads customer/account.'),
('meta_ads', 'Meta Ads', 'advertising', 'oauth2', '["campaigns","adsets","ads","spend","impressions","reach","clicks","conversions"]'::jsonb, true, true, 'Connect the store''s own Meta business/ad account.')
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  category = EXCLUDED.category,
  auth_method = EXCLUDED.auth_method,
  capabilities = EXCLUDED.capabilities,
  is_active = EXCLUDED.is_active,
  is_verified = EXCLUDED.is_verified,
  setup_instructions = EXCLUDED.setup_instructions,
  updated_at = now();

ALTER TABLE public.marketing_connections
  ADD COLUMN IF NOT EXISTS encrypted_credentials jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.marketing_connections.encrypted_credentials IS 'Provider credential reference/secret payload. Keep provider credentials server-side; never expose to store websites or browser clients.';

CREATE INDEX IF NOT EXISTS idx_marketing_connections_store_provider_status
  ON public.marketing_connections(store_id, provider_id, status);

CREATE INDEX IF NOT EXISTS idx_marketing_metrics_store_provider_date
  ON public.marketing_metrics(store_id, provider_id, date DESC);

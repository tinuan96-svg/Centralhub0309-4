-- CENTRALHUB MARKETING OS CORE ARCHITECTURE

-- 0. Infrastructure Prerequisites
-- Ensure customers is a physical table (it might be a view in some environments)
DO $$
BEGIN
    -- Only drop if it exists AND is a view (relkind = 'v')
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'customers' AND c.relkind = 'v'
    ) THEN
        DROP VIEW public.customers CASCADE;
    END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name text,
  email text,
  phone text,
  total_spend numeric(15,2) DEFAULT 0,
  order_count integer DEFAULT 0,
  last_order_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ensure marketing_segments exists before it's referenced
CREATE TABLE IF NOT EXISTS public.marketing_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  rules jsonb DEFAULT '{}'::jsonb,
  member_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  last_calculated_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 1. Provider Registry
CREATE TABLE IF NOT EXISTS public.marketing_providers (
  id text PRIMARY KEY, -- 'meta', 'google', 'tiktok', 'spotify', etc.
  display_name text NOT NULL,
  category text NOT NULL, -- 'advertising', 'social', 'search', 'commerce', 'messaging', 'email', 'analytics'
  icon text,
  auth_method text NOT NULL, -- 'oauth2', 'api_key', 'none'
  capabilities jsonb DEFAULT '[]'::jsonb, -- Array of supported capabilities
  is_active boolean DEFAULT true,
  is_verified boolean DEFAULT false,
  setup_instructions text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Marketing Connections (Evolution of marketing_integrations)
-- We rename it to marketing_connections for the new OS architecture
-- or ensure it has all required fields.
CREATE TABLE IF NOT EXISTS public.marketing_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  provider_id text NOT NULL REFERENCES public.marketing_providers(id),
  external_account_id text,
  external_account_name text,
  access_token text, -- Encrypted at rest
  refresh_token text, -- Encrypted at rest
  token_expires_at timestamptz,
  api_key text, -- For providers using API keys
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('not_connected', 'connecting', 'connected', 'syncing', 'healthy', 'warning', 'error', 'disconnected')),
  health_score integer DEFAULT 100,
  last_sync_at timestamptz,
  last_error text,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(store_id, provider_id)
);

-- 3. Marketing Assets (Discovered accounts, pages, pixels, catalogs)
CREATE TABLE IF NOT EXISTS public.marketing_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.marketing_connections(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  asset_type text NOT NULL, -- 'ad_account', 'facebook_page', 'instagram_profile', 'pixel', 'catalog', 'merchant_center', 'ga4_property'
  external_id text NOT NULL,
  name text NOT NULL,
  is_assigned boolean DEFAULT false,
  status text DEFAULT 'active',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Marketing Campaigns (Unified across platforms)
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  provider_id text NOT NULL REFERENCES public.marketing_providers(id),
  external_campaign_id text,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  objective text,
  campaign_type text,
  budget_type text DEFAULT 'daily', -- 'daily', 'lifetime'
  budget_amount numeric(15,2) DEFAULT 0,
  currency text DEFAULT 'GBP',
  start_date timestamptz,
  end_date timestamptz,
  targeting jsonb DEFAULT '{}'::jsonb,
  creative_config jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. Marketing Metrics (Normalized performance data)
CREATE TABLE IF NOT EXISTS public.marketing_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  provider_id text NOT NULL REFERENCES public.marketing_providers(id),
  external_id text, -- external campaign or ad id
  date date NOT NULL,
  spend numeric(15,2) DEFAULT 0,
  impressions bigint DEFAULT 0,
  clicks integer DEFAULT 0,
  conversions integer DEFAULT 0,
  conversion_value numeric(15,2) DEFAULT 0,
  reach bigint DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, campaign_id, provider_id, external_id, date)
);

-- 6. Marketing Events (Tracking & Attribution)
CREATE TABLE IF NOT EXISTS public.marketing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  event_type text NOT NULL, -- 'page_view', 'product_view', 'add_to_cart', 'purchase', etc.
  event_source text DEFAULT 'web', -- 'web', 'app', 'server'
  url text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  click_id text, -- gclid, fbclid, etc.
  metadata jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  timestamp timestamptz DEFAULT now()
);

-- 7. Sync Engine Jobs
CREATE TABLE IF NOT EXISTS public.marketing_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.marketing_connections(id) ON DELETE SET NULL,
  provider_id text NOT NULL REFERENCES public.marketing_providers(id),
  job_type text NOT NULL, -- 'initial_sync', 'incremental_metrics', 'catalog_sync', 'audience_sync'
  status text NOT NULL DEFAULT 'queued', -- 'queued', 'running', 'completed', 'partial', 'failed'
  progress integer DEFAULT 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- 8. Creative Library
CREATE TABLE IF NOT EXISTS public.marketing_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL, -- 'image', 'video', 'carousel'
  dimensions text,
  size_bytes bigint,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  external_asset_id text,
  provider_id text REFERENCES public.marketing_providers(id),
  status text DEFAULT 'active',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 9. Marketing Audiences (Activation Engine)
CREATE TABLE IF NOT EXISTS public.marketing_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  segment_id uuid REFERENCES public.marketing_segments(id) ON DELETE SET NULL,
  rules jsonb DEFAULT '{}'::jsonb,
  size_count integer DEFAULT 0,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 10. Audience Sync (Mapping to external platforms)
CREATE TABLE IF NOT EXISTS public.marketing_audience_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id uuid NOT NULL REFERENCES public.marketing_audiences(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.marketing_connections(id) ON DELETE CASCADE,
  external_audience_id text,
  sync_status text DEFAULT 'pending',
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 11. Marketing Insights
CREATE TABLE IF NOT EXISTS public.marketing_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status text DEFAULT 'new' CHECK (status IN ('new', 'dismissed', 'applied')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ENABLE RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_audience_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_insights ENABLE ROW LEVEL SECURITY;

-- POLICIES (Enforce Multi-Store Isolation)

-- Customers: Store scoped
CREATE POLICY "Store customer access" ON public.customers
  FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM public.stores));

-- Marketing Segments: Store scoped
CREATE POLICY "Store segment access" ON public.marketing_segments
  FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM public.stores));

-- Providers: Publicly viewable by staff
CREATE POLICY "Staff view providers" ON public.marketing_providers FOR SELECT TO authenticated USING (true);

-- Connections: Store scoped
CREATE POLICY "Store connection access" ON public.marketing_connections
  FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM public.stores));

-- Assets: Store scoped
CREATE POLICY "Store asset access" ON public.marketing_assets
  FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM public.stores));

-- Campaigns: Store scoped
CREATE POLICY "Store campaign access" ON public.marketing_campaigns
  FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM public.stores));

-- Metrics: Store scoped
CREATE POLICY "Store metric access" ON public.marketing_metrics
  FOR SELECT TO authenticated
  USING (store_id IN (SELECT id FROM public.stores));

-- Events: Store scoped
CREATE POLICY "Store event access" ON public.marketing_events
  FOR SELECT TO authenticated
  USING (store_id IN (SELECT id FROM public.stores));

-- Sync Jobs: Store scoped
CREATE POLICY "Store sync job access" ON public.marketing_sync_jobs
  FOR SELECT TO authenticated
  USING (store_id IN (SELECT id FROM public.stores));

-- Creatives: Store scoped
CREATE POLICY "Store creative access" ON public.marketing_creatives
  FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM public.stores));

-- Audiences: Store scoped
CREATE POLICY "Store audience access" ON public.marketing_audiences
  FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM public.stores));

-- Audience Sync: Scoped via audience
CREATE POLICY "Store audience sync access" ON public.marketing_audience_sync
  FOR SELECT TO authenticated
  USING (audience_id IN (SELECT id FROM public.marketing_audiences));

-- Insights: Store scoped
CREATE POLICY "Store insight access" ON public.marketing_insights
  FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM public.stores));

-- SEED PROVIDER REGISTRY
INSERT INTO public.marketing_providers (id, display_name, category, auth_method, capabilities)
VALUES
  ('meta', 'Meta (Facebook & Instagram)', 'social', 'oauth2', '["advertising", "analytics", "catalog", "social_publishing", "messaging"]'),
  ('google', 'Google (Ads, Merchant, GA4)', 'search', 'oauth2', '["advertising", "analytics", "catalog", "search_discovery"]'),
  ('tiktok', 'TikTok', 'social', 'oauth2', '["advertising", "analytics", "catalog", "social_publishing"]'),
  ('youtube', 'YouTube', 'social', 'oauth2', '["analytics", "video_publishing"]'),
  ('spotify', 'Spotify Ads', 'advertising', 'oauth2', '["advertising", "analytics"]'),
  ('pinterest', 'Pinterest', 'social', 'oauth2', '["advertising", "analytics", "catalog", "social_publishing"]'),
  ('linkedin', 'LinkedIn', 'social', 'oauth2', '["advertising", "analytics", "social_publishing"]'),
  ('microsoft', 'Microsoft Ads', 'search', 'oauth2', '["advertising", "analytics"]'),
  ('snapchat', 'Snapchat', 'social', 'oauth2', '["advertising", "analytics"]'),
  ('reddit', 'Reddit Ads', 'advertising', 'oauth2', '["advertising", "analytics"]'),
  ('x', 'X (Twitter)', 'social', 'oauth2', '["advertising", "analytics", "social_publishing"]'),
  ('amazon', 'Amazon Ads', 'advertising', 'oauth2', '["advertising", "analytics", "catalog"]'),
  ('mailchimp', 'Mailchimp', 'email', 'oauth2', '["email_marketing", "audiences"]'),
  ('klaviyo', 'Klaviyo', 'email', 'api_key', '["email_marketing", "audiences", "analytics"]'),
  ('whatsapp', 'WhatsApp Business', 'messaging', 'none', '["messaging", "audiences"]'),
  ('google_business', 'Google Business Profile', 'search', 'oauth2', '["search_discovery", "local_marketing"]')
ON CONFLICT (id) DO UPDATE SET
  capabilities = EXCLUDED.capabilities,
  category = EXCLUDED.category,
  display_name = EXCLUDED.display_name;

-- HELPERS
CREATE OR REPLACE FUNCTION public.get_marketing_roas(revenue numeric, spend numeric)
RETURNS numeric AS $$
BEGIN
  RETURN CASE WHEN spend > 0 THEN ROUND(revenue / spend, 2) ELSE 0 END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

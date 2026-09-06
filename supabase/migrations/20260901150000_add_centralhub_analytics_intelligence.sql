-- CentralHub Analytics & Marketing Intelligence foundation
-- Store-isolated analytics metadata; CentralHub is the private reporting layer.

CREATE TABLE IF NOT EXISTS public.analytics_store_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  ga4_property_id text,
  ga4_measurement_id text,
  search_console_property text,
  google_ads_customer_id text,
  meta_dataset_id text,
  public_tracking_enabled boolean NOT NULL DEFAULT false,
  realtime_enabled boolean NOT NULL DEFAULT true,
  ecommerce_tracking_enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_ga4_sync_at timestamptz,
  last_search_sync_at timestamptz,
  last_ads_sync_at timestamptz,
  last_meta_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analytics_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  session_key text NOT NULL,
  anonymous_id text,
  source text,
  medium text,
  campaign text,
  campaign_id text,
  content text,
  term text,
  referrer text,
  landing_page text,
  country text,
  region text,
  city text,
  device_category text,
  browser text,
  operating_system text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  page_count integer NOT NULL DEFAULT 0,
  event_count integer NOT NULL DEFAULT 0,
  engaged boolean NOT NULL DEFAULT false,
  converted boolean NOT NULL DEFAULT false,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  UNIQUE(store_id, session_key)
);

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.analytics_sessions(id) ON DELETE CASCADE,
  anonymous_id text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  page_url text,
  page_title text,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text,
  product_value numeric(15,2),
  currency text,
  source text,
  medium text,
  campaign text,
  campaign_id text,
  content text,
  term text,
  referrer text,
  country text,
  region text,
  city text,
  device_category text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analytics_campaign_attribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  external_campaign_id text,
  source text NOT NULL,
  medium text,
  campaign_name text,
  attribution_model text NOT NULL DEFAULT 'last_non_direct',
  visitors bigint NOT NULL DEFAULT 0,
  sessions bigint NOT NULL DEFAULT 0,
  product_views bigint NOT NULL DEFAULT 0,
  add_to_carts bigint NOT NULL DEFAULT 0,
  checkouts bigint NOT NULL DEFAULT 0,
  orders bigint NOT NULL DEFAULT 0,
  revenue numeric(15,2) NOT NULL DEFAULT 0,
  spend numeric(15,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, campaign_id, external_campaign_id, source, medium, attribution_model)
);

CREATE TABLE IF NOT EXISTS public.analytics_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  source text NOT NULL DEFAULT '(not set)',
  medium text NOT NULL DEFAULT '(not set)',
  campaign text NOT NULL DEFAULT '(not set)',
  users bigint NOT NULL DEFAULT 0,
  sessions bigint NOT NULL DEFAULT 0,
  engaged_sessions bigint NOT NULL DEFAULT 0,
  page_views bigint NOT NULL DEFAULT 0,
  product_views bigint NOT NULL DEFAULT 0,
  add_to_carts bigint NOT NULL DEFAULT 0,
  checkouts bigint NOT NULL DEFAULT 0,
  purchases bigint NOT NULL DEFAULT 0,
  revenue numeric(15,2) NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  spend numeric(15,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, metric_date, source, medium, campaign)
);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_store_last_seen ON public.analytics_sessions(store_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_store_source ON public.analytics_sessions(store_id, source, medium, campaign);
CREATE INDEX IF NOT EXISTS idx_analytics_events_store_time ON public.analytics_events(store_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_store_event ON public.analytics_events(store_id, event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_product ON public.analytics_events(store_id, product_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_campaign ON public.analytics_events(store_id, campaign, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_store_date ON public.analytics_daily_metrics(store_id, metric_date DESC);

ALTER TABLE public.analytics_store_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_campaign_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Analytics config admin access" ON public.analytics_store_configs;
CREATE POLICY "Analytics config admin access" ON public.analytics_store_configs
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Analytics sessions admin access" ON public.analytics_sessions;
CREATE POLICY "Analytics sessions admin access" ON public.analytics_sessions
  FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Analytics events admin access" ON public.analytics_events;
CREATE POLICY "Analytics events admin access" ON public.analytics_events
  FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Analytics attribution admin access" ON public.analytics_campaign_attribution;
CREATE POLICY "Analytics attribution admin access" ON public.analytics_campaign_attribution
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Analytics daily admin access" ON public.analytics_daily_metrics;
CREATE POLICY "Analytics daily admin access" ON public.analytics_daily_metrics
  FOR SELECT TO authenticated USING (is_admin());

CREATE OR REPLACE FUNCTION public.analytics_get_realtime(p_store_id uuid DEFAULT NULL)
RETURNS TABLE (
  store_id uuid,
  active_users bigint,
  active_sessions bigint,
  page_views bigint,
  product_views bigint,
  add_to_carts bigint,
  checkout_users bigint,
  top_page text,
  top_product text,
  top_source text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.store_id,
    count(DISTINCT COALESCE(s.anonymous_id, s.session_key)) FILTER (WHERE s.last_seen_at >= now() - interval '30 minutes') AS active_users,
    count(*) FILTER (WHERE s.last_seen_at >= now() - interval '30 minutes') AS active_sessions,
    count(e.id) FILTER (WHERE e.event_name = 'page_view' AND e.occurred_at >= now() - interval '30 minutes') AS page_views,
    count(e.id) FILTER (WHERE e.event_name IN ('view_item','product_view') AND e.occurred_at >= now() - interval '30 minutes') AS product_views,
    count(e.id) FILTER (WHERE e.event_name = 'add_to_cart' AND e.occurred_at >= now() - interval '30 minutes') AS add_to_carts,
    count(DISTINCT s.session_key) FILTER (WHERE e.event_name = 'begin_checkout' AND e.occurred_at >= now() - interval '30 minutes') AS checkout_users,
    (SELECT e2.page_title FROM analytics_events e2 WHERE e2.store_id = s.store_id AND e2.event_name = 'page_view' AND e2.occurred_at >= now() - interval '30 minutes' GROUP BY e2.page_title ORDER BY count(*) DESC LIMIT 1) AS top_page,
    (SELECT e3.product_name FROM analytics_events e3 WHERE e3.store_id = s.store_id AND e3.event_name IN ('view_item','product_view') AND e3.occurred_at >= now() - interval '30 minutes' GROUP BY e3.product_name ORDER BY count(*) DESC LIMIT 1) AS top_product,
    (SELECT COALESCE(e4.source, '(direct)') FROM analytics_events e4 WHERE e4.store_id = s.store_id AND e4.occurred_at >= now() - interval '30 minutes' GROUP BY COALESCE(e4.source, '(direct)') ORDER BY count(*) DESC LIMIT 1) AS top_source
  FROM analytics_sessions s
  LEFT JOIN analytics_events e ON e.session_id = s.id
  WHERE (p_store_id IS NULL OR s.store_id = p_store_id)
    AND s.last_seen_at >= now() - interval '30 minutes'
    AND is_admin()
  GROUP BY s.store_id;
$$;

REVOKE ALL ON FUNCTION public.analytics_get_realtime(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_get_realtime(uuid) TO authenticated;

COMMENT ON TABLE public.analytics_store_configs IS 'Private CentralHub mapping of each store to its independent analytics properties. Never expose CentralHub identifiers to external analytics providers.';
COMMENT ON TABLE public.analytics_events IS 'Privacy-safe CentralHub event mirror for attribution and business intelligence. Do not store PII or payment data here.';
COMMENT ON TABLE public.analytics_campaign_attribution IS 'CentralHub-normalised campaign attribution joining external analytics with internal marketing campaigns and orders.';

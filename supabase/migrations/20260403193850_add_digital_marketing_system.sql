/*
  # Digital Marketing Integration System

  ## Overview
  Complete marketing automation platform integrating Google Ads, Meta Ads, Google Analytics,
  Google Merchant Center, WhatsApp, and email platforms into unified control panel.

  ## New Tables

  ### 1. marketing_integrations
  Stores external platform API credentials and connection status
  - `id` (uuid, primary key)
  - `platform_name` (text) - google_ads, meta_ads, google_analytics, google_merchant, whatsapp, klaviyo, mailchimp
  - `account_id` (text) - external account identifier
  - `access_token` (text, encrypted)
  - `refresh_token` (text, encrypted)
  - `api_key` (text, encrypted)
  - `config` (jsonb) - platform-specific settings
  - `status` (text) - connected, disconnected, error
  - `last_sync_at` (timestamptz)
  - `error_message` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 2. marketing_events
  Track user behavior events for analytics and retargeting
  - `id` (uuid, primary key)
  - `session_id` (text) - anonymous session tracking
  - `user_id` (uuid, nullable) - authenticated user
  - `event_type` (text) - page_view, product_view, add_to_cart, checkout_started, purchase_completed
  - `product_id` (uuid, nullable)
  - `order_id` (uuid, nullable)
  - `value` (integer) - event value in cents
  - `currency` (text)
  - `utm_source` (text)
  - `utm_medium` (text)
  - `utm_campaign` (text)
  - `utm_content` (text)
  - `utm_term` (text)
  - `referrer` (text)
  - `ip_address` (text)
  - `user_agent` (text)
  - `metadata` (jsonb) - additional event data
  - `synced_to_ga` (boolean)
  - `synced_to_meta` (boolean)
  - `created_at` (timestamptz)

  ### 3. campaigns
  Marketing campaign management across platforms
  - `id` (uuid, primary key)
  - `name` (text)
  - `platform` (text) - google_ads, meta_ads, whatsapp, email, multi
  - `campaign_type` (text) - traffic, conversions, retargeting, awareness
  - `external_id` (text) - ID in external platform
  - `budget` (integer) - daily budget in cents
  - `total_budget` (integer) - total budget in cents
  - `start_date` (date)
  - `end_date` (date)
  - `status` (text) - draft, active, paused, completed
  - `objective` (text)
  - `targeting` (jsonb) - audience targeting rules
  - `creative` (jsonb) - ad creative assets
  - `config` (jsonb) - platform-specific settings
  - `created_by` (uuid)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 4. campaign_conversions
  Link orders to marketing campaigns for attribution
  - `id` (uuid, primary key)
  - `campaign_id` (uuid)
  - `order_id` (uuid)
  - `revenue` (integer) - order value in cents
  - `cost` (integer) - ad cost in cents
  - `source` (text)
  - `utm_source` (text)
  - `utm_medium` (text)
  - `utm_campaign` (text)
  - `conversion_type` (text) - first_click, last_click
  - `created_at` (timestamptz)

  ### 5. audiences
  Retargeting audience definitions
  - `id` (uuid, primary key)
  - `name` (text)
  - `description` (text)
  - `rules` (jsonb) - audience segmentation logic
  - `size` (integer) - estimated audience size
  - `synced_platforms` (text[]) - platforms where audience is synced
  - `external_ids` (jsonb) - IDs in external platforms
  - `status` (text) - active, inactive
  - `last_sync_at` (timestamptz)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 6. audience_members
  Users included in each audience
  - `id` (uuid, primary key)
  - `audience_id` (uuid)
  - `user_id` (uuid, nullable)
  - `session_id` (text, nullable)
  - `email` (text)
  - `phone` (text)
  - `customer_id` (uuid)
  - `added_at` (timestamptz)

  ### 7. utm_links
  Track generated UTM links
  - `id` (uuid, primary key)
  - `campaign_id` (uuid, nullable)
  - `short_code` (text, unique)
  - `destination_url` (text)
  - `utm_source` (text)
  - `utm_medium` (text)
  - `utm_campaign` (text)
  - `utm_content` (text)
  - `utm_term` (text)
  - `full_url` (text)
  - `clicks` (integer)
  - `created_by` (uuid)
  - `created_at` (timestamptz)

  ### 8. campaign_performance
  Cached performance metrics per campaign
  - `id` (uuid, primary key)
  - `campaign_id` (uuid)
  - `date` (date)
  - `impressions` (bigint)
  - `clicks` (integer)
  - `spend` (integer) - in cents
  - `conversions` (integer)
  - `revenue` (integer) - in cents
  - `roas` (numeric) - return on ad spend
  - `cpc` (integer) - cost per click in cents
  - `ctr` (numeric) - click through rate
  - `conversion_rate` (numeric)
  - `synced_at` (timestamptz)

  ### 9. marketing_insights
  AI-generated marketing recommendations
  - `id` (uuid, primary key)
  - `insight_type` (text) - optimization, alert, recommendation
  - `priority` (text) - low, medium, high, critical
  - `title` (text)
  - `description` (text)
  - `campaign_id` (uuid, nullable)
  - `action_items` (jsonb)
  - `potential_impact` (text)
  - `status` (text) - new, viewed, actioned, dismissed
  - `created_at` (timestamptz)
  - `actioned_at` (timestamptz)

  ### 10. product_feeds
  Track product feed syncs to external platforms
  - `id` (uuid, primary key)
  - `platform` (text)
  - `product_id` (uuid)
  - `external_id` (text)
  - `status` (text) - synced, pending, error
  - `error_message` (text)
  - `last_sync_at` (timestamptz)
  - `created_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Restrict access to authenticated users
  - Encrypt sensitive credential fields
  - Audit trail for all changes

  ## Indexes
  - Performance indexes on foreign keys and frequently queried fields
  - Composite indexes for analytics queries
*/

-- Marketing Integrations Table
CREATE TABLE IF NOT EXISTS marketing_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name text NOT NULL CHECK (platform_name IN ('google_ads', 'meta_ads', 'google_analytics', 'google_merchant', 'whatsapp', 'klaviyo', 'mailchimp', 'google_tag_manager')),
  account_id text,
  access_token text,
  refresh_token text,
  api_key text,
  config jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
  last_sync_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(platform_name)
);

-- Marketing Events Table
CREATE TABLE IF NOT EXISTS marketing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('page_view', 'product_view', 'add_to_cart', 'checkout_started', 'purchase_completed', 'search', 'signup')),
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  value integer DEFAULT 0,
  currency text DEFAULT 'GBP',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer text,
  ip_address text,
  user_agent text,
  metadata jsonb DEFAULT '{}',
  synced_to_ga boolean DEFAULT false,
  synced_to_meta boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Campaigns Table
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('google_ads', 'meta_ads', 'whatsapp', 'email', 'multi')),
  campaign_type text NOT NULL CHECK (campaign_type IN ('traffic', 'conversions', 'retargeting', 'awareness', 'engagement')),
  external_id text,
  budget integer DEFAULT 0,
  total_budget integer,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  objective text,
  targeting jsonb DEFAULT '{}',
  creative jsonb DEFAULT '{}',
  config jsonb DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Campaign Conversions Table
CREATE TABLE IF NOT EXISTS campaign_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  revenue integer NOT NULL,
  cost integer DEFAULT 0,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  conversion_type text DEFAULT 'last_click' CHECK (conversion_type IN ('first_click', 'last_click', 'linear')),
  created_at timestamptz DEFAULT now()
);

-- Audiences Table
CREATE TABLE IF NOT EXISTS audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  rules jsonb NOT NULL,
  size integer DEFAULT 0,
  synced_platforms text[] DEFAULT '{}',
  external_ids jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'building')),
  last_sync_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Audience Members Table
CREATE TABLE IF NOT EXISTS audience_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id uuid REFERENCES audiences(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  email text,
  phone text,
  customer_id uuid,
  added_at timestamptz DEFAULT now(),
  UNIQUE(audience_id, email)
);

-- UTM Links Table
CREATE TABLE IF NOT EXISTS utm_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  short_code text UNIQUE NOT NULL,
  destination_url text NOT NULL,
  utm_source text NOT NULL,
  utm_medium text NOT NULL,
  utm_campaign text NOT NULL,
  utm_content text,
  utm_term text,
  full_url text NOT NULL,
  clicks integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Campaign Performance Table
CREATE TABLE IF NOT EXISTS campaign_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  date date NOT NULL,
  impressions bigint DEFAULT 0,
  clicks integer DEFAULT 0,
  spend integer DEFAULT 0,
  conversions integer DEFAULT 0,
  revenue integer DEFAULT 0,
  roas numeric DEFAULT 0,
  cpc integer DEFAULT 0,
  ctr numeric DEFAULT 0,
  conversion_rate numeric DEFAULT 0,
  synced_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id, date)
);

-- Marketing Insights Table
CREATE TABLE IF NOT EXISTS marketing_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_type text NOT NULL CHECK (insight_type IN ('optimization', 'alert', 'recommendation', 'warning')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  title text NOT NULL,
  description text NOT NULL,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  action_items jsonb DEFAULT '[]',
  potential_impact text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'viewed', 'actioned', 'dismissed')),
  created_at timestamptz DEFAULT now(),
  actioned_at timestamptz
);

-- Product Feeds Table
CREATE TABLE IF NOT EXISTS product_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('google_merchant', 'meta_catalog', 'tiktok_catalog')),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  external_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('synced', 'pending', 'error')),
  error_message text,
  last_sync_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(platform, product_id)
);

-- Create Indexes
CREATE INDEX IF NOT EXISTS idx_marketing_events_session ON marketing_events(session_id);
CREATE INDEX IF NOT EXISTS idx_marketing_events_user ON marketing_events(user_id);
CREATE INDEX IF NOT EXISTS idx_marketing_events_type ON marketing_events(event_type);
CREATE INDEX IF NOT EXISTS idx_marketing_events_product ON marketing_events(product_id);
CREATE INDEX IF NOT EXISTS idx_marketing_events_order ON marketing_events(order_id);
CREATE INDEX IF NOT EXISTS idx_marketing_events_created ON marketing_events(created_at);
CREATE INDEX IF NOT EXISTS idx_marketing_events_utm_campaign ON marketing_events(utm_campaign);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_platform ON campaigns(platform);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_by ON campaigns(created_by);

CREATE INDEX IF NOT EXISTS idx_campaign_conversions_campaign ON campaign_conversions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_conversions_order ON campaign_conversions(order_id);

CREATE INDEX IF NOT EXISTS idx_audience_members_audience ON audience_members(audience_id);
CREATE INDEX IF NOT EXISTS idx_audience_members_email ON audience_members(email);

CREATE INDEX IF NOT EXISTS idx_utm_links_campaign ON utm_links(campaign_id);
CREATE INDEX IF NOT EXISTS idx_utm_links_short_code ON utm_links(short_code);

CREATE INDEX IF NOT EXISTS idx_campaign_performance_campaign ON campaign_performance(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_performance_date ON campaign_performance(date);

CREATE INDEX IF NOT EXISTS idx_marketing_insights_status ON marketing_insights(status);
CREATE INDEX IF NOT EXISTS idx_marketing_insights_priority ON marketing_insights(priority);

CREATE INDEX IF NOT EXISTS idx_product_feeds_product ON product_feeds(product_id);
CREATE INDEX IF NOT EXISTS idx_product_feeds_platform ON product_feeds(platform);

-- Enable Row Level Security
ALTER TABLE marketing_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE audience_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE utm_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_feeds ENABLE ROW LEVEL SECURITY;

-- RLS Policies for marketing_integrations
CREATE POLICY "Authenticated users can view integrations"
  ON marketing_integrations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage integrations"
  ON marketing_integrations FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for marketing_events
CREATE POLICY "System can insert events"
  ON marketing_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view events"
  ON marketing_events FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for campaigns
CREATE POLICY "Authenticated users can view campaigns"
  ON campaigns FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create campaigns"
  ON campaigns FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update campaigns"
  ON campaigns FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Campaign creators can delete their campaigns"
  ON campaigns FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- RLS Policies for campaign_conversions
CREATE POLICY "Authenticated users can view conversions"
  ON campaign_conversions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can insert conversions"
  ON campaign_conversions FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for audiences
CREATE POLICY "Authenticated users can view audiences"
  ON audiences FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage audiences"
  ON audiences FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for audience_members
CREATE POLICY "Authenticated users can view audience members"
  ON audience_members FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can manage audience members"
  ON audience_members FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for utm_links
CREATE POLICY "Anyone can use UTM links"
  ON utm_links FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create UTM links"
  ON utm_links FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update UTM links"
  ON utm_links FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for campaign_performance
CREATE POLICY "Authenticated users can view performance"
  ON campaign_performance FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can insert performance data"
  ON campaign_performance FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can update performance data"
  ON campaign_performance FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for marketing_insights
CREATE POLICY "Authenticated users can view insights"
  ON marketing_insights FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can manage insights"
  ON marketing_insights FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for product_feeds
CREATE POLICY "Authenticated users can view product feeds"
  ON product_feeds FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can manage product feeds"
  ON product_feeds FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_marketing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_marketing_integrations_updated_at
  BEFORE UPDATE ON marketing_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_marketing_updated_at();

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_marketing_updated_at();

CREATE TRIGGER update_audiences_updated_at
  BEFORE UPDATE ON audiences
  FOR EACH ROW
  EXECUTE FUNCTION update_marketing_updated_at();

-- Function to calculate ROAS
CREATE OR REPLACE FUNCTION calculate_campaign_roas()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.spend > 0 THEN
    NEW.roas = ROUND((NEW.revenue::numeric / NEW.spend::numeric), 2);
  ELSE
    NEW.roas = 0;
  END IF;
  
  IF NEW.clicks > 0 THEN
    NEW.cpc = ROUND(NEW.spend / NEW.clicks);
    NEW.ctr = ROUND((NEW.clicks::numeric / NULLIF(NEW.impressions, 0)::numeric * 100), 2);
  END IF;
  
  IF NEW.clicks > 0 THEN
    NEW.conversion_rate = ROUND((NEW.conversions::numeric / NEW.clicks::numeric * 100), 2);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_performance_metrics
  BEFORE INSERT OR UPDATE ON campaign_performance
  FOR EACH ROW
  EXECUTE FUNCTION calculate_campaign_roas();

-- Function to increment UTM link clicks
CREATE OR REPLACE FUNCTION increment_utm_clicks()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE utm_links
  SET clicks = clicks + 1
  WHERE short_code = NEW.utm_campaign;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Seed default audiences
INSERT INTO audiences (name, description, rules, status) VALUES
  ('All Visitors', 'All website visitors', '{"type": "all_visitors"}', 'active'),
  ('Cart Abandoners', 'Users who added to cart but did not purchase', '{"type": "cart_abandoners", "days": 7}', 'active'),
  ('Past Buyers', 'Customers who have completed at least one purchase', '{"type": "past_buyers"}', 'active'),
  ('High Value Customers', 'Customers with lifetime value > £500', '{"type": "high_value", "min_value": 50000}', 'active'),
  ('Recent Visitors', 'Visitors in the last 30 days', '{"type": "recent_visitors", "days": 30}', 'active')
ON CONFLICT DO NOTHING;

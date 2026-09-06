/*
  # Event-Driven Communication System (Production-Grade)

  This migration creates a complete event-driven messaging system for multi-tenant ecommerce platforms.
  Inspired by Shopify + Klaviyo architecture.

  ## 1. New Tables

  ### messages (Message Queue)
  - `id` (uuid, primary key)
  - `phone` (text, recipient phone)
  - `email` (text, nullable, recipient email)
  - `message` (text, final message content)
  - `channel` (text, sms/whatsapp/email)
  - `status` (text, pending/processing/sent/failed)
  - `retries` (integer, retry count, default 0)
  - `max_retries` (integer, default 3)
  - `site` (text, multi-tenant identifier: KG, SiteB, etc)
  - `template_id` (uuid, nullable, reference to template)
  - `event_id` (uuid, nullable, reference to event)
  - `campaign_id` (uuid, nullable, reference to campaign)
  - `metadata` (jsonb, additional data)
  - `error_message` (text, nullable, last error)
  - `created_at` (timestamp)
  - `scheduled_at` (timestamp, when to send)
  - `sent_at` (timestamp, nullable, when actually sent)
  - `delivered_at` (timestamp, nullable)
  - `provider_id` (text, nullable, Twilio SID)

  ### message_templates (Reusable Templates)
  - `id` (uuid, primary key)
  - `name` (text, unique identifier)
  - `display_name` (text, human-readable name)
  - `content` (text, template with {variables})
  - `channel` (text, sms/whatsapp/email)
  - `category` (text, transactional/marketing/otp/system)
  - `site` (text, nullable, site-specific template)
  - `variables` (jsonb, list of available variables)
  - `is_active` (boolean)
  - `created_at` (timestamp)
  - `updated_at` (timestamp)

  ### events (Event Log)
  - `id` (uuid, primary key)
  - `type` (text, signup/otp_request/order_placed/packed/shipped/delivered)
  - `payload` (jsonb, event data)
  - `site` (text, which site triggered event)
  - `user_id` (uuid, nullable)
  - `order_id` (uuid, nullable)
  - `processed` (boolean, default false)
  - `created_at` (timestamp)

  ### automations (Event → Message Rules)
  - `id` (uuid, primary key)
  - `name` (text)
  - `event_type` (text, which event triggers this)
  - `template_id` (uuid, which template to use)
  - `delay_minutes` (integer, delay before sending, default 0)
  - `channel` (text, sms/whatsapp/email)
  - `site` (text, nullable, site-specific automation)
  - `conditions` (jsonb, nullable, filtering conditions)
  - `is_active` (boolean)
  - `priority` (integer, default 0, higher = more important)
  - `created_at` (timestamp)
  - `updated_at` (timestamp)

  ### campaigns (Marketing Campaigns)
  - `id` (uuid, primary key)
  - `name` (text)
  - `message` (text, campaign message)
  - `channel` (text, sms/whatsapp/email)
  - `audience_filter` (jsonb, who receives this)
  - `site` (text)
  - `scheduled_at` (timestamp, nullable)
  - `status` (text, draft/scheduled/sending/sent/cancelled)
  - `total_recipients` (integer, default 0)
  - `sent_count` (integer, default 0)
  - `delivered_count` (integer, default 0)
  - `failed_count` (integer, default 0)
  - `created_by` (uuid, nullable)
  - `created_at` (timestamp)
  - `started_at` (timestamp, nullable)
  - `completed_at` (timestamp, nullable)

  ### otp_codes (OTP System)
  - `id` (uuid, primary key)
  - `phone` (text)
  - `code` (text, 6-digit code)
  - `purpose` (text, login/signup/verify)
  - `site` (text)
  - `verified` (boolean, default false)
  - `expires_at` (timestamp)
  - `created_at` (timestamp)

  ### user_communication_preferences (Opt-in/Opt-out)
  - `id` (uuid, primary key)
  - `user_id` (uuid, nullable)
  - `phone` (text)
  - `email` (text, nullable)
  - `site` (text)
  - `marketing_sms` (boolean, default true)
  - `marketing_whatsapp` (boolean, default true)
  - `marketing_email` (boolean, default true)
  - `transactional_sms` (boolean, default true)
  - `transactional_whatsapp` (boolean, default true)
  - `transactional_email` (boolean, default true)
  - `preferred_channel` (text, nullable, sms/whatsapp/email)
  - `created_at` (timestamp)
  - `updated_at` (timestamp)

  ## 2. Security
  - Enable RLS on all tables
  - Authenticated users can manage all communication data
  - Policies for read/write access

  ## 3. Indexes
  - Performance indexes for queue processing
  - Indexes on status, scheduled_at for worker
  - Indexes on event type for automation matching
*/

-- Messages Queue Table
CREATE TABLE IF NOT EXISTS comm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  email text,
  message text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'email')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  retries integer DEFAULT 0,
  max_retries integer DEFAULT 3,
  site text NOT NULL,
  template_id uuid,
  event_id uuid,
  campaign_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz DEFAULT now(),
  scheduled_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  provider_id text
);

-- Message Templates Table
CREATE TABLE IF NOT EXISTS comm_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  content text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'email')),
  category text NOT NULL CHECK (category IN ('transactional', 'marketing', 'otp', 'system')),
  site text,
  variables jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Events Table
CREATE TABLE IF NOT EXISTS comm_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  site text NOT NULL,
  user_id uuid,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  processed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Automations Table
CREATE TABLE IF NOT EXISTS comm_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  event_type text NOT NULL,
  template_id uuid REFERENCES comm_templates(id) ON DELETE CASCADE,
  delay_minutes integer DEFAULT 0,
  channel text NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'email')),
  site text,
  conditions jsonb,
  is_active boolean DEFAULT true,
  priority integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Campaigns Table
CREATE TABLE IF NOT EXISTS comm_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  message text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'email')),
  audience_filter jsonb DEFAULT '{}'::jsonb,
  site text NOT NULL,
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  total_recipients integer DEFAULT 0,
  sent_count integer DEFAULT 0,
  delivered_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- OTP Codes Table
CREATE TABLE IF NOT EXISTS comm_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('login', 'signup', 'verify', 'reset_password')),
  site text NOT NULL,
  verified boolean DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- User Communication Preferences Table
CREATE TABLE IF NOT EXISTS comm_user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  phone text NOT NULL,
  email text,
  site text NOT NULL,
  marketing_sms boolean DEFAULT true,
  marketing_whatsapp boolean DEFAULT true,
  marketing_email boolean DEFAULT true,
  transactional_sms boolean DEFAULT true,
  transactional_whatsapp boolean DEFAULT true,
  transactional_email boolean DEFAULT true,
  preferred_channel text CHECK (preferred_channel IN ('sms', 'whatsapp', 'email')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(phone, site)
);

-- Enable RLS
ALTER TABLE comm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view messages"
  ON comm_messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert messages"
  ON comm_messages FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update messages"
  ON comm_messages FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete messages"
  ON comm_messages FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view templates"
  ON comm_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert templates"
  ON comm_templates FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update templates"
  ON comm_templates FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete templates"
  ON comm_templates FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view events"
  ON comm_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert events"
  ON comm_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update events"
  ON comm_events FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view automations"
  ON comm_automations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert automations"
  ON comm_automations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update automations"
  ON comm_automations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete automations"
  ON comm_automations FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view campaigns"
  ON comm_campaigns FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert campaigns"
  ON comm_campaigns FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update campaigns"
  ON comm_campaigns FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete campaigns"
  ON comm_campaigns FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view OTP codes"
  ON comm_otp_codes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert OTP codes"
  ON comm_otp_codes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update OTP codes"
  ON comm_otp_codes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view preferences"
  ON comm_user_preferences FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert preferences"
  ON comm_user_preferences FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update preferences"
  ON comm_user_preferences FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_comm_messages_status ON comm_messages(status);
CREATE INDEX IF NOT EXISTS idx_comm_messages_scheduled ON comm_messages(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_comm_messages_site ON comm_messages(site);
CREATE INDEX IF NOT EXISTS idx_comm_messages_channel ON comm_messages(channel);
CREATE INDEX IF NOT EXISTS idx_comm_messages_created ON comm_messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comm_events_type ON comm_events(type);
CREATE INDEX IF NOT EXISTS idx_comm_events_processed ON comm_events(processed);
CREATE INDEX IF NOT EXISTS idx_comm_events_site ON comm_events(site);
CREATE INDEX IF NOT EXISTS idx_comm_events_created ON comm_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comm_automations_event_type ON comm_automations(event_type);
CREATE INDEX IF NOT EXISTS idx_comm_automations_active ON comm_automations(is_active);
CREATE INDEX IF NOT EXISTS idx_comm_automations_site ON comm_automations(site);

CREATE INDEX IF NOT EXISTS idx_comm_campaigns_status ON comm_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_comm_campaigns_scheduled ON comm_campaigns(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_comm_campaigns_site ON comm_campaigns(site);

CREATE INDEX IF NOT EXISTS idx_comm_otp_phone ON comm_otp_codes(phone);
CREATE INDEX IF NOT EXISTS idx_comm_otp_expires ON comm_otp_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_comm_otp_verified ON comm_otp_codes(verified);

-- Insert Default Templates
INSERT INTO comm_templates (name, display_name, content, channel, category, variables) VALUES
  ('otp_login', 'OTP Login', 'Your OTP code is {code}. Valid for 10 minutes. Do not share this code.', 'sms', 'otp', '["code"]'::jsonb),
  ('order_confirmed', 'Order Confirmed', 'Hi {customer_name}, your order #{order_number} is confirmed! Total: £{total}. We''ll notify you when it ships.', 'sms', 'transactional', '["customer_name", "order_number", "total"]'::jsonb),
  ('order_packed', 'Order Packed', 'Good news {customer_name}! Your order #{order_number} is packed and ready to ship.', 'sms', 'transactional', '["customer_name", "order_number"]'::jsonb),
  ('order_shipped', 'Order Shipped', 'Your order #{order_number} has shipped! Track: {tracking_url}', 'sms', 'transactional', '["order_number", "tracking_url"]'::jsonb),
  ('order_delivered', 'Order Delivered', 'Your order #{order_number} was delivered. How was your experience? Rate us: {rating_url}', 'sms', 'transactional', '["order_number", "rating_url"]'::jsonb),
  ('welcome_new_customer', 'Welcome Message', 'Welcome to {site_name}! Use code WELCOME10 for 10% off your first order.', 'sms', 'marketing', '["site_name"]'::jsonb),
  ('abandoned_cart', 'Cart Reminder', 'Hi {customer_name}, you left items in your cart. Complete your order now: {cart_url}', 'sms', 'marketing', '["customer_name", "cart_url"]'::jsonb),
  ('reorder_reminder', 'Reorder Reminder', 'Hi {customer_name}! Time to restock {product_name}? Reorder now: {product_url}', 'sms', 'marketing', '["customer_name", "product_name", "product_url"]'::jsonb),
  ('review_request', 'Review Request', 'Hi {customer_name}! How was {product_name}? Share your review: {review_url}', 'sms', 'marketing', '["customer_name", "product_name", "review_url"]'::jsonb),
  ('flash_sale', 'Flash Sale Alert', 'FLASH SALE! {discount}% off on {category}. Limited time. Shop now: {sale_url}', 'sms', 'marketing', '["discount", "category", "sale_url"]'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Insert Default Automations
INSERT INTO comm_automations (name, event_type, template_id, delay_minutes, channel, is_active, priority) 
SELECT 
  'Auto: Order Confirmation',
  'order_placed',
  (SELECT id FROM comm_templates WHERE name = 'order_confirmed'),
  0,
  'sms',
  true,
  10
WHERE EXISTS (SELECT 1 FROM comm_templates WHERE name = 'order_confirmed');

INSERT INTO comm_automations (name, event_type, template_id, delay_minutes, channel, is_active, priority)
SELECT 
  'Auto: Order Shipped',
  'order_shipped',
  (SELECT id FROM comm_templates WHERE name = 'order_shipped'),
  0,
  'sms',
  true,
  10
WHERE EXISTS (SELECT 1 FROM comm_templates WHERE name = 'order_shipped');

INSERT INTO comm_automations (name, event_type, template_id, delay_minutes, channel, is_active, priority)
SELECT 
  'Auto: Review Request (5 days after delivery)',
  'order_delivered',
  (SELECT id FROM comm_templates WHERE name = 'review_request'),
  7200,
  'sms',
  true,
  5
WHERE EXISTS (SELECT 1 FROM comm_templates WHERE name = 'review_request');

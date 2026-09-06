-- Centralized WhatsApp Automation Architecture
-- Consolidation of events, mappings, and security challenges

-- 1. Canonical Event/Template Mapping Table
CREATE TABLE IF NOT EXISTS public.whatsapp_event_template_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  event_key text NOT NULL, -- e.g. 'order.confirmed', 'account.login.otp'
  event_type text NOT NULL, -- TRANSACTIONAL, AUTHENTICATION, MARKETING
  event_source text NOT NULL, -- ORDER_SERVICE, AUTH_SERVICE, SHIPPING_SERVICE
  description text,
  template_id uuid REFERENCES public.whatsapp_template_registry(id) ON DELETE SET NULL,
  channel_id uuid REFERENCES public.whatsapp_channels(id) ON DELETE SET NULL,
  enabled boolean DEFAULT true,
  customer_visible boolean DEFAULT true,
  requires_opt_in boolean DEFAULT false,
  variables jsonb DEFAULT '[]'::jsonb,
  trigger_function text,
  trigger_table text,
  trigger_condition jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(store_id, event_key)
);

-- 2. Catalog View for Frontend
CREATE OR REPLACE VIEW public.whatsapp_event_template_catalog AS
SELECT
  m.id,
  m.store_id,
  m.event_key,
  m.event_type,
  m.event_source,
  m.description,
  m.enabled,
  m.customer_visible,
  m.requires_opt_in,
  m.variables,
  m.trigger_function,
  m.trigger_table,
  tr.name as template_name,
  tr.language,
  tr.category,
  tr.status as template_status,
  wc.status as channel_status,
  tr.created_at as last_synced_at
FROM public.whatsapp_event_template_mappings m
LEFT JOIN public.whatsapp_template_registry tr ON m.template_id = tr.id
LEFT JOIN public.whatsapp_channels wc ON m.channel_id = wc.id;

-- 3. WhatsApp Auth Challenges (OTP)
CREATE TABLE IF NOT EXISTS public.whatsapp_auth_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('login', 'signup', 'verify', 'reset_password')),
  otp_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired', 'failed', 'invalidated')),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  request_ip text,
  user_agent text,
  whatsapp_message_id text
);

-- 4. Security (RLS)
ALTER TABLE public.whatsapp_event_template_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_auth_challenges ENABLE ROW LEVEL SECURITY;

-- Mappings Policies
DROP POLICY IF EXISTS "Staff can read mapping catalog" ON public.whatsapp_event_template_mappings;
CREATE POLICY "Staff can read mapping catalog" ON public.whatsapp_event_template_mappings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff can manage mappings" ON public.whatsapp_event_template_mappings;
CREATE POLICY "Staff can manage mappings" ON public.whatsapp_event_template_mappings
  FOR ALL TO authenticated USING (true);

-- Auth Challenges Policies
DROP POLICY IF EXISTS "Service role manages auth challenges" ON public.whatsapp_auth_challenges;
CREATE POLICY "Service role manages auth challenges" ON public.whatsapp_auth_challenges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public cannot access auth challenges" ON public.whatsapp_auth_challenges;
CREATE POLICY "Public cannot access auth challenges" ON public.whatsapp_auth_challenges
  FOR ALL TO public USING (false);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_wa_mappings_key ON public.whatsapp_event_template_mappings(event_key);
CREATE INDEX IF NOT EXISTS idx_wa_auth_phone ON public.whatsapp_auth_challenges(phone_number);
CREATE INDEX IF NOT EXISTS idx_wa_auth_expires ON public.whatsapp_auth_challenges(expires_at);

-- 6. Initial Seed for MalluSpices
INSERT INTO public.whatsapp_event_template_mappings
(store_id, event_key, event_type, event_source, description, enabled, variables, trigger_function, trigger_table)
SELECT
  id, 'account.login.otp', 'AUTHENTICATION', 'AUTH_SERVICE', 'Sends a 6-digit code for secure login', true, '["otp_code"]'::jsonb, 'whatsapp-otp (Edge Function)', 'whatsapp_auth_challenges'
FROM public.stores WHERE slug = 'malluspices'
ON CONFLICT (store_id, event_key) DO NOTHING;

INSERT INTO public.whatsapp_event_template_mappings
(store_id, event_key, event_type, event_source, description, enabled, variables, trigger_function, trigger_table)
SELECT
  id, 'order.received', 'TRANSACTIONAL', 'ORDER_SERVICE', 'Sent immediately when an order is placed', true, '["customer_name", "order_number", "order_total"]'::jsonb, 'OrderService.createOrder', 'orders'
FROM public.stores WHERE slug = 'malluspices'
ON CONFLICT (store_id, event_key) DO NOTHING;

INSERT INTO public.whatsapp_event_template_mappings
(store_id, event_key, event_type, event_source, description, enabled, variables, trigger_function, trigger_table)
SELECT
  id, 'order.confirmed', 'TRANSACTIONAL', 'ORDER_SERVICE', 'Sent when payment is confirmed', true, '["customer_name", "order_number"]'::jsonb, 'OrderService.confirmPayment', 'orders'
FROM public.stores WHERE slug = 'malluspices'
ON CONFLICT (store_id, event_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- WhatsApp Event/Template Mapping Registry
-- Provides a high-level catalog of all supported WhatsApp automations

CREATE TABLE IF NOT EXISTS public.whatsapp_event_template_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  event_key text NOT NULL, -- e.g. 'order.confirmed', 'account.otp'
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

-- Catalog View for Frontend
-- Securely exposes non-sensitive mapping info
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

-- Security
ALTER TABLE public.whatsapp_event_template_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read mapping catalog" ON public.whatsapp_event_template_mappings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can manage mappings" ON public.whatsapp_event_template_mappings
  FOR ALL TO authenticated USING (true);

-- Grant access to the view
GRANT SELECT ON public.whatsapp_event_template_catalog TO authenticated;

-- Seed initial MalluSpices mappings
INSERT INTO public.whatsapp_event_template_mappings
(store_id, event_key, event_type, event_source, description, enabled, variables, trigger_function, trigger_table)
SELECT
  id,
  'account.login.otp',
  'AUTHENTICATION',
  'AUTH_SERVICE',
  'Sends a 6-digit code for secure login',
  true,
  '["otp_code"]'::jsonb,
  'whatsapp-otp (Edge Function)',
  'whatsapp_auth_challenges'
FROM public.stores
WHERE slug = 'malluspices'
ON CONFLICT (store_id, event_key) DO NOTHING;

INSERT INTO public.whatsapp_event_template_mappings
(store_id, event_key, event_type, event_source, description, enabled, variables, trigger_function, trigger_table)
SELECT
  id,
  'order.received',
  'TRANSACTIONAL',
  'ORDER_SERVICE',
  'Sent immediately when an order is placed',
  true,
  '["customer_name", "order_number", "order_total"]'::jsonb,
  'OrderService.createOrder',
  'orders'
FROM public.stores
WHERE slug = 'malluspices'
ON CONFLICT (store_id, event_key) DO NOTHING;

INSERT INTO public.whatsapp_event_template_mappings
(store_id, event_key, event_type, event_source, description, enabled, variables, trigger_function, trigger_table)
SELECT
  id,
  'order.confirmed',
  'TRANSACTIONAL',
  'ORDER_SERVICE',
  'Sent when payment is confirmed',
  true,
  '["customer_name", "order_number"]'::jsonb,
  'OrderService.confirmPayment',
  'orders'
FROM public.stores
WHERE slug = 'malluspices'
ON CONFLICT (store_id, event_key) DO NOTHING;

-- CentralHub Communication System Hardening
-- Adds Idempotency and Detailed Outbound Tracking

-- 1. Idempotency Log
-- Ensures no duplicate messages are sent for the same event
CREATE TABLE IF NOT EXISTS public.comm_idempotency_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  event_key text NOT NULL, -- e.g. "order_confirmed:ORD123"
  provider text NOT NULL, -- e.g. "whatsapp"
  status text NOT NULL DEFAULT 'processed',
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, event_key, provider)
);

-- 2. WhatsApp Outbound Tracking
-- Detailed logging for outbound messages including delivery status
CREATE TABLE IF NOT EXISTS public.whatsapp_outbound_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.whatsapp_messages(id) ON DELETE CASCADE,
  wa_message_id text, -- Meta's ID
  store_id uuid NOT NULL,
  recipient_phone text NOT NULL,
  template_name text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  error_code text,
  error_message text,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 3. Communication Events Registry
-- Canonical list of events that can trigger automations
CREATE TABLE IF NOT EXISTS public.comm_event_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text UNIQUE NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN ('transactional', 'marketing')),
  required_variables jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Seed Registry
INSERT INTO public.comm_event_registry (event_type, description, category, required_variables) VALUES
('ORDER_RECEIVED', 'Triggered when a new order is created', 'transactional', '["customer_name", "order_number", "order_total"]'),
('PAYMENT_CONFIRMED', 'Triggered when payment is successfully verified', 'transactional', '["customer_name", "order_number"]'),
('ORDER_DISPATCHED', 'Triggered when order is handed over to courier', 'transactional', '["customer_name", "order_number", "tracking_number", "tracking_url"]'),
('ORDER_DELIVERED', 'Triggered when courier confirms delivery', 'transactional', '["customer_name", "order_number"]'),
('ORDER_CANCELLED', 'Triggered when an order is cancelled', 'transactional', '["customer_name", "order_number"]'),
('MARKETING_BROADCAST', 'Generic marketing blast', 'marketing', '[]')
ON CONFLICT (event_type) DO NOTHING;

-- 4. RLS Hardening
ALTER TABLE public.comm_idempotency_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_outbound_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comm_event_registry ENABLE ROW LEVEL SECURITY;

-- Standard Staff Policies
CREATE POLICY "Staff can view idempotency log" ON public.comm_idempotency_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can view outbound log" ON public.whatsapp_outbound_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Public can view event registry" ON public.comm_event_registry FOR SELECT TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_comm_idempotency_key ON public.comm_idempotency_log(event_key);
CREATE INDEX IF NOT EXISTS idx_wa_outbound_status ON public.whatsapp_outbound_log(status);
CREATE INDEX IF NOT EXISTS idx_wa_outbound_wa_id ON public.whatsapp_outbound_log(wa_message_id);
CREATE INDEX IF NOT EXISTS idx_wa_outbound_recipient ON public.whatsapp_outbound_log(recipient_phone);

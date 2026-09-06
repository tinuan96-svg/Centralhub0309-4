-- LOGS TABLES RESTORATION
-- Restores secondary logging tables used by Edge Functions.

-- 1. WhatsApp Outbound Log
CREATE TABLE IF NOT EXISTS public.whatsapp_outbound_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id text UNIQUE,
  message_id uuid REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  recipient_phone text NOT NULL,
  template_name text,
  status text NOT NULL DEFAULT 'sent',
  error_code text,
  error_message text,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 2. AI Usage Logs
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature text NOT NULL, -- customer_care, marketing, etc.
  model text NOT NULL,
  request_type text, -- initial_intent, final_response, etc.
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  duration_ms integer,
  status text DEFAULT 'success',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Security
ALTER TABLE public.whatsapp_outbound_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Staff view outbound logs" ON public.whatsapp_outbound_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff view ai logs" ON public.ai_usage_logs FOR SELECT TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wol_wa_id ON public.whatsapp_outbound_log(wa_message_id);
CREATE INDEX IF NOT EXISTS idx_aul_feature ON public.ai_usage_logs(feature);

NOTIFY pgrst, 'reload schema';

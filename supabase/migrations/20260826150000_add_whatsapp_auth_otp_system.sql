-- WhatsApp OTP Authentication System
-- Stores hashed OTPs for secure customer login

CREATE TABLE IF NOT EXISTS public.whatsapp_auth_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('login', 'signup', 'verify', 'reset_password')),
  otp_hash text NOT NULL, -- Never store plaintext
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired', 'failed', 'invalidated')),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  request_ip text,
  user_agent text,
  whatsapp_message_id text -- Link to the Meta message ID
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_wa_auth_phone ON public.whatsapp_auth_challenges(phone_number);
CREATE INDEX IF NOT EXISTS idx_wa_auth_status ON public.whatsapp_auth_challenges(status);
CREATE INDEX IF NOT EXISTS idx_wa_auth_expires ON public.whatsapp_auth_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_wa_auth_store ON public.whatsapp_auth_challenges(store_id);

-- Security
ALTER TABLE public.whatsapp_auth_challenges ENABLE ROW LEVEL SECURITY;

-- Policies
-- 1. Users (Service Role) can manage everything
-- 2. Regular users/anons should NOT be able to read or modify these records directly via PostgREST
-- Verification must happen via Edge Function (Service Role) for security.

CREATE POLICY "Service role manages auth challenges" ON public.whatsapp_auth_challenges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Explicitly deny anon/authenticated access to ensure everything goes through backend
CREATE POLICY "Public cannot access auth challenges" ON public.whatsapp_auth_challenges
  FOR ALL TO public USING (false);

-- Timestamp update trigger
CREATE OR REPLACE FUNCTION update_wa_auth_challenges_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_wa_auth_challenges_timestamp
BEFORE UPDATE ON public.whatsapp_auth_challenges
FOR EACH ROW EXECUTE FUNCTION update_wa_auth_challenges_timestamp();

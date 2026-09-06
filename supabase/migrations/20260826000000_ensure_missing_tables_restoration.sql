-- SCHEMA RESTORATION
-- Ensures tables reported missing or broken are correctly defined.

-- 1. WhatsApp Template Registry
CREATE TABLE IF NOT EXISTS public.whatsapp_template_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  meta_template_id text,
  meta_template_name text NOT NULL,
  category text NOT NULL,
  language text NOT NULL DEFAULT 'en_GB',
  variables jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, meta_template_name)
);

-- 2. Marketing Integrations
CREATE TABLE IF NOT EXISTS public.marketing_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  platform_name text NOT NULL, -- google_ads, meta_ads, etc.
  account_id text,
  access_token text,
  refresh_token text,
  status text DEFAULT 'disconnected',
  last_sync_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(store_id, platform_name)
);

-- 3. Bank Accounts (Redundant check)
CREATE TABLE IF NOT EXISTS public.store_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  bank_name text NOT NULL,
  account_name text NOT NULL,
  account_number text,
  currency text DEFAULT 'GBP',
  current_balance numeric(15,2) DEFAULT 0,
  last_synced_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid REFERENCES public.store_bank_accounts(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  transaction_date date NOT NULL,
  description text NOT NULL,
  amount numeric(15,2) NOT NULL,
  type text CHECK (type IN ('credit', 'debit')),
  balance numeric(15,2),
  reference text,
  merchant text,
  category text,
  source text DEFAULT 'monzo_csv',
  is_reconciled boolean DEFAULT false,
  reconciled_with_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(bank_account_id, transaction_date, description, amount, reference)
);

-- 4. WhatsApp Automations
CREATE TABLE IF NOT EXISTS public.whatsapp_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  event_type text NOT NULL,
  condition jsonb DEFAULT '{}'::jsonb,
  template_id uuid REFERENCES public.whatsapp_template_registry(id) ON DELETE CASCADE,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. Support Tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid,
  conversation_id uuid,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  category text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  ai_summary text,
  internal_notes text,
  resolution text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

-- Security
ALTER TABLE public.whatsapp_template_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Staff manage template registry v2" ON public.whatsapp_template_registry FOR ALL TO authenticated USING (true);
CREATE POLICY "Staff manage integrations" ON public.marketing_integrations FOR ALL TO authenticated USING (true);
CREATE POLICY "Staff manage bank accounts v2" ON public.store_bank_accounts FOR ALL TO authenticated USING (true);
CREATE POLICY "Staff manage bank transactions v2" ON public.bank_transactions FOR ALL TO authenticated USING (true);
CREATE POLICY "Staff manage automations v2" ON public.whatsapp_automations FOR ALL TO authenticated USING (true);
CREATE POLICY "Staff manage tickets v2" ON public.support_tickets FOR ALL TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wat_store ON public.whatsapp_template_registry(store_id);
CREATE INDEX IF NOT EXISTS idx_mkt_store ON public.marketing_integrations(store_id);
CREATE INDEX IF NOT EXISTS idx_wa_automations_event ON public.whatsapp_automations(event_type);
CREATE INDEX IF NOT EXISTS idx_tickets_store ON public.support_tickets(store_id);

-- Seed Initial Monzo Account if empty
INSERT INTO public.store_bank_accounts (bank_name, account_name, currency, is_active)
SELECT 'Monzo', 'Monzo Business Account', 'GBP', true
WHERE NOT EXISTS (SELECT 1 FROM public.store_bank_accounts WHERE bank_name = 'Monzo');

NOTIFY pgrst, 'reload schema';

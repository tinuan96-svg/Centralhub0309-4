-- ============================================================
-- CUSTOMER CARE PRODUCTION STABILIZATION
-- Objective: Centralize customer identity and fix schema inconsistencies
-- ============================================================

-- 1. Create Canonical Customers Table
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text,
  phone text,
  total_spend numeric(12, 2) DEFAULT 0,
  order_count integer DEFAULT 0,
  last_order_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Unique index for identification (Email or Phone)
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone) WHERE phone IS NOT NULL;

-- 2. Update Schema Relationships
ALTER TABLE public.support_tickets
ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.whatsapp_contacts(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS subject text,
ADD COLUMN IF NOT EXISTS description text;

-- Link whatsapp_contacts to canonical customers
DO $$
BEGIN
    -- Ensure FK exists to customers table
    ALTER TABLE public.whatsapp_contacts DROP CONSTRAINT IF EXISTS whatsapp_contacts_customer_id_fkey;
    ALTER TABLE public.whatsapp_contacts ADD CONSTRAINT whatsapp_contacts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
END $$;

-- 3. Update WhatsApp Channels for Multi-Store Auth
ALTER TABLE public.whatsapp_channels
ADD COLUMN IF NOT EXISTS access_token text,
ADD COLUMN IF NOT EXISTS app_secret text;

-- 4. Enable Realtime for Customer Care
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_conversations;
  ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;
  ALTER PUBLICATION supabase_realtime ADD TABLE support_tickets;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 5. Backfill Customers from Orders
-- Note: This is a best-effort backfill using unique email/phone combinations
INSERT INTO public.customers (name, email, phone, total_spend, order_count, last_order_date)
SELECT
  MAX(customer_name),
  LOWER(TRIM(customer_email)),
  TRIM(customer_phone),
  SUM(total),
  COUNT(*),
  MAX(created_at)
FROM public.orders
WHERE (customer_email IS NOT NULL OR customer_phone IS NOT NULL)
GROUP BY LOWER(TRIM(customer_email)), TRIM(customer_phone)
ON CONFLICT DO NOTHING;

-- 6. RLS Policies
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can manage customers" ON public.customers FOR ALL TO authenticated USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_phone_lookup ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_support_tickets_contact ON public.support_tickets(contact_id);
CREATE INDEX IF NOT EXISTS idx_wa_channels_phone_id ON public.whatsapp_channels(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_status ON public.whatsapp_conversations(status);
CREATE INDEX IF NOT EXISTS idx_wa_conv_updated ON public.whatsapp_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_msg_wa_id ON public.whatsapp_messages(wa_message_id);

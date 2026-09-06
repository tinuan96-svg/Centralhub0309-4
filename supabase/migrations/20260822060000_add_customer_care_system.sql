-- Customer Care Management System
-- Parallel integration with Interakt

-- 1. Extend WhatsApp Conversations for Human Takeover
ALTER TABLE IF EXISTS whatsapp_conversations
ADD COLUMN IF NOT EXISTS handling_mode text DEFAULT 'AI' CHECK (handling_mode IN ('AI', 'AI_DRAFT', 'HUMAN')),
ADD COLUMN IF NOT EXISTS assigned_agent_id uuid REFERENCES auth.users(id);

-- 2. Support Tickets Table
CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL, -- Isolated by store
  customer_id uuid, -- Reference to existing CentralHub customer
  conversation_id uuid REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('refund', 'missing_order', 'wrong_item', 'damaged_item', 'delivery_issue', 'payment_issue', 'complaint', 'account_issue', 'other')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'in_progress', 'waiting_customer', 'waiting_internal', 'resolved', 'closed')),
  ai_summary text,
  internal_notes text,
  resolution text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

-- 3. Knowledge Base
CREATE TABLE IF NOT EXISTS kb_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, slug)
);

CREATE TABLE IF NOT EXISTS kb_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  category_id uuid REFERENCES kb_categories(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  is_published boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Customer Care Settings
CREATE TABLE IF NOT EXISTS customer_care_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE,
  ai_enabled boolean DEFAULT true,
  ai_auto_reply boolean DEFAULT false, -- Safety first
  default_handling_mode text DEFAULT 'AI' CHECK (default_handling_mode IN ('AI', 'AI_DRAFT', 'HUMAN')),
  escalation_rules jsonb DEFAULT '{}'::jsonb,
  greeting_message text,
  custom_knowledge text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. WhatsApp Template Registry
CREATE TABLE IF NOT EXISTS whatsapp_template_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  name text NOT NULL, -- Human-friendly name
  meta_template_id text, -- From Meta Portal
  meta_template_name text NOT NULL, -- Exact name in Meta
  category text NOT NULL,
  language text NOT NULL DEFAULT 'en_GB',
  variables jsonb DEFAULT '[]'::jsonb,
  interakt_workflow_map text, -- Documentation link to legacy Interakt
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, meta_template_name)
);

-- 6. WhatsApp Automations
CREATE TABLE IF NOT EXISTS whatsapp_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  name text NOT NULL,
  event_type text NOT NULL, -- order_shipped, payment_received, etc.
  condition jsonb DEFAULT '{}'::jsonb,
  template_id uuid REFERENCES whatsapp_template_registry(id),
  is_active boolean DEFAULT false, -- Disabled by default for safety
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_care_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_template_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_automations ENABLE ROW LEVEL SECURITY;

-- Standard Policies
CREATE POLICY "Staff can manage tickets" ON support_tickets FOR ALL TO authenticated USING (true);
CREATE POLICY "Staff can manage KB categories" ON kb_categories FOR ALL TO authenticated USING (true);
CREATE POLICY "Staff can manage KB articles" ON kb_articles FOR ALL TO authenticated USING (true);
CREATE POLICY "Staff can manage settings" ON customer_care_settings FOR ALL TO authenticated USING (true);
CREATE POLICY "Staff can manage template registry" ON whatsapp_template_registry FOR ALL TO authenticated USING (true);
CREATE POLICY "Staff can manage automations" ON whatsapp_automations FOR ALL TO authenticated USING (true);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_tickets_store ON support_tickets(store_id);
CREATE INDEX IF NOT EXISTS idx_tickets_customer ON support_tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_kb_articles_store ON kb_articles(store_id);
CREATE INDEX IF NOT EXISTS idx_kb_articles_cat ON kb_articles(category_id);
CREATE INDEX IF NOT EXISTS idx_wa_automations_event ON whatsapp_automations(event_type);
CREATE INDEX IF NOT EXISTS idx_wa_conv_handling ON whatsapp_conversations(handling_mode);

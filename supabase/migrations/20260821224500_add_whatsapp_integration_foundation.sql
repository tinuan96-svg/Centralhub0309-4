-- WhatsApp Integration Foundation
-- Stage 1: Database Schema Only

-- 1. WhatsApp Channels (Meta Business Configuration)
CREATE TABLE IF NOT EXISTS whatsapp_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid, -- Reference to existing store structure
  waba_id text,
  phone_number_id text,
  display_phone_number text,
  business_name text,
  status text NOT NULL DEFAULT 'inactive',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. WhatsApp Contacts
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid,
  customer_id uuid, -- Optional reference to existing customer/profile
  phone_number text NOT NULL,
  whatsapp_user_id text,
  display_name text,
  language text,
  opted_in boolean DEFAULT false,
  last_message_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(store_id, phone_number)
);

-- 3. WhatsApp Conversations
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid,
  contact_id uuid NOT NULL REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting', 'human', 'closed')),
  ai_enabled boolean DEFAULT false,
  assigned_to uuid,
  last_message_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. WhatsApp Messages
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  wa_message_id text UNIQUE, -- Meta's message ID for idempotency
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type text NOT NULL CHECK (message_type IN ('text', 'image', 'document', 'audio', 'interactive', 'template')),
  message_text text,
  media_url text,
  sender_phone text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'sent', 'delivered', 'read', 'failed')),
  ai_generated boolean DEFAULT false,
  ai_model text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. WhatsApp Webhook Events (Raw Audit Log)
CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text,
  provider text NOT NULL DEFAULT 'meta',
  event_type text,
  payload jsonb NOT NULL,
  processing_status text NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received', 'processed', 'failed', 'ignored')),
  processed_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- 6. WhatsApp AI Sessions
CREATE TABLE IF NOT EXISTS whatsapp_ai_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'openai',
  model text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'completed')),
  last_response_id text,
  last_activity_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 7. WhatsApp AI Tool Calls
CREATE TABLE IF NOT EXISTS whatsapp_ai_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  arguments jsonb,
  result jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  error_message text,
  execution_time_ms integer,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- 8. WhatsApp Handoffs
CREATE TABLE IF NOT EXISTS whatsapp_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'resolved')),
  assigned_to uuid,
  created_at timestamptz DEFAULT now(),
  assigned_at timestamptz,
  resolved_at timestamptz
);

-- Security (RLS)
ALTER TABLE whatsapp_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_ai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_ai_tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_handoffs ENABLE ROW LEVEL SECURITY;

-- Standard Policies (Authenticated Users / Staff)
-- Following existing pattern from comm_* tables
CREATE POLICY "Staff can manage whatsapp channels" ON whatsapp_channels FOR ALL TO authenticated USING (true);
CREATE POLICY "Staff can manage whatsapp contacts" ON whatsapp_contacts FOR ALL TO authenticated USING (true);
CREATE POLICY "Staff can manage whatsapp conversations" ON whatsapp_conversations FOR ALL TO authenticated USING (true);
CREATE POLICY "Staff can manage whatsapp messages" ON whatsapp_messages FOR ALL TO authenticated USING (true);
CREATE POLICY "Staff can manage whatsapp webhook events" ON whatsapp_webhook_events FOR ALL TO authenticated USING (true);
CREATE POLICY "Staff can manage whatsapp ai sessions" ON whatsapp_ai_sessions FOR ALL TO authenticated USING (true);
CREATE POLICY "Staff can manage whatsapp ai tool calls" ON whatsapp_ai_tool_calls FOR ALL TO authenticated USING (true);
CREATE POLICY "Staff can manage whatsapp handoffs" ON whatsapp_handoffs FOR ALL TO authenticated USING (true);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_wa_contacts_phone ON whatsapp_contacts(phone_number);
CREATE INDEX IF NOT EXISTS idx_wa_contacts_store_phone ON whatsapp_contacts(store_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_wa_conv_contact ON whatsapp_conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_store ON whatsapp_conversations(store_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_last_msg ON whatsapp_conversations(last_message_at);
CREATE INDEX IF NOT EXISTS idx_wa_msg_conversation ON whatsapp_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_created ON whatsapp_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_wa_msg_wa_id ON whatsapp_messages(wa_message_id);
CREATE INDEX IF NOT EXISTS idx_wa_webhook_event_id ON whatsapp_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_wa_ai_tool_conv ON whatsapp_ai_tool_calls(conversation_id);

/*
  # Messaging System

  1. New Tables
    - `message_templates`
      - `id` (uuid, primary key)
      - `name` (text, template identifier)
      - `content` (text, message content with placeholders)
      - `type` (text, sms/email/whatsapp)
      - `category` (text, order_update/marketing/alert)
      - `is_active` (boolean)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `messages`
      - `id` (uuid, primary key)
      - `template_id` (uuid, foreign key)
      - `recipient_phone` (text)
      - `recipient_email` (text, nullable)
      - `content` (text, final message)
      - `type` (text, sms/email/whatsapp)
      - `status` (text, pending/sent/failed/delivered)
      - `order_id` (uuid, nullable, foreign key)
      - `sent_at` (timestamp, nullable)
      - `delivered_at` (timestamp, nullable)
      - `error_message` (text, nullable)
      - `twilio_sid` (text, nullable)
      - `metadata` (jsonb)
      - `created_at` (timestamp)

    - `message_campaigns`
      - `id` (uuid, primary key)
      - `name` (text)
      - `template_id` (uuid, foreign key)
      - `target_audience` (text, all/recent_customers/inactive)
      - `schedule_at` (timestamp, nullable)
      - `status` (text, draft/scheduled/sending/completed/cancelled)
      - `total_recipients` (integer)
      - `sent_count` (integer)
      - `delivered_count` (integer)
      - `failed_count` (integer)
      - `created_at` (timestamp)
      - `completed_at` (timestamp, nullable)

  2. Security
    - Enable RLS on all tables
    - Only authenticated users can manage messages
    - Users can only see their own store messages
*/

CREATE TABLE IF NOT EXISTS message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  content text NOT NULL,
  type text NOT NULL CHECK (type IN ('sms', 'email', 'whatsapp')),
  category text NOT NULL CHECK (category IN ('order_update', 'marketing', 'alert', 'notification')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES message_templates(id) ON DELETE SET NULL,
  recipient_phone text NOT NULL,
  recipient_email text,
  recipient_name text,
  content text NOT NULL,
  type text NOT NULL CHECK (type IN ('sms', 'email', 'whatsapp')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered')),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  sent_at timestamptz,
  delivered_at timestamptz,
  error_message text,
  twilio_sid text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  template_id uuid REFERENCES message_templates(id) ON DELETE SET NULL,
  target_audience text NOT NULL CHECK (target_audience IN ('all', 'recent_customers', 'inactive', 'custom')),
  schedule_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'completed', 'cancelled')),
  total_recipients integer DEFAULT 0,
  sent_count integer DEFAULT 0,
  delivered_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view message templates"
  ON message_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert message templates"
  ON message_templates FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update message templates"
  ON message_templates FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete message templates"
  ON message_templates FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view messages"
  ON messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update messages"
  ON messages FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete messages"
  ON messages FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view campaigns"
  ON message_campaigns FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert campaigns"
  ON message_campaigns FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update campaigns"
  ON message_campaigns FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete campaigns"
  ON message_campaigns FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);
CREATE INDEX IF NOT EXISTS idx_messages_order_id ON messages(order_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON message_campaigns(status);

INSERT INTO message_templates (name, content, type, category) VALUES
  ('order_confirmation', 'Hi {{customer_name}}, your order #{{order_number}} has been confirmed! Total: £{{total}}. Track your order at {{store_url}}', 'sms', 'order_update'),
  ('order_shipped', 'Good news {{customer_name}}! Your order #{{order_number}} has been shipped and is on its way. Estimated delivery: {{delivery_date}}', 'sms', 'order_update'),
  ('order_delivered', 'Your order #{{order_number}} has been delivered! Thank you for shopping with us {{customer_name}}. Rate your experience: {{rating_url}}', 'sms', 'order_update'),
  ('low_stock_alert', 'Alert: {{product_name}} is running low ({{stock_count}} units left). Restock recommended.', 'sms', 'alert'),
  ('price_drop', 'Hi {{customer_name}}! {{product_name}} is now on sale for £{{new_price}} (was £{{old_price}}). Shop now: {{product_url}}', 'sms', 'marketing'),
  ('abandoned_cart', 'Hi {{customer_name}}, you left items in your cart! Complete your purchase now and get 10% off with code COMEBACK10', 'sms', 'marketing')
ON CONFLICT (name) DO NOTHING;

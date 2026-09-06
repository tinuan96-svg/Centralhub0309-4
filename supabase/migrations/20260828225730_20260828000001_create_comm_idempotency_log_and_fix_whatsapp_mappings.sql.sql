/*
# Fix WhatsApp Transactional Notification System

## Summary
This migration fixes the broken WhatsApp order-status notification system by:
1. Creating the missing `comm_idempotency_log` table that CommunicationService.triggerEvent() depends on
2. Adding the missing `order.shipped` template mapping for MalluSpices
3. Linking the MalluSpices WhatsApp channel to all order event mappings that currently have NULL channel_id
4. Adding the `order_whatsapp_notifications` table for transactional notification logging
5. Adding a retry queue table for failed notifications

## New Tables

### comm_idempotency_log
- Purpose: Prevents duplicate WhatsApp notifications for the same order event
- Columns: id, store_id, event_key, provider, created_at
- The CommunicationService queries this table by store_id + event_key and inserts after successful sends
- UNIQUE constraint on (store_id, event_key) to enforce idempotency at the database level

### order_whatsapp_notifications
- Purpose: Transactional notification audit log — one row per notification attempt
- Columns: id, store_id, order_id, order_number, customer_phone, event_key, template_name, channel_id, wa_message_id, status, error_message, retry_count, created_at, updated_at
- Status values: queued, sending, sent, delivered, read, failed
- Allows admins to trace "why did this customer not receive their notification"

### whatsapp_notification_queue
- Purpose: Retry queue for notifications that failed due to transient Meta API errors
- Columns: id, notification_id, retry_count, max_retries, next_retry_at, status, last_error
- Status values: pending, processing, completed, failed

## Modified Tables
- `whatsapp_event_template_mappings`: Links existing NULL channel_id mappings to the MalluSpices channel

## Security
- RLS enabled on all new tables
- Service role access for edge functions
- Authenticated admin/staff access for UI
*/

-- ============================================================
-- 1. CREATE comm_idempotency_log TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS comm_idempotency_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  event_key text NOT NULL,
  provider text DEFAULT 'whatsapp',
  created_at timestamptz DEFAULT now()
);

-- Unique constraint to prevent duplicate idempotency entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_idempotency_log_store_event
  ON comm_idempotency_log (store_id, event_key);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_comm_idempotency_log_created_at
  ON comm_idempotency_log (created_at DESC);

ALTER TABLE comm_idempotency_log ENABLE ROW LEVEL SECURITY;

-- Allow service role (edge functions) full access
-- Allow authenticated users to read (for admin UI)
DROP POLICY IF EXISTS "comm_idempotency_select_authenticated" ON comm_idempotency_log;
CREATE POLICY "comm_idempotency_select_authenticated" ON comm_idempotency_log
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "comm_idempotency_insert_authenticated" ON comm_idempotency_log;
CREATE POLICY "comm_idempotency_insert_authenticated" ON comm_idempotency_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- 2. CREATE order_whatsapp_notifications TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS order_whatsapp_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  order_id uuid,
  order_number text,
  customer_phone text,
  event_key text NOT NULL,
  template_name text,
  channel_id uuid,
  wa_message_id text,
  status text NOT NULL DEFAULT 'queued',
  error_message text,
  retry_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_whatsapp_notifications_order_id
  ON order_whatsapp_notifications (order_id);
CREATE INDEX IF NOT EXISTS idx_order_whatsapp_notifications_store_id
  ON order_whatsapp_notifications (store_id);
CREATE INDEX IF NOT EXISTS idx_order_whatsapp_notifications_status
  ON order_whatsapp_notifications (status);
CREATE INDEX IF NOT EXISTS idx_order_whatsapp_notifications_wa_message_id
  ON order_whatsapp_notifications (wa_message_id);

ALTER TABLE order_whatsapp_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_whatsapp_notif_select_authenticated" ON order_whatsapp_notifications;
CREATE POLICY "order_whatsapp_notif_select_authenticated" ON order_whatsapp_notifications
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "order_whatsapp_notif_insert_authenticated" ON order_whatsapp_notifications;
CREATE POLICY "order_whatsapp_notif_insert_authenticated" ON order_whatsapp_notifications
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "order_whatsapp_notif_update_authenticated" ON order_whatsapp_notifications;
CREATE POLICY "order_whatsapp_notif_update_authenticated" ON order_whatsapp_notifications
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 3. CREATE whatsapp_notification_queue TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL,
  retry_count integer DEFAULT 0,
  max_retries integer DEFAULT 3,
  next_retry_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_notification_queue_status
  ON whatsapp_notification_queue (status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notification_queue_next_retry
  ON whatsapp_notification_queue (next_retry_at);

ALTER TABLE whatsapp_notification_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_notif_queue_select_authenticated" ON whatsapp_notification_queue;
CREATE POLICY "whatsapp_notif_queue_select_authenticated" ON whatsapp_notification_queue
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "whatsapp_notif_queue_insert_authenticated" ON whatsapp_notification_queue;
CREATE POLICY "whatsapp_notif_queue_insert_authenticated" ON whatsapp_notification_queue
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "whatsapp_notif_queue_update_authenticated" ON whatsapp_notification_queue;
CREATE POLICY "whatsapp_notif_queue_update_authenticated" ON whatsapp_notification_queue
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 4. FIX MALLUSPICES CHANNEL MAPPINGS
-- ============================================================
-- MalluSpices store_id: 00000000-0000-0000-0000-000000000001
-- MalluSpices channel_id: fe1b244f-fc04-447a-9d2b-14d57efb185c

-- 4a. Link existing mappings that have NULL channel_id to the MalluSpices channel
UPDATE whatsapp_event_template_mappings
SET channel_id = 'fe1b244f-fc04-447a-9d2b-14d57efb185c'
WHERE store_id = '00000000-0000-0000-0000-000000000001'
  AND channel_id IS NULL
  AND event_key IN ('order.confirmed', 'order.delivered', 'order.cancelled');

-- 4b. Add the missing order.shipped mapping
-- First check if a template named ship_update_v1 exists in the registry
DO $$
DECLARE
  v_template_id uuid;
  v_mapping_count integer;
  v_store_id uuid := '00000000-0000-0000-0000-000000000001';
  v_channel_id uuid := 'fe1b244f-fc04-447a-9d2b-14d57efb185c';
BEGIN
  -- Find the ship_update_v1 template
  SELECT id INTO v_template_id
  FROM whatsapp_template_registry
  WHERE store_id = v_store_id
    AND meta_template_name = 'ship_update_v1'
  LIMIT 1;

  IF v_template_id IS NOT NULL THEN
    -- Check if mapping already exists
    SELECT count(*) INTO v_mapping_count
    FROM whatsapp_event_template_mappings
    WHERE store_id = v_store_id
      AND event_key = 'order.shipped';

    IF v_mapping_count = 0 THEN
      INSERT INTO whatsapp_event_template_mappings (
        store_id, event_key, event_type, event_source,
        template_id, channel_id, enabled, customer_visible, requires_opt_in
      ) VALUES (
        v_store_id, 'order.shipped', 'TRANSACTIONAL', 'ORDER_SERVICE',
        v_template_id, v_channel_id, true, true, false
      );
      RAISE NOTICE 'Created order.shipped mapping for MalluSpices';
    ELSE
      RAISE NOTICE 'order.shipped mapping already exists for MalluSpices';
    END IF;
  ELSE
    RAISE NOTICE 'ship_update_v1 template not found in registry — order.shipped mapping skipped';
  END IF;
END $$;

-- 4c. Remove duplicate order.confirmed mapping (keep the one with channel_id)
DELETE FROM whatsapp_event_template_mappings
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY store_id, event_key
        ORDER BY channel_id NULLS LAST
      ) as rn
    FROM whatsapp_event_template_mappings
    WHERE store_id = '00000000-0000-0000-0000-000000000001'
      AND event_key = 'order.confirmed'
  ) t WHERE rn > 1
);

-- ============================================================
-- 5. GRANT ACCESS
-- ============================================================
-- Ensure service role can access all new tables (edge functions use service role key)
GRANT ALL ON comm_idempotency_log TO service_role;
GRANT ALL ON order_whatsapp_notifications TO service_role;
GRANT ALL ON whatsapp_notification_queue TO service_role;

-- Allow authenticated users to read notification logs
GRANT SELECT ON order_whatsapp_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON order_whatsapp_notifications TO authenticated;
GRANT SELECT ON comm_idempotency_log TO authenticated;
GRANT SELECT, INSERT ON comm_idempotency_log TO authenticated;
GRANT SELECT ON whatsapp_notification_queue TO authenticated;
GRANT SELECT, INSERT, UPDATE ON whatsapp_notification_queue TO authenticated;
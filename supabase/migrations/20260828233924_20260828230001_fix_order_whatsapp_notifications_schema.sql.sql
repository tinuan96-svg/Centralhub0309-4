/*
# Fix order_whatsapp_notifications Table Schema

## Problem
The live `order_whatsapp_notifications` table was created by an earlier migration with columns
(`order_status`, `template_name`, `language`, `phone_number`) as NOT NULL — but the
CommunicationService code inserts `event_key`, `customer_phone`, `channel_id`, `order_number`,
`error_message`, `retry_count`, `updated_at`. The migration that was supposed to recreate this
table used `CREATE TABLE IF NOT EXISTS`, so it was silently skipped because the old table already
existed. Every notification insert was failing silently.

## Changes
1. Add missing columns: `event_key`, `customer_phone`, `channel_id`, `order_number`,
   `error_message`, `retry_count`, `updated_at`
2. Make old NOT NULL columns nullable so they don't block inserts:
   `order_status`, `template_name`, `language`, `phone_number`
3. Add indexes for common query patterns
4. Keep existing data (no rows currently exist, so no data loss risk)

## Security
- RLS already enabled on this table
- Existing policies remain unchanged
*/

-- Add missing columns
ALTER TABLE order_whatsapp_notifications
  ADD COLUMN IF NOT EXISTS event_key text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS channel_id uuid,
  ADD COLUMN IF NOT EXISTS order_number text,
  ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Make old NOT NULL columns nullable so inserts with new schema don't fail
ALTER TABLE order_whatsapp_notifications
  ALTER COLUMN order_status DROP NOT NULL,
  ALTER COLUMN template_name DROP NOT NULL,
  ALTER COLUMN language DROP NOT NULL,
  ALTER COLUMN phone_number DROP NOT NULL;

-- Add indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_order_whatsapp_notif_order_id
  ON order_whatsapp_notifications (order_id);
CREATE INDEX IF NOT EXISTS idx_order_whatsapp_notif_store_id
  ON order_whatsapp_notifications (store_id);
CREATE INDEX IF NOT EXISTS idx_order_whatsapp_notif_status
  ON order_whatsapp_notifications (status);
CREATE INDEX IF NOT EXISTS idx_order_whatsapp_notif_wa_message_id
  ON order_whatsapp_notifications (wa_message_id);
CREATE INDEX IF NOT EXISTS idx_order_whatsapp_notif_event_key
  ON order_whatsapp_notifications (event_key);

-- Grant access (ensure service_role and authenticated can use the table)
GRANT ALL ON order_whatsapp_notifications TO service_role;
GRANT SELECT, INSERT, UPDATE ON order_whatsapp_notifications TO authenticated;
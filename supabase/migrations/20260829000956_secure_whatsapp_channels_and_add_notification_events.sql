/*
# Secure whatsapp_channels RLS + Add order processing/refunded notification events

## Summary
1. SECURITY: Replace overly-permissive `USING (true)` RLS policies on whatsapp_channels
   with column-restricted access. Authenticated/anon users can read safe columns
   (id, store_id, waba_id, phone_number_id, display_phone_number, business_name, status,
   created_at, updated_at) but NEVER access_token, app_secret, or verify_token.
   Service-role key (edge functions only) bypasses RLS and can read all columns.

2. Add `order.processing` and `order.refunded` event template mappings for MalluSpices,
   using existing approved templates.

## Security Changes
- DROP existing `USING (true)` ALL policies on whatsapp_channels
- REVOKE ALL on whatsapp_channels from authenticated and anon
- GRANT column-level SELECT on safe columns only
- GRANT UPDATE on safe columns only (not secrets)
- GRANT INSERT on safe columns only
- Create whatsapp_channels_public view for safe reads
- New RLS policies (row-level access, column-level GRANTs prevent secret reads)
*/

-- ============================================================
-- PART 1: Secure whatsapp_channels
-- ============================================================

-- Drop existing overly-permissive policies
DROP POLICY IF EXISTS "Staff manage channels" ON whatsapp_channels;
DROP POLICY IF EXISTS "Staff manage whatsapp_channels" ON whatsapp_channels;

-- Revoke direct table access from authenticated and anon
REVOKE ALL ON whatsapp_channels FROM authenticated;
REVOKE ALL ON whatsapp_channels FROM anon;

-- Grant only SELECT on safe columns via column-level privileges
GRANT SELECT (id, store_id, waba_id, phone_number_id, display_phone_number, business_name, status, created_at, updated_at)
  ON whatsapp_channels TO authenticated;
GRANT SELECT (id, store_id, waba_id, phone_number_id, display_phone_number, business_name, status, created_at, updated_at)
  ON whatsapp_channels TO anon;

-- Allow authenticated users to UPDATE only safe columns (not secrets)
GRANT UPDATE (id, store_id, waba_id, phone_number_id, display_phone_number, business_name, status, updated_at)
  ON whatsapp_channels TO authenticated;

-- Allow authenticated users to INSERT (channel setup - safe columns only)
GRANT INSERT (id, store_id, waba_id, phone_number_id, display_phone_number, business_name, status, created_at, updated_at)
  ON whatsapp_channels TO authenticated;

-- Create a public view that exposes only safe columns
CREATE OR REPLACE VIEW whatsapp_channels_public AS
  SELECT id, store_id, waba_id, phone_number_id, display_phone_number, business_name, status, created_at, updated_at
  FROM whatsapp_channels;

GRANT SELECT ON whatsapp_channels_public TO authenticated;
GRANT SELECT ON whatsapp_channels_public TO anon;

-- RLS policies: row-level access for authenticated and anon
-- Column-level GRANTs above prevent reading secret columns even with row access
CREATE POLICY "authenticated_select_channels" ON whatsapp_channels
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_channels" ON whatsapp_channels
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_update_channels" ON whatsapp_channels
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_delete_channels" ON whatsapp_channels
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "anon_select_channels" ON whatsapp_channels
  FOR SELECT TO anon USING (true);

-- ============================================================
-- PART 2: Add order.processing and order.refunded event mappings
-- ============================================================

DO $$
DECLARE
  v_processing_template_id uuid;
  v_refunded_template_id uuid;
  v_channel_id uuid;
  v_store_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  SELECT id INTO v_processing_template_id FROM whatsapp_template_registry
    WHERE meta_template_name = 'order_confirm_v1' AND store_id = v_store_id LIMIT 1;

  SELECT id INTO v_refunded_template_id FROM whatsapp_template_registry
    WHERE meta_template_name = 'order_returned_v1' AND store_id = v_store_id LIMIT 1;

  SELECT id INTO v_channel_id FROM whatsapp_channels WHERE store_id = v_store_id LIMIT 1;

  IF v_processing_template_id IS NOT NULL AND v_channel_id IS NOT NULL THEN
    INSERT INTO whatsapp_event_template_mappings
      (store_id, event_key, event_type, event_source, description, template_id, channel_id, enabled)
    VALUES
      (v_store_id, 'order.processing', 'TRANSACTIONAL', 'ORDER_SERVICE', 'Sent when order starts processing/packing', v_processing_template_id, v_channel_id, true)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_refunded_template_id IS NOT NULL AND v_channel_id IS NOT NULL THEN
    INSERT INTO whatsapp_event_template_mappings
      (store_id, event_key, event_type, event_source, description, template_id, channel_id, enabled)
    VALUES
      (v_store_id, 'order.refunded', 'TRANSACTIONAL', 'ORDER_SERVICE', 'Sent when an order is refunded', v_refunded_template_id, v_channel_id, true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

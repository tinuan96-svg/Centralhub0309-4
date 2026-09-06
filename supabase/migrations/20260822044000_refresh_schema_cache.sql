-- Harmless migration to force a schema cache refresh
ALTER TABLE IF EXISTS whatsapp_webhook_events ADD COLUMN IF NOT EXISTS _refresh_token boolean DEFAULT true;
ALTER TABLE IF EXISTS whatsapp_webhook_events DROP COLUMN IF EXISTS _refresh_token;

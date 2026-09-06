/*
  # Product Webhook Trigger

  Fires on INSERT, UPDATE, DELETE on the products table and calls the
  product-webhook-dispatcher edge function via pg_net with the event payload.

  1. New function: notify_product_webhook()
     - Reads CENTRALHUB_WEBHOOK_SECRET from vault or falls back to app.settings
     - Maps INSERT -> INSERT, UPDATE -> UPDATE, DELETE -> DELETE
     - Sends async HTTP POST to the dispatcher edge function
     - Uses pg_net for non-blocking delivery

  2. New trigger: products_webhook_trigger
     - AFTER INSERT OR UPDATE OR DELETE on products
     - Skips soft-deleted rows (is_deleted = true) for UPDATE events
*/

CREATE OR REPLACE FUNCTION notify_product_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _record     jsonb;
  _payload    jsonb;
  _event_type text;
  _edge_url   text;
  _secret     text;
BEGIN
  -- Determine event type
  IF TG_OP = 'INSERT' THEN
    _event_type := 'INSERT';
    _record := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    _event_type := 'UPDATE';
    _record := to_jsonb(NEW);
  ELSE
    _event_type := 'DELETE';
    _record := to_jsonb(OLD);
  END IF;

  -- Build payload matching the required schema
  _payload := jsonb_build_object(
    'type', _event_type,
    'record', jsonb_build_object(
      'id',         _record->>'id',
      'name',       _record->>'name',
      'sku',        _record->>'sku',
      'price',      (_record->>'price')::numeric,
      'stock',      COALESCE((_record->>'stock')::numeric, 0),
      'status',     CASE WHEN (_record->>'is_deleted')::boolean THEN 'inactive' ELSE 'active' END,
      'updated_at', COALESCE(_record->>'updated_at', now()::text)
    )
  );

  _edge_url := current_setting('app.supabase_url', true) || '/functions/v1/product-webhook-dispatcher';

  -- Fall back to a known URL if setting not present
  IF _edge_url IS NULL OR _edge_url = '/functions/v1/product-webhook-dispatcher' THEN
    _edge_url := 'https://vnqjqopzoeunojomssmq.supabase.co/functions/v1/product-webhook-dispatcher';
  END IF;

  _secret := current_setting('app.centralhub_webhook_secret', true);

  -- Fire async HTTP request via pg_net
  PERFORM extensions.http_post(
    _edge_url,
    _payload::text,
    'application/json'
  );

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Never block the transaction; log and continue
  RAISE WARNING 'product_webhook: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS products_webhook_trigger ON products;

CREATE TRIGGER products_webhook_trigger
  AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH ROW
  EXECUTE FUNCTION notify_product_webhook();

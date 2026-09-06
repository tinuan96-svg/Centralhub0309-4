/*
  # Fix product webhook trigger: correct URL and add Authorization header

  ## Problem
  The trigger was pointing to the wrong Supabase project URL (vnqjqopzoeunojomssmq)
  instead of this project (icnvrpnzjjcbvgcqgiua), and had no Authorization header,
  causing all webhook calls to fail silently with 401 errors.

  ## Changes
  - Updates _edge_url to the correct project URL (icnvrpnzjjcbvgcqgiua)
  - Adds Authorization: Bearer {anon_key} header to the pg_net call
  - Keeps the existing JSONB field extraction logic intact (NULL-safe via COALESCE)
  - Recreates the trigger to ensure clean attachment

  ## Monitored Events
  - INSERT, UPDATE, DELETE on products table
  - All column changes trigger the webhook (row-level trigger)
*/

CREATE OR REPLACE FUNCTION notify_product_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _record     jsonb;
  _payload    jsonb;
  _event_type text;
  _edge_url   text;
  _anon_key   text;
BEGIN
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

  _payload := jsonb_build_object(
    'type', _event_type,
    'record', jsonb_build_object(
      'id',         COALESCE(_record->>'id', ''),
      'sku',        COALESCE(_record->>'sku', ''),
      'name',       COALESCE(_record->>'name', ''),
      'brand',      COALESCE(_record->>'brand', ''),
      'category',   COALESCE(_record->>'category_name', _record->>'product_type', ''),
      'price',      COALESCE((_record->>'price')::numeric, 0),
      'stock',      COALESCE((_record->>'stock')::integer, 0),
      'updated_at', now()::text,
      'warehouse_location', COALESCE(_record->>'warehouse_location', '')
    )
  );

  -- Correct project URL (this project: icnvrpnzjjcbvgcqgiua)
  _edge_url := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/product-webhook-dispatcher';

  -- Anon key is public by design
  _anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljbnZycG56ampjYnZnY3FnaXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTc0MDEsImV4cCI6MjA5MDQ3MzQwMX0.KiCkaVkkzM9KpLRNez6gGc1JPqLMxbXCwgVvcdvYQUM';

  PERFORM net.http_post(
    url     := _edge_url,
    body    := _payload,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || _anon_key
    )
  );

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'product_webhook error: %', SQLERRM;
  RETURN NULL;
END;
$$;

-- Recreate trigger cleanly
DROP TRIGGER IF EXISTS products_webhook_trigger ON products;

CREATE TRIGGER products_webhook_trigger
  AFTER INSERT OR UPDATE OR DELETE
  ON products
  FOR EACH ROW
  EXECUTE FUNCTION notify_product_webhook();

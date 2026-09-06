/*
  # Update product webhook trigger with full payload

  Replaces the notify_product_webhook function to include brand and category
  fields in the dispatcher payload, matching the required format:
  { type, record: { id, sku, name, brand, category, price, stock, updated_at } }
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
      'id',         _record->>'id',
      'sku',        COALESCE(_record->>'sku', ''),
      'name',       COALESCE(_record->>'name', ''),
      'brand',      COALESCE(_record->>'brand', ''),
      'category',   COALESCE(_record->>'category_name', ''),
      'price',      COALESCE((_record->>'price')::numeric, 0),
      'stock',      COALESCE((_record->>'stock')::numeric, 0),
      'updated_at', COALESCE(_record->>'updated_at', now()::text)
    )
  );

  _edge_url := 'https://vnqjqopzoeunojomssmq.supabase.co/functions/v1/product-webhook-dispatcher';

  PERFORM net.http_post(
    url     := _edge_url,
    body    := _payload,
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'product_webhook error: %', SQLERRM;
  RETURN NULL;
END;
$$;

/*
  # Fix product webhook trigger to use pg_net

  Replaces the http_post call with net.http_post (pg_net) which is
  confirmed installed. pg_net is non-blocking and returns a request_id.
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
      'name',       _record->>'name',
      'sku',        _record->>'sku',
      'price',      (_record->>'price')::numeric,
      'stock',      COALESCE((_record->>'stock')::numeric, 0),
      'status',     CASE WHEN (_record->>'is_deleted')::boolean THEN 'inactive' ELSE 'active' END,
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

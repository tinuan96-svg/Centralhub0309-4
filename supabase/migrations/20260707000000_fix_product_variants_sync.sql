-- Update the notification function to include variants and handle variant-level triggers
CREATE OR REPLACE FUNCTION notify_product_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _product_id  uuid;
  _record      jsonb;
  _variants    jsonb;
  _payload     jsonb;
  _event_type  text;
  _edge_url    text;
  _anon_key    text;
  _prod_row    record;
BEGIN
  -- Determine product_id and event type
  IF TG_TABLE_NAME = 'products' THEN
    IF TG_OP = 'DELETE' THEN
      _product_id := OLD.id;
      _event_type := 'DELETE';
      _prod_row := OLD;
    ELSE
      _product_id := NEW.id;
      _event_type := TG_OP;
      -- Get latest state
      SELECT * INTO _prod_row FROM products WHERE id = _product_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'product_variants' THEN
    _product_id := COALESCE(NEW.product_id, OLD.product_id);
    _event_type := 'UPDATE'; -- Variant changes count as product updates
    SELECT * INTO _prod_row FROM products WHERE id = _product_id;
  END IF;

  -- Exit if no product record found (unless it was a product delete)
  IF _prod_row IS NULL AND NOT (TG_TABLE_NAME = 'products' AND TG_OP = 'DELETE') THEN
    RETURN NULL;
  END IF;

  -- Skip if product is soft-deleted (unless it was just hard-deleted)
  IF _prod_row IS NOT NULL AND COALESCE(_prod_row.is_deleted, false) = true THEN
    -- If it's a delete event, we might still want to notify, but usually soft-delete handles it via UPDATE
    IF _event_type != 'DELETE' THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Convert product row to jsonb
  _record := to_jsonb(_prod_row);

  -- Fetch active variants
  SELECT jsonb_agg(v) INTO _variants
  FROM product_variants v
  WHERE v.product_id = _product_id AND v.is_active = true;

  -- Build comprehensive payload
  _payload := jsonb_build_object(
    'type', _event_type,
    'record', jsonb_build_object(
      'id',                _product_id,
      'sku',               COALESCE(_record->>'sku', _record->>'gtin', _record->>'slug', ''),
      'name',              COALESCE(_record->>'name', ''),
      'slug',              COALESCE(_record->>'slug', ''),
      'brand',             COALESCE(_record->>'brand', ''),
      'brand_id',          _record->>'brand_id',
      'category',          COALESCE(_record->>'category', _record->>'category_name', ''),
      'department',        COALESCE(_record->>'department', ''),
      'subcategory',       COALESCE(_record->>'subcategory', ''),
      'price',             COALESCE((_record->>'price')::numeric, 0),
      'sale_price',        COALESCE((_record->>'sale_price')::numeric, 0),
      'compare_at_price',  COALESCE((_record->>'compare_at_price')::numeric, 0),
      'stock',             COALESCE((_record->>'stock')::integer, 0),
      'in_stock',          COALESCE((_record->>'in_stock')::boolean, (COALESCE((_record->>'stock')::integer, 0) > 0)),
      'unit',              COALESCE(_record->>'unit', ''),
      'weight',            COALESCE(_record->>'weight', ''),
      'description',       COALESCE(_record->>'description', ''),
      'short_description', COALESCE(_record->>'short_description', ''),
      'image_url',         COALESCE(_record->>'image_url', ''),
      'is_active',         COALESCE((_record->>'is_active')::boolean, true),
      'is_published',      COALESCE((_record->>'is_published')::boolean, true),
      'is_archived',       COALESCE((_record->>'is_archived')::boolean, false),
      'tags',              COALESCE(_record->'tags', '[]'::jsonb),
      'custom_attributes', COALESCE(_record->'custom_attributes', '{}'::jsonb),
      'variants',          COALESCE(_variants, '[]'::jsonb),
      'updated_at',        now()::text,
      'warehouse_location', COALESCE(_record->>'warehouse_location', ''),
      'gtin',              _record->>'gtin'
    )
  );

  -- Edge Function Config
  _edge_url := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/product-webhook-dispatcher';
  _anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljbnZycG56ampjYnZnY3FnaXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTc0MDEsImV4cCI6MjA5MDQ3MzQwMX0.KiCkaVkkzM9KpLRNez6gGc1JPqLMxbXCwgVvcdvYQUM';

  -- Fire the webhook asynchronously
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

-- Add trigger to product_variants
DROP TRIGGER IF EXISTS variants_webhook_trigger ON product_variants;
CREATE TRIGGER variants_webhook_trigger
  AFTER INSERT OR UPDATE OR DELETE
  ON product_variants
  FOR EACH ROW
  EXECUTE FUNCTION notify_product_webhook();

-- Ensure the products trigger is also correctly referencing the updated function
DROP TRIGGER IF EXISTS products_webhook_trigger ON products;
CREATE TRIGGER products_webhook_trigger
  AFTER INSERT OR UPDATE OR DELETE
  ON products
  FOR EACH ROW
  EXECUTE FUNCTION notify_product_webhook();

COMMENT ON FUNCTION notify_product_webhook IS 'Sends comprehensive product updates including variants to the sync dispatcher';

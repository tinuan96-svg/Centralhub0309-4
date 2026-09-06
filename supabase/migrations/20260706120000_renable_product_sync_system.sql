/*
  # Re-enable Product Sync System

  1. Fixes the product webhook trigger to include all newly aligned schema fields
  2. Ensures the trigger is active and has necessary permissions
  3. Re-grants EXECUTE on the sync function to authenticated users
*/

-- Update the notification function with comprehensive field mapping
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
  -- Determine event type and record
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

  -- Skip if product is soft-deleted (unless it was just deleted)
  IF TG_OP = 'UPDATE' AND (_record->>'is_deleted')::boolean = true THEN
    RETURN NULL;
  END IF;

  -- Build comprehensive payload matching the aligned schema
  _payload := jsonb_build_object(
    'type', _event_type,
    'record', jsonb_build_object(
      'id',                _record->>'id',
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
      'updated_at',        now()::text,
      'warehouse_location', COALESCE(_record->>'warehouse_location', ''),
      'gtin',              _record->>'gtin'
    )
  );

  -- Use the project-specific edge function URL
  -- Default to the icnvrpnzjjcbvgcqgiua project which is the current production
  _edge_url := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/product-webhook-dispatcher';

  -- Use the public anon key for the pg_net call
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
  -- Log error but don't block the transaction
  RAISE WARNING 'product_webhook error: %', SQLERRM;
  RETURN NULL;
END;
$$;

-- Ensure the trigger is active
DROP TRIGGER IF EXISTS products_webhook_trigger ON products;
CREATE TRIGGER products_webhook_trigger
  AFTER INSERT OR UPDATE OR DELETE
  ON products
  FOR EACH ROW
  EXECUTE FUNCTION notify_product_webhook();

-- Re-grant permissions that might have been revoked during security audit
GRANT EXECUTE ON FUNCTION notify_product_webhook() TO authenticated;
GRANT EXECUTE ON FUNCTION notify_product_webhook() TO service_role;

-- Ensure the sync_logs and webhook_logs are accessible to the system
GRANT INSERT, SELECT ON TABLE webhook_logs TO authenticated;
GRANT INSERT, SELECT ON TABLE webhook_logs TO service_role;

-- Add a comment to document the re-enabling
COMMENT ON FUNCTION notify_product_webhook IS 'Sends comprehensive product updates to the sync dispatcher';

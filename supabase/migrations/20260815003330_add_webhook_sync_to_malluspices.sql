/*
  # Webhook-Based Real-Time Sync from CentralHub to MalluSpices

  ## Summary
  Replaces the old direct database-to-database sync (which used service role keys
  and made multiple round-trips per product change) with lightweight webhook POST
  requests to MalluSpices' three dedicated webhook endpoints. MalluSpices handles
  the 5% markup, admin edit preservation, and WhatsApp notifications on its side.

  ## What This Migration Does

  1. PRODUCT WEBHOOK TRIGGER
     - Creates `notify_malluspices_product_webhook()` trigger function
     - Fires AFTER INSERT OR UPDATE OR DELETE on the `products` table
     - Sends a POST to MalluSpices' `centralhub-realtime` endpoint
     - Includes the full product record (id, name, slug, price, cost_price, stock,
       brand, sku, gtin, unit, weight, category fields, image fields, etc.)
     - For DELETE events, sends `old_record` with just the product ID
     - For UPDATE where `is_deleted` changed to true, sends a DELETE event
     - Reads `CENTRALHUB_WEBHOOK_SECRET` from the vault for the `x-webhook-secret` header
     - Uses a 5-second timeout via `net.http_post` so the trigger never blocks
     - Wraps in EXCEPTION handling so webhook failure never blocks the product save

  2. ORDER WEBHOOK TRIGGER
     - Creates `notify_malluspices_order_webhook()` trigger function
     - Fires AFTER UPDATE of order_status, tracking_number, courier_name,
       shipment_status, shipment_number, shipment_booked_at, estimated_delivery
       on the `orders` table
     - Sends a POST to MalluSpices' `centralhub-order-sync` endpoint
     - Includes the full order record (order_number, confirmed_order_number,
       order_status, customer details, delivery address, totals, payment info,
       tracking info, and line items from order_items)
     - Only fires for orders belonging to the MalluSpices store (store slug = 'malluspices')
     - Skips orders where `sync_origin = 'malluspices'` to prevent feedback loops
     - Reads `CENTRALHUB_WEBHOOK_SECRET` from the vault for authentication
     - Uses a 5-second timeout and exception handling

  3. DISABLE OLD TRIGGERS
     - Disables `products_product_sync_webhook` (old direct-sync trigger that called
       the `centralhub-product-sync` edge function with multiple database round-trips)
     - Drops `trg_push_order_status_to_malluspices` (old order status trigger that called
       the `update-order-status` edge function)
     - The old trigger functions remain in place but are not attached to any trigger

  ## Security
  - Both trigger functions are SECURITY DEFINER with `search_path = public, extensions`
  - The shared secret (`CENTRALHUB_WEBHOOK_SECRET`) is read from the Postgres vault,
    never hardcoded
  - If the secret is not found in the vault, the trigger silently skips the webhook
    and logs a warning rather than failing
  - The webhook endpoints on MalluSpices validate the secret on every request

  ## Important Notes
  - The scheduled batch sync (`trigger_product_sync` with `action: 'poll'`) remains
    active as a safety net to catch any missed webhook deliveries
  - The old `centralhub-product-sync` edge function and `update-order-status` edge
    function remain deployed but are no longer called by triggers
  - The `product-webhook-dispatcher` edge function is also not called by any trigger
    (it pointed to the wrong project URL anyway)
*/

-- ============================================================
-- 1. PRODUCT WEBHOOK TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_malluspices_product_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_record     jsonb;
  v_payload    jsonb;
  v_event_type text;
  v_url        text := 'https://ixzbnifmsxunlarhfimp.supabase.co/functions/v1/centralhub-realtime';
  v_secret     text;
  v_headers    jsonb;
  v_req_id     bigint;
  v_product_id text;
BEGIN
  -- Get the webhook secret from the vault
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'CENTRALHUB_WEBHOOK_SECRET'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE WARNING 'notify_malluspices_product_webhook: CENTRALHUB_WEBHOOK_SECRET not found in vault, skipping webhook';
    RETURN coalesce(new, old);
  END IF;

  -- Determine event type and record
  IF TG_OP = 'DELETE' THEN
    v_event_type := 'DELETE';
    v_record := to_jsonb(old);
    v_product_id := coalesce(old.id::text, '');
  ELSIF TG_OP = 'INSERT' THEN
    v_event_type := 'INSERT';
    v_record := to_jsonb(new);
    v_product_id := coalesce(new.id::text, '');
  ELSE
    -- UPDATE: check if is_deleted just changed to true -> send DELETE event
    IF new.is_deleted = true AND coalesce(old.is_deleted, false) = false THEN
      v_event_type := 'DELETE';
      v_record := to_jsonb(new);
      v_product_id := coalesce(new.id::text, '');
    ELSE
      v_event_type := 'UPDATE';
      v_record := to_jsonb(new);
      v_product_id := coalesce(new.id::text, '');
    END IF;
  END IF;

  -- Build the payload in the format MalluSpices expects
  IF v_event_type = 'DELETE' THEN
    v_payload := jsonb_build_object(
      'event', 'DELETE',
      'data', jsonb_build_object(
        'old_record', jsonb_build_object(
          'id', v_product_id
        )
      )
    );
  ELSE
    -- INSERT or UPDATE: send the full product record
    v_payload := jsonb_build_object(
      'event', v_event_type,
      'data', jsonb_build_object(
        'new_record', jsonb_build_object(
          'id',              v_product_id,
          'name',            coalesce(v_record->>'name', ''),
          'slug',            coalesce(v_record->>'slug', ''),
          'price',           coalesce(v_record->>'price', '0'),
          'cost_price',      coalesce(v_record->>'cost_price', '0'),
          'stock',           coalesce(v_record->>'stock', '0'),
          'product_type',    coalesce(v_record->>'product_type', 'simple'),
          'brand',           coalesce(v_record->>'brand', ''),
          'brand_id',        coalesce(v_record->>'brand_id', ''),
          'warehouse_location', coalesce(v_record->>'warehouse_location', ''),
          'weight',          coalesce(v_record->>'weight', ''),
          'weight_grams',    coalesce(v_record->>'weight_grams', ''),
          'gtin',            coalesce(v_record->>'gtin', ''),
          'unit',            coalesce(v_record->>'unit', ''),
          'sku',             coalesce(v_record->>'sku', ''),
          'pack_size',       coalesce(v_record->>'pack_size', '1'),
          'pack_unit',       coalesce(v_record->>'pack_unit', ''),
          'main_category',   coalesce(v_record->>'main_category', ''),
          'sub_category',    coalesce(v_record->>'sub_category', ''),
          'category',        coalesce(v_record->>'category', ''),
          'subcategory',     coalesce(v_record->>'subcategory', ''),
          'department',      coalesce(v_record->>'department', ''),
          'is_active',       coalesce(v_record->>'is_active', 'true'),
          'is_published',    coalesce(v_record->>'is_published', 'true'),
          'is_archived',     coalesce(v_record->>'is_archived', 'false'),
          'is_deleted',      coalesce(v_record->>'is_deleted', 'false'),
          'backorder',       coalesce(v_record->>'backorder', 'false'),
          'image_url',       coalesce(v_record->>'image_url', ''),
          'image_main',      coalesce(v_record->>'image_main', ''),
          'gallery_images', coalesce(v_record->'gallery_images', '[]'::jsonb),
          'description',     coalesce(v_record->>'description', ''),
          'rich_description', coalesce(v_record->>'rich_description', ''),
          'sale_price',      coalesce(v_record->>'sale_price', ''),
          'category_slug',   coalesce(v_record->>'slug', ''),
          'seo_meta_title',  coalesce(v_record->>'seo_meta_title', ''),
          'seo_meta_description', coalesce(v_record->>'seo_meta_description', ''),
          'updated_at',      coalesce(v_record->>'updated_at', now()::text)
        )
      )
    );
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-webhook-secret', v_secret
  );

  -- Fire async HTTP request via pg_net (non-blocking, 5s timeout)
  v_req_id := net.http_post(
    url := v_url,
    headers := v_headers,
    body := v_payload,
    timeout_milliseconds := 5000
  );

  -- Log the attempt
  INSERT INTO public.webhook_logs (
    event_type, product_id, product_name, attempt, status_code, response_body, success, status, response
  ) VALUES (
    v_event_type,
    v_product_id,
    coalesce(v_record->>'name', ''),
    1,
    202,
    'queued',
    true,
    'queued',
    jsonb_build_object('request_id', v_req_id)::text
  );

  RETURN coalesce(new, old);

EXCEPTION WHEN OTHERS THEN
  -- Never block the transaction; log and continue
  INSERT INTO public.webhook_logs (
    event_type, product_id, product_name, attempt, status_code, response_body, success, status, response
  ) VALUES (
    coalesce(v_event_type, TG_OP),
    coalesce(v_product_id, ''),
    coalesce(v_record->>'name', ''),
    1,
    0,
    coalesce(sqlerrm, 'dispatch failed'),
    false,
    'failed',
    jsonb_build_object('sqlstate', sqlstate)::text
  );
  RETURN coalesce(new, old);
END;
$$;

-- Drop old product webhook triggers and create the new one
DROP TRIGGER IF EXISTS products_webhook_trigger ON products;
DROP TRIGGER IF EXISTS trg_malluspices_product_webhook ON products;

CREATE TRIGGER trg_malluspices_product_webhook
  AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH ROW
  EXECUTE FUNCTION notify_malluspices_product_webhook();


-- ============================================================
-- 2. ORDER WEBHOOK TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_malluspices_order_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url        text := 'https://ixzbnifmsxunlarhfimp.supabase.co/functions/v1/centralhub-order-sync';
  v_secret     text;
  v_headers    jsonb;
  v_body       jsonb;
  v_store_slug text;
  v_req_id     bigint;
  v_items_json jsonb;
BEGIN
  -- Get the webhook secret from the vault
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'CENTRALHUB_WEBHOOK_SECRET'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE WARNING 'notify_malluspices_order_webhook: CENTRALHUB_WEBHOOK_SECRET not found in vault, skipping webhook';
    RETURN new;
  END IF;

  -- Get the store slug to check if this is a malluspices order
  SELECT s.slug INTO v_store_slug
  FROM stores s
  WHERE s.id = new.store_id;

  -- Only sync for malluspices orders
  IF v_store_slug IS NULL OR v_store_slug <> 'malluspices' THEN
    RETURN new;
  END IF;

  -- Skip if this order was just synced FROM malluspices (prevent feedback loop)
  IF new.sync_origin = 'malluspices' THEN
    RETURN new;
  END IF;

  -- Fetch order items for the payload
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_id', coalesce(oi.product_id::text, ''),
        'product_name', coalesce(oi.product_name, ''),
        'sku', coalesce(p.sku, ''),
        'quantity', coalesce(oi.quantity, 0),
        'unit_price', coalesce(oi.unit_price, 0),
        'total_price', coalesce(oi.total_price, 0)
      )
    ),
    '[]'::jsonb
  ) INTO v_items_json
  FROM order_items oi
  LEFT JOIN products p ON p.id = oi.product_id
  WHERE oi.order_id = new.id;

  -- Build the payload in the format MalluSpices expects
  v_body := jsonb_build_object(
    'type', 'UPDATE',
    'record', jsonb_build_object(
      'id',              coalesce(new.id::text, ''),
      'order_number',    coalesce(new.order_number, ''),
      'confirmed_order_number', coalesce(new.confirmed_order_number, ''),
      'order_status',    coalesce(new.order_status, ''),
      'customer_name',   coalesce(new.customer_name, ''),
      'customer_email',  coalesce(new.customer_email, ''),
      'customer_phone',  coalesce(new.customer_phone, ''),
      'delivery_address', coalesce(new.delivery_address, ''),
      'delivery_city',   coalesce(new.delivery_city, ''),
      'delivery_postcode', coalesce(new.delivery_postcode, ''),
      'subtotal',        coalesce(new.subtotal, 0),
      'delivery_fee',    coalesce(new.delivery_fee, 0),
      'total',           coalesce(new.total, 0),
      'payment_method',  coalesce(new.payment_method, ''),
      'payment_status',  coalesce(new.payment_status, ''),
      'payment_reference', coalesce(new.payment_reference, ''),
      'notes',           coalesce(new.notes, ''),
      'tracking_number', coalesce(new.tracking_number, ''),
      'courier_name',    coalesce(new.courier_name, ''),
      'tracking_url',    coalesce(new.tracking_url, ''),
      'shipment_status', coalesce(new.shipment_status, ''),
      'shipment_number', coalesce(new.shipment_number, ''),
      'shipment_booked_at', coalesce(new.shipment_booked_at::text, ''),
      'estimated_delivery', coalesce(new.estimated_delivery::text, ''),
      'actual_delivery', coalesce(new.actual_delivery::text, ''),
      'weight_total',    '',
      'items',           v_items_json
    )
  );

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-webhook-secret', v_secret
  );

  -- Fire async HTTP request via pg_net (non-blocking, 5s timeout)
  v_req_id := net.http_post(
    url := v_url,
    headers := v_headers,
    body := v_body,
    timeout_milliseconds := 5000
  );

  -- Log the attempt
  INSERT INTO public.webhook_logs (
    event_type, product_id, product_name, attempt, status_code, response_body, success, status, response
  ) VALUES (
    'ORDER_UPDATE',
    coalesce(new.id::text, ''),
    coalesce(new.order_number, ''),
    1,
    202,
    'queued',
    true,
    'queued',
    jsonb_build_object('request_id', v_req_id)::text
  );

  RETURN new;

EXCEPTION WHEN OTHERS THEN
  -- Never block the transaction; log and continue
  INSERT INTO public.webhook_logs (
    event_type, product_id, product_name, attempt, status_code, response_body, success, status, response
  ) VALUES (
    'ORDER_UPDATE',
    coalesce(new.id::text, ''),
    coalesce(new.order_number, ''),
    1,
    0,
    coalesce(sqlerrm, 'dispatch failed'),
    false,
    'failed',
    jsonb_build_object('sqlstate', sqlstate)::text
  );
  RETURN new;
END;
$$;

-- Drop old order sync trigger and create the new one
DROP TRIGGER IF EXISTS trg_push_order_status_to_malluspices ON orders;
DROP TRIGGER IF EXISTS trg_malluspices_order_webhook ON orders;

CREATE TRIGGER trg_malluspices_order_webhook
  AFTER UPDATE OF order_status, tracking_number, courier_name, shipment_status, shipment_number, shipment_booked_at, estimated_delivery
  ON orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_malluspices_order_webhook();


-- ============================================================
-- 3. DISABLE OLD DIRECT-SYNC TRIGGERS
-- ============================================================

-- Disable the old product sync trigger that called centralhub-product-sync edge function
-- (which made multiple database round-trips to MalluSpices and blocked the transaction)
ALTER TABLE public.products DISABLE TRIGGER products_product_sync_webhook;

-- The old order trigger (trg_push_order_status_to_malluspices) was already dropped above
-- when we dropped and recreated the trigger slot

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

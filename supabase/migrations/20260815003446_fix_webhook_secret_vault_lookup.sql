/*
  # Fix Webhook Secret Vault Lookup

  ## Problem
  The trigger functions look for `CENTRALHUB_WEBHOOK_SECRET` in the Postgres vault,
  but that name does not exist there. The vault contains `WEBHOOK_SECRET` (17 chars)
  which is the same shared secret used by MalluSpices.

  ## Fix
  1. Create a `CENTRALHUB_WEBHOOK_SECRET` vault entry by copying the value from
     `WEBHOOK_SECRET` using the correct `vault.create_secret(text, text, text)` signature.
  2. Update both trigger functions to try `CENTRALHUB_WEBHOOK_SECRET` first, then
     fall back to `WEBHOOK_SECRET` if the first is not found.
*/

-- Create the CENTRALHUB_WEBHOOK_SECRET vault entry by copying from WEBHOOK_SECRET
DO $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'WEBHOOK_SECRET'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_secret IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM vault.secrets WHERE name = 'CENTRALHUB_WEBHOOK_SECRET'
    ) THEN
      PERFORM vault.create_secret(
        v_secret,
        'CENTRALHUB_WEBHOOK_SECRET',
        'Shared webhook secret for MalluSpices real-time sync (copied from WEBHOOK_SECRET)'
      );
    END IF;
  END IF;
END;
$$;

-- Update product trigger function with fallback secret lookup
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
  -- Get the webhook secret from the vault (try CENTRALHUB_WEBHOOK_SECRET first, then WEBHOOK_SECRET)
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name IN ('CENTRALHUB_WEBHOOK_SECRET', 'WEBHOOK_SECRET')
  ORDER BY CASE name WHEN 'CENTRALHUB_WEBHOOK_SECRET' THEN 1 ELSE 2 END, created_at DESC
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE WARNING 'notify_malluspices_product_webhook: no webhook secret found in vault, skipping webhook';
    RETURN coalesce(new, old);
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_event_type := 'DELETE';
    v_record := to_jsonb(old);
    v_product_id := coalesce(old.id::text, '');
  ELSIF TG_OP = 'INSERT' THEN
    v_event_type := 'INSERT';
    v_record := to_jsonb(new);
    v_product_id := coalesce(new.id::text, '');
  ELSE
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

  IF v_event_type = 'DELETE' THEN
    v_payload := jsonb_build_object(
      'event', 'DELETE',
      'data', jsonb_build_object(
        'old_record', jsonb_build_object('id', v_product_id)
      )
    );
  ELSE
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

  v_req_id := net.http_post(
    url := v_url,
    headers := v_headers,
    body := v_payload,
    timeout_milliseconds := 5000
  );

  INSERT INTO public.webhook_logs (
    event_type, product_id, product_name, attempt, status_code, response_body, success, status, response
  ) VALUES (
    v_event_type, v_product_id, coalesce(v_record->>'name', ''),
    1, 202, 'queued', true, 'queued',
    jsonb_build_object('request_id', v_req_id)::text
  );

  RETURN coalesce(new, old);

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.webhook_logs (
    event_type, product_id, product_name, attempt, status_code, response_body, success, status, response
  ) VALUES (
    coalesce(v_event_type, TG_OP), coalesce(v_product_id, ''),
    coalesce(v_record->>'name', ''), 1, 0,
    coalesce(sqlerrm, 'dispatch failed'), false, 'failed',
    jsonb_build_object('sqlstate', sqlstate)::text
  );
  RETURN coalesce(new, old);
END;
$$;

-- Update order trigger function with fallback secret lookup
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
  -- Get the webhook secret from the vault (try CENTRALHUB_WEBHOOK_SECRET first, then WEBHOOK_SECRET)
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name IN ('CENTRALHUB_WEBHOOK_SECRET', 'WEBHOOK_SECRET')
  ORDER BY CASE name WHEN 'CENTRALHUB_WEBHOOK_SECRET' THEN 1 ELSE 2 END, created_at DESC
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE WARNING 'notify_malluspices_order_webhook: no webhook secret found in vault, skipping webhook';
    RETURN new;
  END IF;

  SELECT s.slug INTO v_store_slug
  FROM stores s
  WHERE s.id = new.store_id;

  IF v_store_slug IS NULL OR v_store_slug <> 'malluspices' THEN
    RETURN new;
  END IF;

  IF new.sync_origin = 'malluspices' THEN
    RETURN new;
  END IF;

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

  v_body := jsonb_build_object(
    'type', 'UPDATE',
    'record', jsonb_build_object(
      'id',              coalesce(new.id::text, ''),
      'order_number',    coalesce(new.order_number, ''),
      'confirmed_order_number', coalesce(new.confirmed_order_number, ''),
      'order_status',    coalesce(new.order_status, ''),
      'customer_name',   coalesce(new.customer_name, ''),
      'customer_email',  coalesce(new.customer_email, ''),
      'customer_phone', coalesce(new.customer_phone, ''),
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

  v_req_id := net.http_post(
    url := v_url,
    headers := v_headers,
    body := v_body,
    timeout_milliseconds := 5000
  );

  INSERT INTO public.webhook_logs (
    event_type, product_id, product_name, attempt, status_code, response_body, success, status, response
  ) VALUES (
    'ORDER_UPDATE', coalesce(new.id::text, ''), coalesce(new.order_number, ''),
    1, 202, 'queued', true, 'queued',
    jsonb_build_object('request_id', v_req_id)::text
  );

  RETURN new;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.webhook_logs (
    event_type, product_id, product_name, attempt, status_code, response_body, success, status, response
  ) VALUES (
    'ORDER_UPDATE', coalesce(new.id::text, ''), coalesce(new.order_number, ''),
    1, 0, coalesce(sqlerrm, 'dispatch failed'), false, 'failed',
    jsonb_build_object('sqlstate', sqlstate)::text
  );
  RETURN new;
END;
$$;

NOTIFY pgrst, 'reload schema';

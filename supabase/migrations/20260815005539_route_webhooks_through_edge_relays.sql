/*
  # Route Webhooks Through Edge Function Relays

  ## Problem
  The database triggers were sending webhooks directly to MalluSpices' endpoints,
  but the shared secret in the Postgres vault is a placeholder ("YOUR_...").
  The real CENTRALHUB_WEBHOOK_SECRET is only configured as an edge function
  environment variable, which database triggers cannot access.

  ## Fix
  Update both trigger functions to call CentralHub edge function relays instead:
  - Product trigger -> product-webhook-dispatcher (verifyJWT=false, has the real secret)
  - Order trigger -> order-webhook-relay (verifyJWT=false, has the real secret)

  These relay functions forward the payload to MalluSpices with the correct
  x-webhook-secret header, and retry up to 3 times on failure.

  The relay functions also log real HTTP response codes (200, 401, etc.) to
  webhook_logs, giving us actual delivery confirmation instead of just "queued".
*/

-- ============================================================
-- PRODUCT TRIGGER: call the relay edge function
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
  v_url        text := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/product-webhook-dispatcher';
  v_headers    jsonb;
  v_req_id     bigint;
  v_product_id text;
BEGIN
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

  v_headers := jsonb_build_object('Content-Type', 'application/json');

  v_req_id := net.http_post(
    url := v_url,
    headers := v_headers,
    body := v_payload,
    timeout_milliseconds := 5000
  );

  -- Log the queued request (the relay function will log the actual HTTP result)
  INSERT INTO public.webhook_logs (
    event_type, product_id, product_name, attempt, status_code, response_body, success, status, response
  ) VALUES (
    v_event_type, v_product_id, coalesce(v_record->>'name', ''),
    0, 202, 'queued_to_relay', true, 'queued',
    jsonb_build_object('request_id', v_req_id)::text
  );

  RETURN coalesce(new, old);

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.webhook_logs (
    event_type, product_id, product_name, attempt, status_code, response_body, success, status, response
  ) VALUES (
    coalesce(v_event_type, TG_OP), coalesce(v_product_id, ''),
    coalesce(v_record->>'name', ''), 0,
    coalesce(sqlerrm, 'dispatch failed'), false, 'failed',
    jsonb_build_object('sqlstate', sqlstate)::text
  );
  RETURN coalesce(new, old);
END;
$$;

-- ============================================================
-- ORDER TRIGGER: call the relay edge function
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_malluspices_order_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url        text := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/order-webhook-relay';
  v_headers    jsonb;
  v_body       jsonb;
  v_store_slug text;
  v_req_id     bigint;
  v_items_json jsonb;
BEGIN
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

  v_headers := jsonb_build_object('Content-Type', 'application/json');

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
    0, 202, 'queued_to_relay', true, 'queued',
    jsonb_build_object('request_id', v_req_id)::text
  );

  RETURN new;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.webhook_logs (
    event_type, product_id, product_name, attempt, status_code, response_body, success, status, response
  ) VALUES (
    'ORDER_UPDATE', coalesce(new.id::text, ''), coalesce(new.order_number, ''),
    0, 0, coalesce(sqlerrm, 'dispatch failed'), false, 'failed',
    jsonb_build_object('sqlstate', sqlstate)::text
  );
  RETURN new;
END;
$$;

NOTIFY pgrst, 'reload schema';

/*
  # Fix Webhook Payload Format + Route Through Relays

  ## Problem
  1. The webhook payload format didn't match what MalluSpices expects.
     The compatibility doc specifies `{ type, record }` at the top level,
     but the trigger was sending `{ event, data: { new_record } }`.
  2. The vault secrets are all placeholders. The relay edge functions
     have the real secret in their env vars, so triggers now call relays.

  ## Fix
  Update both trigger functions to:
  - Use the correct payload format: { type, record } for products
  - Use { type, record } for orders (with items embedded)
  - Call the relay edge functions (which have the real secret)
*/

-- ============================================================
-- PRODUCT TRIGGER
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

  -- Build payload in the format MalluSpices expects: { type, record }
  IF v_event_type = 'DELETE' THEN
    v_payload := jsonb_build_object(
      'type', 'DELETE',
      'record', jsonb_build_object('id', v_product_id)
    );
  ELSE
    v_payload := jsonb_build_object(
      'type', v_event_type,
      'record', jsonb_build_object(
        'id',              v_product_id,
        'name',            coalesce(v_record->>'name', ''),
        'slug',            coalesce(v_record->>'slug', ''),
        'sku',             coalesce(v_record->>'sku', ''),
        'price',           coalesce(v_record->>'price', '0'),
        'sale_price',      coalesce(v_record->>'sale_price', null),
        'compare_at_price', null,
        'stock',           coalesce(v_record->>'stock', '0'),
        'in_stock',        coalesce(v_record->>'stock', '0')::int > 0,
        'brand',           coalesce(v_record->>'brand', ''),
        'brand_id',        coalesce(v_record->>'brand_id', ''),
        'category',        coalesce(v_record->>'category', ''),
        'department',      coalesce(v_record->>'department', ''),
        'subcategory',     coalesce(v_record->>'subcategory', ''),
        'unit',            coalesce(v_record->>'unit', ''),
        'weight',          coalesce(v_record->>'weight', ''),
        'gtin',            coalesce(v_record->>'gtin', ''),
        'warehouse_location', coalesce(v_record->>'warehouse_location', ''),
        'description',     coalesce(v_record->>'description', ''),
        'short_description', coalesce(v_record->>'rich_description', ''),
        'image_url',       coalesce(v_record->>'image_url', coalesce(v_record->>'image_main', '')),
        'is_active',       coalesce(v_record->>'is_active', 'true')::boolean,
        'is_published',    coalesce(v_record->>'is_published', 'true')::boolean,
        'is_archived',     coalesce(v_record->>'is_archived', 'false')::boolean,
        'tags',            coalesce(v_record->'tags', '[]'::jsonb),
        'custom_attributes', coalesce(v_record->'custom_attributes', '{}'::jsonb),
        'variants',        '[]'::jsonb,
        'updated_at',      coalesce(v_record->>'updated_at', now()::text)
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
-- ORDER TRIGGER
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

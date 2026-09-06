/*
  # Direct REST API Sync to centralhub_products_raw

  ## Problem
  The edge function deploy limit was reached. The deployed centralhub-product-sync
  still has the updated_at bug. Instead of relying on edge functions, update the
  database trigger to do a direct REST API upsert to MalluSpices' centralhub_products_raw
  table using net.http_post with the service role key.

  ## Schema (discovered via probe)
  centralhub_products_raw columns:
  id, centralhub_id, name, slug, price, stock, product_type, brand,
  warehouse_location, weight, gtin, unit, main_category, sub_category,
  category, subcategory, department, cost_price, weight_grams, sku,
  pack_size, pack_unit, is_active, image_url, image_main, gallery_images,
  description, sale_price, is_published, is_archived, is_deleted, backorder,
  synced_at
*/

CREATE OR REPLACE FUNCTION public.products_product_sync_webhook_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_mallu_url    text := 'https://ixzbnifmsxunlarhfimp.supabase.co/rest/v1/centralhub_products_raw';
  v_mallu_key    text;
  v_headers      jsonb;
  v_body         jsonb;
  v_product_id   text := coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'));
  v_product_name text := coalesce((to_jsonb(new) ->> 'name'), (to_jsonb(old) ->> 'name'), '');
  v_event_type   text := tg_op;
  v_req_id       bigint;
  v_record       jsonb;
  v_available    int;
  v_inv          record;
BEGIN
  -- Get MalluSpices service role key from vault
  SELECT decrypted_secret INTO v_mallu_key
  FROM vault.decrypted_secrets
  WHERE name = 'malluspices_api_key'
  LIMIT 1;

  IF v_mallu_key IS NULL OR v_mallu_key = '' THEN
    INSERT INTO public.webhook_logs (
      event_type, product_id, product_name, attempt, status_code, response_body, success, status
    ) VALUES (
      v_event_type, coalesce(v_product_id, ''), v_product_name,
      1, 500, 'No malluspices_api_key in vault', false, 'failed'
    );
    RETURN coalesce(new, old);
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', v_mallu_key,
    'Authorization', 'Bearer ' || v_mallu_key,
    'Prefer', 'resolution=merge-duplicates'
  );

  -- Handle DELETE
  IF tg_op = 'DELETE' THEN
    v_req_id := net.http_post(
      url := v_mallu_url || '?centralhub_id=eq.' || v_product_id,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_mallu_key,
        'Authorization', 'Bearer ' || v_mallu_key,
        'Prefer', 'return=representation'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 5000
    );

    INSERT INTO public.webhook_logs (
      event_type, product_id, product_name, attempt, status_code, response_body, success, status, response
    ) VALUES (
      'DELETE', coalesce(v_product_id, ''), v_product_name,
      1, 202, 'delete_queued', true, 'queued',
      jsonb_build_object('request_id', v_req_id)::text
    );

    RETURN old;
  END IF;

  v_record := to_jsonb(new);

  -- Get available stock from central_inventory
  SELECT stock_quantity, reserved_quantity INTO v_inv
  FROM central_inventory
  WHERE product_id = v_product_id
  LIMIT 1;

  v_available := coalesce(v_inv.stock_quantity - v_inv.reserved_quantity, coalesce(new.stock, 0));

  -- Build body matching centralhub_products_raw schema
  v_body := jsonb_build_object(
    'centralhub_id', v_product_id,
    'name', coalesce(v_record->>'name', ''),
    'slug', coalesce(v_record->>'slug', ''),
    'price', coalesce(v_record->>'price', '0'),
    'stock', v_available,
    'product_type', coalesce(v_record->>'product_type', 'simple'),
    'brand', coalesce(v_record->>'brand', ''),
    'warehouse_location', coalesce(v_record->>'warehouse_location', ''),
    'weight', coalesce(v_record->>'weight', ''),
    'gtin', coalesce(v_record->>'gtin', ''),
    'unit', coalesce(v_record->>'unit', ''),
    'main_category', coalesce(v_record->>'main_category', ''),
    'sub_category', coalesce(v_record->>'sub_category', ''),
    'category', coalesce(v_record->>'category', ''),
    'subcategory', coalesce(v_record->>'subcategory', ''),
    'department', coalesce(v_record->>'department', ''),
    'cost_price', coalesce(v_record->>'cost_price', '0'),
    'weight_grams', coalesce(v_record->>'weight_grams', null),
    'sku', coalesce(v_record->>'sku', ''),
    'pack_size', coalesce(v_record->>'pack_size', ''),
    'pack_unit', coalesce(v_record->>'pack_unit', ''),
    'is_active', coalesce(v_record->>'is_active', 'true')::boolean,
    'is_published', coalesce(v_record->>'is_published', 'true')::boolean,
    'is_archived', coalesce(v_record->>'is_archived', 'false')::boolean,
    'is_deleted', coalesce(v_record->>'is_deleted', 'false')::boolean,
    'backorder', coalesce(v_record->>'backorder', 'false')::boolean,
    'description', coalesce(v_record->>'description', ''),
    'sale_price', coalesce(v_record->>'sale_price', null),
    'image_url', coalesce(v_record->>'image_url', coalesce(v_record->>'image_main', '')),
    'image_main', coalesce(v_record->>'image_main', ''),
    'gallery_images', coalesce(v_record->'gallery_images', '[]'::jsonb),
    'synced_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );

  -- Upsert via REST API (POST with Prefer: resolution=merge-duplicates)
  v_req_id := net.http_post(
    url := v_mallu_url,
    headers := v_headers,
    body := v_body,
    timeout_milliseconds := 5000
  );

  INSERT INTO public.webhook_logs (
    event_type, product_id, product_name, attempt, status_code, response_body, success, status, response
  ) VALUES (
    v_event_type, coalesce(v_product_id, ''), v_product_name,
    1, 202, 'direct_rest_upsert_queued', true, 'queued',
    jsonb_build_object('request_id', v_req_id, 'target', 'centralhub_products_raw')::text
  );

  RETURN new;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.webhook_logs (
    event_type, product_id, product_name, attempt, status_code, response_body, success, status, response
  ) VALUES (
    v_event_type, coalesce(v_product_id, ''), v_product_name,
    1, 0, coalesce(sqlerrm, 'sync failed'), false, 'failed',
    jsonb_build_object('sqlstate', sqlstate)::text
  );
  RETURN coalesce(new, old);
END;
$$;

NOTIFY pgrst, 'reload schema';

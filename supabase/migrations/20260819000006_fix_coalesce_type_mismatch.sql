-- FIX: COALESCE types uuid and text cannot be matched
-- Objective: Ensure all trigger functions on products and orders use explicit casting to text
-- when using COALESCE with UUID variables and string fallbacks.

-- 1. Fix products_product_sync_webhook_fn
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
  v_product_id   uuid := coalesce(new.id, old.id);
  v_product_name text := coalesce((to_jsonb(new) ->> 'name'), (to_jsonb(old) ->> 'name'), '');
  v_event_type   text := tg_op;
  v_req_id       bigint;
  v_record       jsonb;
  v_available    int;
  v_inv          record;
  v_is_valid     boolean;
BEGIN
  -- Handle DELETE immediately
  IF tg_op = 'DELETE' THEN
    SELECT decrypted_secret INTO v_mallu_key FROM vault.decrypted_secrets WHERE name = 'malluspices_api_key' LIMIT 1;
    IF v_mallu_key IS NOT NULL AND v_mallu_key != '' THEN
      v_req_id := net.http_post(
        url := v_mallu_url || '?centralhub_id=eq.' || v_product_id::text,
        headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_mallu_key, 'Authorization', 'Bearer ' || v_mallu_key, 'Prefer', 'return=representation'),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000
      );
    END IF;
    RETURN old;
  END IF;

  -- Bypass logic for inactive products (avoid noise)
  IF NOT coalesce(new.is_active, false) AND NOT coalesce(old.is_active, false) THEN
    RETURN new;
  END IF;

  -- Integrity check
  v_is_valid := public.is_product_valid(v_product_id, new.price, new.allow_backorder, new.brand, new.sku, new.stock);
  IF NOT v_is_valid AND NOT coalesce(new.is_active, false) THEN
    RETURN new;
  END IF;

  -- Get available stock
  SELECT stock_quantity, reserved_quantity INTO v_inv FROM central_inventory WHERE product_id = v_product_id LIMIT 1;
  v_available := coalesce(v_inv.stock_quantity - COALESCE(v_inv.reserved_quantity, 0), coalesce(new.stock, 0));

  SELECT decrypted_secret INTO v_mallu_key FROM vault.decrypted_secrets WHERE name = 'malluspices_api_key' LIMIT 1;
  IF v_mallu_key IS NULL OR v_mallu_key = '' THEN
    INSERT INTO public.webhook_logs (event_type, product_id, product_name, attempt, status_code, response_body, success, status)
    VALUES (v_event_type, coalesce(v_product_id::text, ''), v_product_name, 1, 500, 'No malluspices_api_key in vault', false, 'failed');
    RETURN new;
  END IF;

  v_record := to_jsonb(new);
  v_headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_mallu_key, 'Authorization', 'Bearer ' || v_mallu_key, 'Prefer', 'resolution=merge-duplicates');

  v_body := jsonb_build_object(
    'centralhub_id', v_product_id,
    'name', coalesce(v_record->>'name', ''),
    'slug', coalesce(v_record->>'slug', ''),
    'price', coalesce(v_record->>'price', '0'),
    'stock', v_available,
    'product_type', coalesce(v_record->>'product_type', 'simple'),
    'brand', coalesce(v_record->>'brand', ''),
    'cost_price', coalesce(v_record->>'cost_price', '0'),
    'sku', coalesce(v_record->>'sku', ''),
    'is_active', coalesce(v_record->>'is_active', 'true')::boolean,
    'is_deleted', coalesce(v_record->>'is_deleted', 'false')::boolean,
    'synced_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );

  v_req_id := net.http_post(url := v_mallu_url || '?on_conflict=centralhub_id', headers := v_headers, body := v_body, timeout_milliseconds := 5000);

  INSERT INTO public.webhook_logs (event_type, product_id, product_name, attempt, status_code, response_body, success, status, response)
  VALUES (v_event_type, coalesce(v_product_id::text, ''), v_product_name, 1, 202, 'queued', true, 'queued', jsonb_build_object('request_id', v_req_id)::text);

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.webhook_logs (event_type, product_id, product_name, attempt, status_code, response_body, success, status, response)
  VALUES (v_event_type, coalesce(v_product_id::text, ''), v_product_name, 1, 0, coalesce(sqlerrm, 'sync failed'), false, 'failed', jsonb_build_object('sqlstate', sqlstate)::text);
  RETURN new;
END;
$$;

-- 2. Fix notify_malluspices_product_webhook (in case it's still attached)
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
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name IN ('CENTRALHUB_WEBHOOK_SECRET', 'WEBHOOK_SECRET') ORDER BY CASE name WHEN 'CENTRALHUB_WEBHOOK_SECRET' THEN 1 ELSE 2 END, created_at DESC LIMIT 1;
  IF v_secret IS NULL THEN RETURN coalesce(new, old); END IF;

  IF TG_OP = 'DELETE' THEN
    v_event_type := 'DELETE';
    v_product_id := coalesce(old.id::text, '');
    v_record := to_jsonb(old);
  ELSE
    v_event_type := TG_OP;
    v_product_id := coalesce(new.id::text, '');
    v_record := to_jsonb(new);
  END IF;

  v_payload := jsonb_build_object(
    'event', v_event_type,
    'data', jsonb_build_object('id', v_product_id, 'name', v_record->>'name')
  );

  v_headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret);
  v_req_id := net.http_post(url := v_url, headers := v_headers, body := v_payload, timeout_milliseconds := 5000);

  INSERT INTO public.webhook_logs (event_type, product_id, product_name, attempt, status_code, response_body, success, status, response)
  VALUES (v_event_type, v_product_id, coalesce(v_record->>'name', ''), 1, 202, 'queued', true, 'queued', jsonb_build_object('request_id', v_req_id)::text);

  RETURN coalesce(new, old);
EXCEPTION WHEN OTHERS THEN
  RETURN coalesce(new, old);
END;
$$;

NOTIFY pgrst, 'reload schema';

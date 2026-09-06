-- Auto-inactivate products that don't meet minimum requirements
-- Requirement:
-- 1. Stock is 0 (except if backorder is enabled)
-- 2. Price is 0
-- 3. Brand name not assigned
-- 4. No SKU

-- 1. Function to evaluate product validity
CREATE OR REPLACE FUNCTION public.is_product_valid(
    p_product_id uuid,
    p_price numeric,
    p_allow_backorder boolean,
    p_brand text,
    p_sku text,
    p_stock_legacy int DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_stock int;
BEGIN
    -- Priority stock check: central_inventory -> products.stock (legacy)
    SELECT stock_quantity INTO v_stock
    FROM public.central_inventory
    WHERE product_id = p_product_id;

    IF v_stock IS NULL THEN
        v_stock := coalesce(p_stock_legacy, 0);
    END IF;

    -- Check all invalid conditions
    IF (v_stock <= 0 AND NOT coalesce(p_allow_backorder, false)) THEN
        RETURN false;
    END IF;

    IF coalesce(p_price, 0) <= 0 THEN
        RETURN false;
    END IF;

    IF trim(coalesce(p_brand, '')) = '' THEN
        RETURN false;
    END IF;

    IF trim(coalesce(p_sku, '')) = '' THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$;

-- 2. Trigger function to auto-inactivate products BEFORE insert or update
CREATE OR REPLACE FUNCTION public.trg_enforce_product_validity_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- If product is invalid, force is_active to false
    IF NOT public.is_product_valid(
        new.id,
        new.price,
        new.allow_backorder,
        new.brand,
        new.sku,
        new.stock
    ) THEN
        new.is_active := false;
    END IF;

    RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_product_validity ON public.products;
CREATE TRIGGER trg_enforce_product_validity
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.trg_enforce_product_validity_fn();

-- 3. Trigger function to re-evaluate validity when central_inventory changes
CREATE OR REPLACE FUNCTION public.trg_refresh_product_validity_on_stock_change_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Touch the product to trigger the BEFORE UPDATE trigger defined above
    UPDATE public.products
    SET updated_at = now()
    WHERE id = new.product_id;

    RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_product_validity_on_stock_change ON public.central_inventory;
CREATE TRIGGER trg_refresh_product_validity_on_stock_change
AFTER INSERT OR UPDATE OF stock_quantity ON public.central_inventory
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_product_validity_on_stock_change_fn();

-- 4. Update the sync webhook function to avoid syncing invalid products
-- This honors the "should not sync with stores ever" requirement for garbage data.
-- We still allow one sync if it's currently active on remote but becoming inactive,
-- but if it's already inactive and invalid, we skip.
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
    -- Get MalluSpices service role key from vault
    SELECT decrypted_secret INTO v_mallu_key
    FROM vault.decrypted_secrets
    WHERE name = 'malluspices_api_key'
    LIMIT 1;

    IF v_mallu_key IS NOT NULL AND v_mallu_key != '' THEN
      v_req_id := net.http_post(
        url := v_mallu_url || '?centralhub_id=eq.' || v_product_id::text,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', v_mallu_key,
          'Authorization', 'Bearer ' || v_mallu_key,
          'Prefer', 'return=representation'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000
      );
    END IF;

    RETURN old;
  END IF;

  -- Check validity for INSERT/UPDATE
  -- Get available stock from central_inventory
  SELECT stock_quantity, reserved_quantity INTO v_inv
  FROM central_inventory
  WHERE product_id = v_product_id
  LIMIT 1;

  v_available := coalesce(v_inv.stock_quantity - v_inv.reserved_quantity, coalesce(new.stock, 0));

  v_is_valid := public.is_product_valid(
    v_product_id,
    new.price,
    new.allow_backorder,
    new.brand,
    new.sku,
    new.stock
  );

  -- Requirement: If product is invalid, it should be inactive and should not sync.
  -- Logic: If it's invalid AND already inactive, we stop here.
  -- This prevents "garbage" data from ever reaching stores.
  -- If it's invalid but WAS active (old.is_active is true), we let the sync proceed
  -- ONCE to update the remote store to is_active=false.
  IF NOT v_is_valid AND NOT coalesce(new.is_active, false) AND NOT coalesce(old.is_active, false) THEN
    RETURN new;
  END IF;

  -- Standard sync logic continues...

  -- Get MalluSpices service role key from vault
  SELECT decrypted_secret INTO v_mallu_key
  FROM vault.decrypted_secrets
  WHERE name = 'malluspices_api_key'
  LIMIT 1;

  IF v_mallu_key IS NULL OR v_mallu_key = '' THEN
    INSERT INTO public.webhook_logs (
      event_type, product_id, product_name, attempt, status_code, response_body, success, status
    ) VALUES (
      v_event_type, coalesce(v_product_id::text, ''), v_product_name,
      1, 500, 'No malluspices_api_key in vault', false, 'failed'
    );
    RETURN new;
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', v_mallu_key,
    'Authorization', 'Bearer ' || v_mallu_key,
    'Prefer', 'resolution=merge-duplicates'
  );

  v_record := to_jsonb(new);

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

  -- Upsert via REST API
  v_req_id := net.http_post(
    url := v_mallu_url || '?on_conflict=centralhub_id',
    headers := v_headers,
    body := v_body,
    timeout_milliseconds := 5000
  );

  INSERT INTO public.webhook_logs (
    event_type, product_id, product_name, attempt, status_code, response_body, success, status, response
  ) VALUES (
    v_event_type, coalesce(v_product_id::text, ''), v_product_name,
    1, 202, 'direct_rest_upsert_queued', true, 'queued',
    jsonb_build_object('request_id', v_req_id, 'target', 'centralhub_products_raw', 'on_conflict', 'centralhub_id')::text
  );

  RETURN new;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.webhook_logs (
    event_type, product_id, product_name, attempt, status_code, response_body, success, status, response
  ) VALUES (
    v_event_type, coalesce(v_product_id::text, ''), v_product_name,
    1, 0, coalesce(sqlerrm, 'sync failed'), false, 'failed',
    jsonb_build_object('sqlstate', sqlstate)::text
  );
  RETURN new;
END;
$$;

-- 5. Perform initial cleanup of existing data
UPDATE public.products p
SET is_active = false, updated_at = now()
WHERE is_active = true
AND NOT public.is_product_valid(
    p.id,
    p.price,
    p.allow_backorder,
    p.brand,
    p.sku,
    p.stock
);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

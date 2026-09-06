/*
  # Fix: Use to_jsonb approach for bulk sync to avoid casting issues
*/

CREATE OR REPLACE FUNCTION public.bulk_sync_all_products_to_malluspices(
  p_batch_size int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE(total_synced int, total_failed int, last_offset int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_mallu_url    text := 'https://ixzbnifmsxunlarhfimp.supabase.co/rest/v1/centralhub_products_raw';
  v_mallu_key    text;
  v_headers      jsonb;
  v_body         jsonb;
  v_req_id       bigint;
  v_product      record;
  v_available    int;
  v_inv          record;
  v_synced       int := 0;
  v_failed       int := 0;
  v_current_off  int := p_offset;
  v_batch_count  int := 0;
  v_row_json     jsonb;
BEGIN
  SELECT decrypted_secret INTO v_mallu_key
  FROM vault.decrypted_secrets
  WHERE name = 'malluspices_api_key'
  LIMIT 1;

  IF v_mallu_key IS NULL OR v_mallu_key = '' THEN
    RAISE EXCEPTION 'No malluspices_api_key in vault';
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', v_mallu_key,
    'Authorization', 'Bearer ' || v_mallu_key,
    'Prefer', 'resolution=merge-duplicates'
  );

  LOOP
    FOR v_product IN
      SELECT id, name, slug, brand, price, sale_price, cost_price, stock,
             unit, weight, weight_kg, weight_grams, is_active, is_published,
             is_archived, is_deleted, gtin, sku, pack_size, pack_unit,
             main_category, sub_category, category, subcategory, department,
             product_type, warehouse_location, backorder, image_url, image_main,
             gallery_images, description
      FROM products
      WHERE (is_deleted = false OR is_deleted IS NULL)
      ORDER BY created_at ASC
      OFFSET v_current_off LIMIT p_batch_size
    LOOP
      SELECT stock_quantity, reserved_quantity INTO v_inv
      FROM central_inventory
      WHERE product_id = v_product.id
      LIMIT 1;

      v_available := coalesce(v_inv.stock_quantity - v_inv.reserved_quantity, coalesce(v_product.stock, 0));

      -- Build JSON from the row, then reshape for centralhub_products_raw
      v_row_json := to_jsonb(v_product);

      v_body := jsonb_build_object(
        'centralhub_id', v_product.id,
        'name', COALESCE(v_row_json->>'name', ''),
        'slug', COALESCE(v_row_json->>'slug', ''),
        'price', COALESCE(v_row_json->'price', '0'::jsonb),
        'stock', v_available,
        'product_type', COALESCE(v_row_json->>'product_type', 'simple'),
        'brand', COALESCE(v_row_json->>'brand', ''),
        'warehouse_location', COALESCE(v_row_json->>'warehouse_location', ''),
        'weight', COALESCE(v_row_json->>'weight', ''),
        'gtin', COALESCE(v_row_json->>'gtin', ''),
        'unit', COALESCE(v_row_json->>'unit', ''),
        'main_category', COALESCE(v_row_json->>'main_category', ''),
        'sub_category', COALESCE(v_row_json->>'sub_category', ''),
        'category', COALESCE(v_row_json->>'category', ''),
        'subcategory', COALESCE(v_row_json->>'subcategory', ''),
        'department', COALESCE(v_row_json->>'department', ''),
        'cost_price', COALESCE(v_row_json->'cost_price', '0'::jsonb),
        'weight_grams', v_row_json->'weight_grams',
        'sku', COALESCE(v_row_json->>'sku', ''),
        'pack_size', COALESCE(v_row_json->>'pack_size', ''),
        'pack_unit', COALESCE(v_row_json->>'pack_unit', ''),
        'is_active', COALESCE(v_row_json->'is_active', 'true'::jsonb),
        'is_published', COALESCE(v_row_json->'is_published', 'true'::jsonb),
        'is_archived', COALESCE(v_row_json->'is_archived', 'false'::jsonb),
        'is_deleted', COALESCE(v_row_json->'is_deleted', 'false'::jsonb),
        'backorder', COALESCE(v_row_json->'backorder', 'false'::jsonb),
        'description', COALESCE(v_row_json->>'description', ''),
        'sale_price', v_row_json->'sale_price',
        'image_url', COALESCE(v_row_json->>'image_url', COALESCE(v_row_json->>'image_main', '')),
        'image_main', COALESCE(v_row_json->>'image_main', ''),
        'gallery_images', COALESCE(v_row_json->'gallery_images', '[]'::jsonb),
        'synced_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      );

      BEGIN
        v_req_id := net.http_post(
          url := v_mallu_url || '?on_conflict=centralhub_id',
          headers := v_headers,
          body := v_body,
          timeout_milliseconds := 5000
        );
        v_synced := v_synced + 1;
      EXCEPTION WHEN OTHERS THEN
        v_failed := v_failed + 1;
      END;

      v_batch_count := v_batch_count + 1;
    END LOOP;

    v_current_off := v_current_off + p_batch_size;
    EXIT WHEN v_batch_count < p_batch_size;
    v_batch_count := 0;
  END LOOP;

  RETURN QUERY SELECT v_synced, v_failed, v_current_off;
END;
$$;

NOTIFY pgrst, 'reload schema';

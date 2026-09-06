/*
  # Fix: Handle empty string numeric values in bulk sync
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
  v_price        numeric;
  v_cost_price   numeric;
  v_sale_price   numeric;
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

      -- Safely handle numeric fields that may be empty strings
      v_price := nullif(v_product.price::text, '')::numeric;
      v_cost_price := nullif(v_product.cost_price::text, '')::numeric;
      v_sale_price := nullif(v_product.sale_price::text, '')::numeric;

      v_body := jsonb_build_object(
        'centralhub_id', v_product.id,
        'name', coalesce(v_product.name, ''),
        'slug', coalesce(v_product.slug, ''),
        'price', coalesce(v_price, 0),
        'stock', v_available,
        'product_type', coalesce(v_product.product_type, 'simple'),
        'brand', coalesce(v_product.brand, ''),
        'warehouse_location', coalesce(v_product.warehouse_location, ''),
        'weight', coalesce(v_product.weight, ''),
        'gtin', coalesce(v_product.gtin, ''),
        'unit', coalesce(v_product.unit, ''),
        'main_category', coalesce(v_product.main_category, ''),
        'sub_category', coalesce(v_product.sub_category, ''),
        'category', coalesce(v_product.category, ''),
        'subcategory', coalesce(v_product.subcategory, ''),
        'department', coalesce(v_product.department, ''),
        'cost_price', coalesce(v_cost_price, 0),
        'weight_grams', v_product.weight_grams,
        'sku', coalesce(v_product.sku, ''),
        'pack_size', coalesce(v_product.pack_size, ''),
        'pack_unit', coalesce(v_product.pack_unit, ''),
        'is_active', coalesce(v_product.is_active, true),
        'is_published', coalesce(v_product.is_published, true),
        'is_archived', coalesce(v_product.is_archived, false),
        'is_deleted', coalesce(v_product.is_deleted, false),
        'backorder', coalesce(v_product.backorder, false),
        'description', coalesce(v_product.description, ''),
        'sale_price', v_sale_price,
        'image_url', coalesce(v_product.image_url, coalesce(v_product.image_main, '')),
        'image_main', coalesce(v_product.image_main, ''),
        'gallery_images', coalesce(v_product.gallery_images, '[]'::jsonb),
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

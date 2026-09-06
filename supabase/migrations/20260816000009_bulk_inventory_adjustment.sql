-- Bulk Inventory Adjustment Transactional Function
-- Accepts SKU-based mapping to avoid ambiguity

CREATE OR REPLACE FUNCTION public.process_bulk_physical_count(
    p_items jsonb, -- array of {sku: string, count: number}
    p_reason text,
    p_adjustment_type text,
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item jsonb;
    v_sku text;
    v_new_count integer;
    v_product_id uuid;
    v_product_name text;
    v_old_stock integer;
    v_change integer;
    v_batch_id uuid := gen_random_uuid();
    v_updated_skus text[] := '{}';
    v_skipped_skus text[] := '{}';
    v_errors jsonb[] := '{}';
    v_processed_count integer := 0;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_sku := v_item->>'sku';
        v_new_count := (v_item->>'count')::integer;

        -- 1. Validate SKU
        SELECT id, name INTO v_product_id, v_product_name
        FROM public.products
        WHERE sku = v_sku AND (is_deleted IS NULL OR is_deleted = false)
        LIMIT 1;

        IF v_product_id IS NULL THEN
            v_errors := v_errors || jsonb_build_object('sku', v_sku, 'reason', 'SKU not found or deleted');
            CONTINUE;
        END IF;

        -- 2. Validate Count
        IF v_new_count IS NULL OR v_new_count < 0 THEN
            v_errors := v_errors || jsonb_build_object('sku', v_sku, 'reason', 'Invalid count: must be non-negative integer');
            CONTINUE;
        END IF;

        -- 3. Get Current Stock from central_inventory (Source of Truth)
        SELECT stock_quantity INTO v_old_stock
        FROM public.central_inventory
        WHERE product_id = v_product_id;

        IF v_old_stock IS NULL THEN
            v_old_stock := 0;
            -- Create central_inventory row if missing for this product
            INSERT INTO public.central_inventory (product_id, stock_quantity, updated_at)
            VALUES (v_product_id, 0, now());
        END IF;

        v_change := v_new_count - v_old_stock;

        -- 4. Update central_inventory
        UPDATE public.central_inventory
        SET stock_quantity = v_new_count,
            updated_at = now()
        WHERE product_id = v_product_id;

        -- 5. Sync products.stock (Legacy compat)
        UPDATE public.products
        SET stock = v_new_count,
            updated_at = now()
        WHERE id = v_product_id;

        -- 6. Log it in inventory_logs
        INSERT INTO public.inventory_logs (
            product_id, product_name, sku, change,
            old_quantity, new_quantity, type, movement_type,
            notes, reason, created_at, edited_by, reference_id, reference_type
        )
        VALUES (
            v_product_id, v_product_name, v_sku, v_change,
            v_old_stock, v_new_count, 'ADJUSTMENT',
            CASE WHEN v_change >= 0 THEN 'IN' ELSE 'OUT' END,
            COALESCE(p_reason, 'Bulk Physical Count') || ' (Batch: ' || v_batch_id || ')',
            p_reason,
            now(),
            p_user_id,
            v_batch_id::text,
            'BULK_COUNT'
        );

        v_updated_skus := v_updated_skus || v_sku;
        v_processed_count := v_processed_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'updated_skus', v_updated_skus,
        'skipped_skus', v_skipped_skus,
        'errors', v_errors,
        'requested_count', jsonb_array_length(p_items),
        'processed_count', v_processed_count,
        'batch_id', v_batch_id
    );
END;
$$;

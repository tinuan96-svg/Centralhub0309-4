-- RECOVERY SCRIPT FOR MISSED SKUS
-- Sets stock to 10 in central_inventory and syncs products.stock
-- Writes audit logs for the recovery action

DO $$
DECLARE
    v_target_skus text[] := ARRAY['3IN-ARI-12-POD', '4FI-KIT-0-KG', 'AGA-CYC-1-PCS', 'APP-NIR-1-KG', 'APP-TAS-1-KG', 'BAN-HOM-0-KG'];
    v_sku text;
    v_product_id uuid;
    v_product_name text;
    v_old_stock integer;
    v_new_stock integer := 10;
    v_change integer;
    v_reason text := 'Recovery: Bulk Physical Count Fix';
BEGIN
    FOREACH v_sku IN ARRAY v_target_skus
    LOOP
        -- Get Product Info
        SELECT id, name INTO v_product_id, v_product_name
        FROM public.products
        WHERE sku = v_sku;

        IF v_product_id IS NOT NULL THEN
            -- Get Current Stock from central_inventory
            SELECT stock_quantity INTO v_old_stock
            FROM public.central_inventory
            WHERE product_id = v_product_id;

            IF v_old_stock IS NULL THEN v_old_stock := 0; END IF;

            v_change := v_new_stock - v_old_stock;

            -- 1. Update central_inventory
            INSERT INTO public.central_inventory (product_id, stock_quantity, updated_at)
            VALUES (v_product_id, v_new_stock, now())
            ON CONFLICT (product_id) DO UPDATE
            SET stock_quantity = EXCLUDED.stock_quantity, updated_at = now();

            -- 2. Update products.stock - REMOVED: Managed by database trigger
            -- UPDATE public.products SET stock = v_new_stock, updated_at = now() WHERE id = v_product_id;

            -- 3. Log it
            INSERT INTO public.inventory_logs (
                product_id, product_name, sku, change,
                old_quantity, new_quantity, type, movement_type,
                notes, reason, created_at
            )
            VALUES (
                v_product_id, v_product_name, v_sku, v_change,
                v_old_stock, v_new_stock, 'ADJUSTMENT',
                CASE WHEN v_change >= 0 THEN 'IN' ELSE 'OUT' END,
                v_reason,
                'Bulk Physical Count',
                now()
            );

            RAISE NOTICE 'Recovered SKU %: Set to % (Change: %)', v_sku, v_new_stock, v_change;
        ELSE
            RAISE WARNING 'SKU % not found', v_sku;
        END IF;
    END LOOP;
END $$;

-- VERIFICATION QUERY
SELECT
    p.sku,
    p.name,
    ci.stock_quantity as central_stock,
    p.stock as legacy_stock
FROM products p
JOIN central_inventory ci ON ci.product_id = p.id
WHERE p.sku IN ('3IN-ARI-12-POD', '4FI-KIT-0-KG', 'AGA-CYC-1-PCS', 'APP-NIR-1-KG', 'APP-TAS-1-KG', 'BAN-HOM-0-KG');

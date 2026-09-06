-- CentralHub now owns one canonical product master and each store has its own
-- separate database. The old store_products assignment/override architecture is
-- retired. Product propagation is handled only by the active database-level
-- direct sync path.

DROP TABLE IF EXISTS public.store_products CASCADE;
DROP TABLE IF EXISTS public.products_sync_staging CASCADE;
DROP TABLE IF EXISTS public.product_supplier_map CASCADE;
DROP TABLE IF EXISTS public.product_supplier_mappings CASCADE;

DROP FUNCTION IF EXISTS public.get_store_product_visibility(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_products_for_store_simple(uuid);
DROP FUNCTION IF EXISTS public.toggle_product_visibility(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS public.bulk_set_product_visibility(uuid[], uuid, boolean);
DROP FUNCTION IF EXISTS public.get_visibility_summary(uuid);
DROP FUNCTION IF EXISTS public.compute_store_product_price(uuid, uuid);
DROP FUNCTION IF EXISTS public.compute_store_product_stock_override(uuid, uuid);
DROP FUNCTION IF EXISTS public.apply_store_product_stock_defaults();
DROP FUNCTION IF EXISTS public.enforce_store_product_active_rules();
DROP FUNCTION IF EXISTS public.enforce_store_product_not_deleted();
DROP FUNCTION IF EXISTS public.propagate_inventory_changes_to_store_products();
DROP FUNCTION IF EXISTS public.recalc_store_product_stock_override();
DROP FUNCTION IF EXISTS public.set_store_product_status();
DROP FUNCTION IF EXISTS public.sync_store_product_image_override();
DROP FUNCTION IF EXISTS public.sync_store_products_defaults();
DROP FUNCTION IF EXISTS public.sync_store_products_from_central_inventory();
DROP FUNCTION IF EXISTS public.sync_keralagroceries_store_products_trigger();
DROP FUNCTION IF EXISTS public.fn_pocketgrocery_apply_rules();
DROP FUNCTION IF EXISTS public.sync_products_to_keralagrocery();
DROP FUNCTION IF EXISTS public.trigger_product_sync();
DROP FUNCTION IF EXISTS public.notify_malluspices_product_webhook();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'product-sync-every-5-min') THEN
    PERFORM cron.unschedule('product-sync-every-5-min');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DROP TRIGGER IF EXISTS central_inventory_refresh_store_stock_tg ON public.central_inventory;
DROP TRIGGER IF EXISTS tr_refresh_from_stores ON public.stores;
DROP TRIGGER IF EXISTS trg_auto_approve_store_product ON public.products;
DROP FUNCTION IF EXISTS public.trg_central_inventory_refresh_store_stock();
DROP FUNCTION IF EXISTS public.trg_refresh_from_stores();
DROP FUNCTION IF EXISTS public.auto_approve_store_product();

NOTIFY pgrst, 'reload schema';

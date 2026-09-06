-- DISABLE LEGACY PRODUCT SYNC SYSTEM
-- Objective: Stop the application from sending data to obsolete infrastructure.

-- 1. Unschedule pg_cron jobs
DO $$
BEGIN
  PERFORM cron.unschedule('product-sync-every-5-min');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not unschedule product-sync-every-5-min: %', SQLERRM;
END$$;

-- 2. Drop legacy sync triggers on products table
DROP TRIGGER IF EXISTS products_webhook_trigger ON public.products;
DROP TRIGGER IF EXISTS products_product_sync_webhook ON public.products;
DROP TRIGGER IF EXISTS notify_malluspices_product_webhook ON public.products;
DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;

-- 3. Drop legacy sync functions
DROP FUNCTION IF EXISTS public.notify_product_webhook();
DROP FUNCTION IF EXISTS public.trigger_product_sync();
DROP FUNCTION IF EXISTS public.products_product_sync_webhook_fn();
DROP FUNCTION IF EXISTS public.notify_malluspices_product_webhook();

-- 4. Clean up legacy sync logs (optional, preserving for audit but stopping new entries)
-- DELETE FROM public.sync_logs WHERE action LIKE 'cron_trigger%';

-- 5. Notify PostgREST
NOTIFY pgrst, 'reload schema';

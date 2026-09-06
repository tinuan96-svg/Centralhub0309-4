/*
  # DATABASE ARCHITECTURE ALIGNMENT & CLEANUP

  ## Purpose
  Aligns the database state with the Direct-Store architecture and removes
  broken dependencies on dropped logging tables (webhook_logs, sync_logs).

  ## Changes
  1. STOP BROKEN CRON JOBS
     - Unschedule 'product-sync-every-5-min'
  2. DROP BROKEN TRIGGER FUNCTIONS
     - Drop products_product_sync_webhook_fn (references dropped webhook_logs)
     - Drop trigger_product_sync (references dropped sync_logs)
     - Drop notify_malluspices_product_webhook (references dropped webhook_logs)
     - Drop notify_malluspices_order_webhook (references dropped webhook_logs)
  3. REMOVE PRODUCT SYNC TRIGGERS
     - All product propagation is now managed by the application layer or
       future stateless webhooks that do not rely on local log tables.
  4. RETAIN SAFE SYSTEMS
     - Preserve inventory triggers (handle_order_inventory_movement)
     - Preserve order sync edge function connectivity
*/

-- 1. Unschedule broken cron jobs
DO $$
BEGIN
  PERFORM cron.unschedule('product-sync-every-5-min');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Cron job product-sync-every-5-min already unscheduled';
END$$;

-- 2. Remove broken triggers from products table
DROP TRIGGER IF EXISTS products_product_sync_webhook ON public.products;
DROP TRIGGER IF EXISTS trg_malluspices_product_webhook ON public.products;
DROP TRIGGER IF EXISTS products_webhook_trigger ON public.products;

-- 3. Remove broken triggers from orders table
DROP TRIGGER IF EXISTS trg_malluspices_order_webhook ON public.orders;
DROP TRIGGER IF EXISTS trg_push_order_status_to_malluspices ON public.orders;

-- 4. Drop broken functions
DROP FUNCTION IF EXISTS public.products_product_sync_webhook_fn() CASCADE;
DROP FUNCTION IF EXISTS public.trigger_product_sync() CASCADE;
DROP FUNCTION IF EXISTS public.notify_malluspices_product_webhook() CASCADE;
DROP FUNCTION IF EXISTS public.notify_malluspices_order_webhook() CASCADE;
DROP FUNCTION IF EXISTS public.push_order_status_to_malluspices() CASCADE;


-- 5. Finalize schema alignment
-- Ensure no other functions in public schema reference the dropped log tables
DO $$
DECLARE
    v_func_name text;
BEGIN
    FOR v_func_name IN
        SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.prosrc ~* 'webhook_logs|sync_logs|product_sync_logs'
    LOOP
        RAISE NOTICE 'Function % still references dropped logs table. Manual review required.', v_func_name;
    END LOOP;
END$$;

NOTIFY pgrst, 'reload schema';

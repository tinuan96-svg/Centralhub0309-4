-- CLEANUP LEGACY SYNC DATA
-- Removes tables and data related to the old app-level/Edge Function sync system
-- This saves on database storage charges and compute resources.

-- 1. Drop logging tables that can grow very large
DROP TABLE IF EXISTS public.webhook_logs CASCADE;
DROP TABLE IF EXISTS public.sync_logs CASCADE;
DROP TABLE IF EXISTS public.product_sync_logs CASCADE;

-- 2. Drop legacy store synchronization functions (if they survived previous cleanups)
DROP FUNCTION IF EXISTS public.push_order_status_to_malluspices() CASCADE;
DROP FUNCTION IF EXISTS public.push_order_status_to_remote() CASCADE;
DROP FUNCTION IF EXISTS public.trg_notify_order_change() CASCADE;

-- 3. Cleanup redundant shipment sync queue if you are transitioning shipping to SQL sync as well
-- Uncomment the next line if shipping sync is also handled by PostgreSQL now
-- DROP TABLE IF EXISTS public.shipment_sync_queue CASCADE;

COMMENT ON DATABASE postgres IS 'Final cleanup of legacy app-level sync infrastructure in favor of PostgreSQL-native sync.';

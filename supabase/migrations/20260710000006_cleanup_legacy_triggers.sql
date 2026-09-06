-- ============================================================
-- CLEANUP LEGACY TRIGGERS AND FUNCTIONS
-- Resolves errors caused by remnants of old sync logic hitting missing columns
-- ============================================================

-- 1. Drop problematic store propagation trigger and function
-- This resolves: column sp.current_stock does not exist
DROP TRIGGER IF EXISTS trigger_propagate_store_changes ON public.stores;
DROP FUNCTION IF EXISTS public.propagate_store_changes_to_store_products() CASCADE;

-- 2. Drop similar legacy propagation triggers that might exist
DROP TRIGGER IF EXISTS trigger_propagate_product_changes ON public.products;
DROP FUNCTION IF EXISTS public.propagate_product_changes_to_store_products() CASCADE;

-- 3. Cleanup other potential remnants from old multi-store versions
DROP TRIGGER IF EXISTS trigger_refresh_from_store_products ON public.store_products;
DROP FUNCTION IF EXISTS public.trg_refresh_from_store_products() CASCADE;

-- 4. Ensure store_products has a clean, standard schema as defined in migrations
-- If any columns like 'current_stock' or 'store_name' were manually added and are now missing,
-- this ensures we don't rely on them in triggers.

COMMENT ON DATABASE postgres IS 'Cleaned up legacy triggers to ensure compatibility with simplified master-products architecture.';

-- ============================================================
-- REMOVE STAGING ARCHITECTURE
-- Removes specialized staging tables, triggers, and RPC functions
-- to simplify the architecture as requested.
-- ============================================================

-- 1. Drop Triggers on master tables
DROP TRIGGER IF EXISTS trigger_sync_keralagroceries_store_products ON public.store_products;
DROP TRIGGER IF EXISTS trigger_sync_keralagroceries_products ON public.products;
DROP TRIGGER IF EXISTS trigger_sync_keralagroceries_inventory ON public.central_inventory;
DROP TRIGGER IF EXISTS trigger_sync_keralagroceries_row ON public.products;

DROP TRIGGER IF EXISTS trigger_sync_malluspices_store_products ON public.store_products;
DROP TRIGGER IF EXISTS trigger_sync_malluspices_products ON public.products;
DROP TRIGGER IF EXISTS trigger_sync_malluspices_inventory ON public.central_inventory;

-- 2. Drop staging tables
DROP TABLE IF EXISTS public.keralagroceries CASCADE;
DROP TABLE IF EXISTS public.pocketgrocery CASCADE;
DROP TABLE IF EXISTS public.malluspices CASCADE;
DROP TABLE IF EXISTS public.products_import_staging CASCADE;

-- 3. Drop specialized sync functions
DROP FUNCTION IF EXISTS public.sync_keralagroceries_row(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.fn_keralagroceries_apply_rules() CASCADE;
DROP FUNCTION IF EXISTS public.sync_keralagroceries_store_products_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.sync_keralagroceries_products_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.sync_keralagroceries_inventory_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.sync_keralagroceries_categories_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.sync_keralagroceries_brands_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.set_keralagroceries_product_code() CASCADE;
DROP FUNCTION IF EXISTS public.fn_refresh_keralagroceries_from_mapping() CASCADE;

DROP FUNCTION IF EXISTS public.sync_malluspices_row(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.fn_malluspices_apply_rules() CASCADE;
DROP FUNCTION IF EXISTS public.sync_malluspices_store_products_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.sync_malluspices_products_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.sync_malluspices_inventory_trigger() CASCADE;

DROP FUNCTION IF EXISTS public.fn_pocketgrocery_apply_rules() CASCADE;

-- 4. Drop API RPC functions
DROP FUNCTION IF EXISTS public.api_keralagroceries_products(text, text, integer, integer) CASCADE;
DROP FUNCTION IF EXISTS public.api_keralagroceries_grouped(text, integer) CASCADE;
DROP FUNCTION IF EXISTS public.api_keralagroceries_product_detail(text) CASCADE;
DROP FUNCTION IF EXISTS public.api_keralagroceries_filters() CASCADE;
DROP FUNCTION IF EXISTS public.api_keralagroceries() CASCADE;
DROP FUNCTION IF EXISTS public.api_malluspices_products(text, text, integer, integer) CASCADE;

-- 5. Drop sequences
DROP SEQUENCE IF EXISTS public.keralagroceries_product_code_seq;

COMMENT ON DATABASE postgres IS 'CentralHub simplified architecture: websites should now fetch directly from store_products or products tables.';

-- Remove automatic SKU generation logic from the database
-- This ensures that SKUs must be provided manually or remain null, avoiding randomized values

-- 1. Drop triggers from products table
DROP TRIGGER IF EXISTS auto_generate_sku_trigger ON public.products;
DROP TRIGGER IF EXISTS trigger_auto_generate_sku ON public.products;

-- 2. Drop the functions
DROP FUNCTION IF EXISTS public.auto_generate_sku() CASCADE;
DROP FUNCTION IF EXISTS public.generate_sku() CASCADE;
DROP FUNCTION IF EXISTS public.generate_sku(uuid) CASCADE;

-- 3. Update existing randomized SKUs to null if they match the SKU-XXXXXXXX format
-- This helps clean up previous auto-generated data that might cause confusion with strict matching
-- Only updating if they start with 'SKU-' and have 8 hex characters following
UPDATE public.products
SET sku = NULL
WHERE sku ~ '^SKU-[0-9A-F]{8}$';

COMMENT ON COLUMN public.products.sku IS 'Stock Keeping Unit. Must be unique and manually assigned to match remote stores.';

-- Remove only redundant standalone indexes. The UNIQUE constraint-backed index
-- product_variant_links_product_id_key remains intact.
DROP INDEX IF EXISTS public.product_variant_links_group_idx;
DROP INDEX IF EXISTS public.product_variant_links_product_uidx;

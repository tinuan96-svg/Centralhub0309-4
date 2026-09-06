-- The unique index on sku is non-partial, meaning multiple products with NULL sku
-- would conflict. Make it partial so NULLs are allowed.
DROP INDEX IF EXISTS public.idx_products_sku_unique;
CREATE UNIQUE INDEX idx_products_sku_unique ON public.products (sku) WHERE sku IS NOT NULL;

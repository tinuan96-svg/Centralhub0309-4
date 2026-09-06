-- Ensure public access to products and related tables for sync purposes
-- This fixes the "permission denied" error seen in the sync dashboard

-- 1. Grant SELECT on products to anon
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.product_variants TO anon;
GRANT SELECT ON public.brands TO anon;
GRANT SELECT ON public.categories TO anon;

-- 2. Update RLS policies to be explicit for public access
DROP POLICY IF EXISTS "Public read access" ON public.products;
CREATE POLICY "Public read access" ON public.products
    FOR SELECT TO anon
    USING (is_deleted = false OR is_deleted IS NULL);

DROP POLICY IF EXISTS "Users can view product variants" ON public.product_variants;
CREATE POLICY "Public view product variants"
  ON public.product_variants FOR SELECT
  TO anon
  USING (is_active = true);

DROP POLICY IF EXISTS "Public read access" ON public.categories;
CREATE POLICY "Public read access" ON public.categories
    FOR SELECT TO anon
    USING (true);

-- Ensure authenticated also maintains access
DROP POLICY IF EXISTS "Users can view products" ON public.products;
CREATE POLICY "Users can view products"
    ON public.products FOR SELECT
    TO authenticated
    USING (is_deleted = false OR is_deleted IS NULL);

DROP POLICY IF EXISTS "Authenticated users can view product variants" ON public.product_variants;
CREATE POLICY "Authenticated users can view product variants"
    ON public.product_variants FOR SELECT
    TO authenticated
    USING (true);

-- 3. Grant usage on schema to anon (just in case)
GRANT USAGE ON SCHEMA public TO anon;

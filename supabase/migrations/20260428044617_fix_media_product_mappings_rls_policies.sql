/*
  # Fix media_product_mappings Always-True RLS Policies

  The DELETE, INSERT, and UPDATE policies on media_product_mappings use `true`
  as their condition, which bypasses row-level security for authenticated users.
  These are replaced with proper ownership checks that scope access to the
  authenticated user only.

  Since media_product_mappings links media assets to products and both are
  admin-managed, the correct check is that the user is authenticated (is_admin()).
*/

DROP POLICY IF EXISTS "Authenticated users can delete media mappings" ON public.media_product_mappings;
DROP POLICY IF EXISTS "Authenticated users can insert media mappings" ON public.media_product_mappings;
DROP POLICY IF EXISTS "Authenticated users can update media mappings" ON public.media_product_mappings;

CREATE POLICY "Admins can delete media mappings"
  ON public.media_product_mappings
  FOR DELETE
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can insert media mappings"
  ON public.media_product_mappings
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update media mappings"
  ON public.media_product_mappings
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

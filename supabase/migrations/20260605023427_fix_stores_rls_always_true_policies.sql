/*
  # Fix always-true RLS policies on stores table

  The DELETE, INSERT, and UPDATE policies on stores currently use `true`
  as their condition, which bypasses row-level security entirely for any
  authenticated user. Replace with is_admin() checks so only admins can
  mutate stores.
*/

DROP POLICY IF EXISTS "Authenticated users can delete stores" ON public.stores;
DROP POLICY IF EXISTS "Authenticated users can insert stores" ON public.stores;
DROP POLICY IF EXISTS "Authenticated users can update stores" ON public.stores;

CREATE POLICY "Admins can insert stores"
  ON public.stores
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update stores"
  ON public.stores
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete stores"
  ON public.stores
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

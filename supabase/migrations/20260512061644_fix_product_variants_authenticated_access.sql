/*
  # Fix product_variants access for authenticated users

  Querying the products table fails with "permission denied for table product_variants"
  because triggers or functions on products access product_variants without the
  authenticated role having SELECT permission on it.

  Grant SELECT on product_variants (and related tables touched by triggers) to
  the authenticated role so product queries work correctly.
*/

GRANT SELECT ON public.product_variants TO authenticated;
GRANT SELECT ON public.product_variants TO anon;

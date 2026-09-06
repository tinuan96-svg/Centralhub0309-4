/*
  # Revoke anon SELECT from tables not meant to be publicly visible

  This admin application authenticates all users before they can access data.
  The anon role has no business reading these tables directly, and their
  exposure in the GraphQL schema leaks the schema structure to unauthenticated
  callers.

  Tables intentionally kept accessible to anon (storefront use):
  - products, stores, categories, brands (public storefront reads go through
    SECURITY DEFINER RPC functions; direct table access for anon is removed here
    but the RPC functions still serve public data)

  Note: REVOKE on a table only removes the default public grant. Existing RLS
  policies remain in place for the authenticated role.
*/

-- Tables that should never be readable by unauthenticated callers
REVOKE SELECT ON public.banners FROM anon;
REVOKE SELECT ON public.product_slug_history FROM anon;
REVOKE SELECT ON public.webhook_logs FROM anon;

-- Restrict anon direct table access (storefront reads go through RPC functions)
REVOKE SELECT ON public.products FROM anon;
REVOKE SELECT ON public.stores FROM anon;
REVOKE SELECT ON public.categories FROM anon;
REVOKE SELECT ON public.brands FROM anon;
REVOKE SELECT ON public.product_variants FROM anon;

-- View
REVOKE SELECT ON public.sync_status_dashboard FROM anon;

-- Tables only accessible to authenticated admins
REVOKE SELECT ON public.cart FROM authenticated;
REVOKE SELECT ON public.central_inventory FROM authenticated;
REVOKE SELECT ON public.order_status_history FROM authenticated;
REVOKE SELECT ON public.orders FROM authenticated;
REVOKE SELECT ON public.user_profiles FROM authenticated;

-- Re-grant with explicit authenticated-only policies (webhook_logs, product_slug_history)
-- These tables already have RLS; the REVOKE removes the broad schema-level grant
-- The existing authenticated RLS policies continue to control row access
GRANT SELECT ON public.webhook_logs TO authenticated;
GRANT SELECT ON public.product_slug_history TO authenticated;
GRANT SELECT ON public.banners TO authenticated;
GRANT SELECT ON public.product_variants TO authenticated;
GRANT SELECT ON public.sync_status_dashboard TO authenticated;
GRANT SELECT ON public.cart TO authenticated;
GRANT SELECT ON public.central_inventory TO authenticated;
GRANT SELECT ON public.order_status_history TO authenticated;
GRANT SELECT ON public.orders TO authenticated;
GRANT SELECT ON public.user_profiles TO authenticated;

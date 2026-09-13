-- Harden internal CentralHub tables that already had RLS enabled but no policies.
-- CentralHub is a single-super-admin application, so authenticated access remains
-- explicitly gated through public.is_admin(). Service-role workers bypass RLS.

DROP POLICY IF EXISTS "legacy_product_source_map admin only" ON public.legacy_product_source_map;
CREATE POLICY "legacy_product_source_map admin only"
ON public.legacy_product_source_map
FOR ALL
TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "mailbox_accounting_scan_state admin only" ON public.mailbox_accounting_scan_state;
CREATE POLICY "mailbox_accounting_scan_state admin only"
ON public.mailbox_accounting_scan_state
FOR ALL
TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));

-- This function is a trigger guard, not a public RPC. Pin its search_path so
-- relation/function resolution cannot be influenced by a caller's role settings.
ALTER FUNCTION public.guard_order_item_product_reference()
  SET search_path = pg_catalog, public;

REVOKE ALL ON FUNCTION public.guard_order_item_product_reference() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_order_item_product_reference() FROM anon;
REVOKE ALL ON FUNCTION public.guard_order_item_product_reference() FROM authenticated;

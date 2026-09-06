-- SECURITY HARDENING: RLS Audit and Anon Access Revocation
-- Objective: Protect sensitive business data from unauthorized anonymous access.

-- 1. Revoke dangerous grants from 'anon'
REVOKE ALL ON public.orders FROM anon;
REVOKE ALL ON public.order_items FROM anon;
REVOKE ALL ON public.bank_transactions FROM anon;
REVOKE ALL ON public.store_bank_accounts FROM anon;
REVOKE ALL ON public.suppliers FROM anon;
REVOKE ALL ON public.supplier_invoices FROM anon;
REVOKE ALL ON public.supplier_invoice_items FROM anon;
REVOKE ALL ON public.inventory_logs FROM anon;
REVOKE ALL ON public.inventory_movements FROM anon;
REVOKE ALL ON public.whatsapp_conversations FROM anon;
REVOKE ALL ON public.whatsapp_messages FROM anon;
REVOKE ALL ON public.whatsapp_contacts FROM anon;
REVOKE ALL ON public.support_tickets FROM anon;
REVOKE ALL ON public.webhook_logs FROM anon;
REVOKE ALL ON public.sync_logs FROM anon;
REVOKE ALL ON public.user_profiles FROM anon;

-- 2. Ensure sensitive tables have RLS enabled
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_bank_accounts ENABLE ROW LEVEL SECURITY;

-- 3. Restrict SELECT to authenticated for sensitive tables
DROP POLICY IF EXISTS "Allow authenticated read" ON public.orders;
CREATE POLICY "Allow authenticated read" ON public.orders FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated read" ON public.order_items;
CREATE POLICY "Allow authenticated read" ON public.order_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated read" ON public.supplier_invoices;
CREATE POLICY "Allow authenticated read" ON public.supplier_invoices FOR SELECT TO authenticated USING (true);

-- 4. Restrict EXECUTE on SECURITY DEFINER functions
-- (Revoke from PUBLIC and anon, then grant back to authenticated where needed)
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- Grant EXECUTE to authenticated and service_role for common functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- 5. Restore SELECT on public catalog for anon (Storefront)
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.product_variants TO anon;
GRANT SELECT ON public.categories TO anon;
GRANT SELECT ON public.brands TO anon;
GRANT SELECT ON public.stores TO anon;
GRANT SELECT ON public.store_products TO anon;
GRANT SELECT ON public.central_inventory TO anon;

-- 6. Notify PostgREST
NOTIFY pgrst, 'reload schema';

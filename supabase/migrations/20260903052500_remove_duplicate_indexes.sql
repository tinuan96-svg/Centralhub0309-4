-- Remove duplicate indexes reported by the Supabase performance advisor.
-- Keep the original canonical index in each group.
DROP INDEX IF EXISTS public.idx_inventory_logs_created_at;
DROP INDEX IF EXISTS public.idx_order_whatsapp_notifications_order;
DROP INDEX IF EXISTS public.idx_order_whatsapp_notifications_order_id;
DROP INDEX IF EXISTS public.idx_order_whatsapp_notifications_status;
DROP INDEX IF EXISTS public.idx_order_whatsapp_notifications_store_id;
DROP INDEX IF EXISTS public.idx_order_whatsapp_notifications_wa_message_id;
DROP INDEX IF EXISTS public.idx_store_business_identity_store_id;
DROP INDEX IF EXISTS public.idx_supplier_invoice_items_invoice;
DROP INDEX IF EXISTS public.idx_supplier_invoices_supplier;

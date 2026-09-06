INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('supplier-invoices','supplier-invoices',false,20971520,ARRAY['application/pdf','image/jpeg','image/png','image/webp']::text[]) ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=20971520,allowed_mime_types=ARRAY['application/pdf','image/jpeg','image/png','image/webp']::text[];
DROP POLICY IF EXISTS supplier_invoice_storage_select ON storage.objects;
CREATE POLICY supplier_invoice_storage_select ON storage.objects FOR SELECT TO authenticated USING(bucket_id='supplier-invoices' AND public.is_admin());
DROP POLICY IF EXISTS supplier_invoice_storage_insert ON storage.objects;
CREATE POLICY supplier_invoice_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='supplier-invoices' AND public.is_admin());
DROP POLICY IF EXISTS supplier_invoice_storage_update ON storage.objects;
CREATE POLICY supplier_invoice_storage_update ON storage.objects FOR UPDATE TO authenticated USING(bucket_id='supplier-invoices' AND public.is_admin()) WITH CHECK(bucket_id='supplier-invoices' AND public.is_admin());
DROP POLICY IF EXISTS supplier_invoice_storage_delete ON storage.objects;
CREATE POLICY supplier_invoice_storage_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='supplier-invoices' AND public.is_admin());
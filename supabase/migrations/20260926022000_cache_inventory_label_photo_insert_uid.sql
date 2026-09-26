-- CentralHub live performance fix: cache the request's auth.uid() in an InitPlan.
-- Preserve the existing insert policy: own-created rows or NULL created_by.
-- Do not change the staff restrictive policies or storage access rules.
ALTER POLICY inventory_audit_label_photos_authenticated_insert
ON public.inventory_audit_label_photos
WITH CHECK ((created_by = (SELECT auth.uid())) OR (created_by IS NULL));

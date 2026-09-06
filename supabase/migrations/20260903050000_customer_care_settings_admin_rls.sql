-- Allow authenticated CentralHub admins to manage store-scoped customer-care settings.
-- The table remains protected by RLS; service-role/edge-function access is unchanged.
ALTER TABLE public.customer_care_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customer care settings admin access" ON public.customer_care_settings;

CREATE POLICY "Customer care settings admin access"
ON public.customer_care_settings
FOR ALL
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

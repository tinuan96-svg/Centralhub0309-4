-- Prevent public.product_expiry_product_summary from bypassing caller RLS.
-- Admins retain underlying product/product_expiry privileges and policies.
-- Staff identities inherit product_expiry's strict deny-by-default rule.
alter view public.product_expiry_product_summary set (security_invoker=true);

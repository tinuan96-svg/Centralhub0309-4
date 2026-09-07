-- Feature health is read by the authenticated admin dashboard; make it honor
-- the caller's RLS policies instead of the view owner's privileges.
alter view public.centralhub_feature_health set (security_invoker = true);

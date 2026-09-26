-- These two SECURITY DEFINER functions intentionally expose only public storefront/tracking data.
-- Limit execution to the roles that actually need them instead of PUBLIC.
REVOKE ALL ON FUNCTION public.analytics_get_public_tracking_config(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.analytics_get_public_tracking_config(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_get_public_tracking_config(text) TO anon;

REVOKE ALL ON FUNCTION public.tasty_kerala_published_feed(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tasty_kerala_published_feed(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tasty_kerala_published_feed(uuid, integer) TO anon;

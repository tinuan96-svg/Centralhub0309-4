-- Analytics-only configuration. The GA4 measurement ID is a public Google tag identifier, not a secret.
ALTER TABLE public.analytics_store_tracking_configs ADD COLUMN IF NOT EXISTS ga4_measurement_id text;
CREATE OR REPLACE FUNCTION public.analytics_get_public_tracking_config(p_tracking_id text)
RETURNS TABLE(ga4_measurement_id text, enabled boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
SELECT c.ga4_measurement_id,c.enabled FROM public.analytics_store_tracking_configs c WHERE c.public_tracking_id=p_tracking_id AND c.enabled=true LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.analytics_get_public_tracking_config(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_get_public_tracking_config(text) TO anon,authenticated;
-- Analytics-only reporting function. Active means seen within the last 5 minutes.
CREATE OR REPLACE FUNCTION public.analytics_get_active_visitors(p_store_id uuid DEFAULT NULL)
RETURNS TABLE(store_id uuid,session_key text,anonymous_id text,source text,medium text,campaign text,current_page text,current_page_title text,current_product_id uuid,current_product text,last_seen_at timestamptz,seconds_since_seen integer)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
WITH active AS (
  SELECT s.id AS analytics_session_id,s.store_id,s.session_key,s.anonymous_id,s.source,s.medium,s.campaign,s.last_seen_at,greatest(0,extract(epoch from(now()-s.last_seen_at)))::integer AS seconds_since_seen
  FROM public.analytics_sessions s
  WHERE (p_store_id IS NULL OR s.store_id=p_store_id) AND s.last_seen_at >= now()-interval '5 minutes'
), latest_event AS (
  SELECT DISTINCT ON (e.session_id) e.session_id,e.page_url,e.page_title,e.product_id,e.product_name
  FROM public.analytics_events e JOIN active a ON a.analytics_session_id=e.session_id
  WHERE e.occurred_at >= now()-interval '10 minutes'
  ORDER BY e.session_id,e.occurred_at DESC
)
SELECT a.store_id,a.session_key,a.anonymous_id,a.source,a.medium,a.campaign,le.page_url,le.page_title,le.product_id,le.product_name,a.last_seen_at,a.seconds_since_seen
FROM active a LEFT JOIN latest_event le ON le.session_id=a.analytics_session_id
ORDER BY a.last_seen_at DESC;
$$;
REVOKE ALL ON FUNCTION public.analytics_get_active_visitors(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_get_active_visitors(uuid) TO authenticated;
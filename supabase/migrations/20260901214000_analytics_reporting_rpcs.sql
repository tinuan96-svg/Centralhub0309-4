-- Analytics-only reporting functions. No operational tables are modified.
CREATE OR REPLACE FUNCTION public.analytics_get_channel_performance(p_store_id uuid DEFAULT NULL,p_start timestamptz DEFAULT now()-interval '30 days',p_end timestamptz DEFAULT now())
RETURNS TABLE(source text,medium text,campaign text,users bigint,sessions bigint,page_views bigint,product_views bigint,add_to_carts bigint,checkouts bigint,purchases bigint,revenue numeric)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
SELECT COALESCE(NULLIF(e.source,''),'(direct)'),COALESCE(NULLIF(e.medium,''),'(none)'),COALESCE(NULLIF(e.campaign,''),'(not set)'),count(DISTINCT COALESCE(e.anonymous_id,e.session_id::text)),count(DISTINCT e.session_id),count(*) FILTER(WHERE e.event_name='page_view'),count(*) FILTER(WHERE e.event_name IN('view_item','product_view')),count(*) FILTER(WHERE e.event_name='add_to_cart'),count(DISTINCT e.session_id) FILTER(WHERE e.event_name='begin_checkout'),count(*) FILTER(WHERE e.event_name='purchase'),COALESCE(sum(e.product_value) FILTER(WHERE e.event_name='purchase'),0)
FROM public.analytics_events e WHERE (p_store_id IS NULL OR e.store_id=p_store_id) AND e.occurred_at>=p_start AND e.occurred_at<p_end GROUP BY 1,2,3 ORDER BY 11 DESC,10 DESC,4 DESC;
$$;
REVOKE ALL ON FUNCTION public.analytics_get_channel_performance(uuid,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_get_channel_performance(uuid,timestamptz,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.analytics_get_product_performance(p_store_id uuid DEFAULT NULL,p_start timestamptz DEFAULT now()-interval '30 days',p_end timestamptz DEFAULT now())
RETURNS TABLE(product_id uuid,product_name text,views bigint,add_to_carts bigint,purchases bigint,revenue numeric)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
SELECT e.product_id,COALESCE(NULLIF(e.product_name,''),'(unknown)'),count(*) FILTER(WHERE e.event_name IN('view_item','product_view')),count(*) FILTER(WHERE e.event_name='add_to_cart'),count(*) FILTER(WHERE e.event_name='purchase'),COALESCE(sum(e.product_value) FILTER(WHERE e.event_name='purchase'),0)
FROM public.analytics_events e WHERE (p_store_id IS NULL OR e.store_id=p_store_id) AND e.occurred_at>=p_start AND e.occurred_at<p_end AND e.event_name IN('view_item','product_view','add_to_cart','purchase') GROUP BY e.product_id,COALESCE(NULLIF(e.product_name,''),'(unknown)') ORDER BY 6 DESC,3 DESC;
$$;
REVOKE ALL ON FUNCTION public.analytics_get_product_performance(uuid,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_get_product_performance(uuid,timestamptz,timestamptz) TO authenticated;
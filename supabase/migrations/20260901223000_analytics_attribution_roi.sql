-- Analytics-only attribution/ROI reporting. No operational order, finance, inventory or checkout tables are modified.

CREATE OR REPLACE FUNCTION public.analytics_get_campaign_roi(
  p_store_id uuid,
  p_start timestamptz DEFAULT now() - interval '30 days',
  p_end timestamptz DEFAULT now()
)
RETURNS TABLE(
  campaign text,
  source text,
  medium text,
  visitors bigint,
  sessions bigint,
  product_views bigint,
  add_to_carts bigint,
  checkouts bigint,
  purchases bigint,
  revenue numeric,
  conversion_rate numeric,
  avg_order_value numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH e AS (
    SELECT
      session_id,
      COALESCE(NULLIF(utm_campaign,''), '(not set)') AS campaign,
      COALESCE(NULLIF(utm_source,''), CASE WHEN referrer IS NULL OR referrer='' THEN 'direct' ELSE 'referral' END) AS source,
      COALESCE(NULLIF(utm_medium,''), CASE WHEN referrer IS NULL OR referrer='' THEN 'none' ELSE 'referral' END) AS medium,
      event_type,
      order_id,
      metadata
    FROM public.marketing_events
    WHERE store_id = p_store_id AND "timestamp" >= p_start AND "timestamp" < p_end
  ), s AS (
    SELECT campaign, source, medium, session_id,
      bool_or(event_type='view_item') product_view,
      bool_or(event_type='add_to_cart') add_to_cart,
      bool_or(event_type='begin_checkout') checkout,
      bool_or(event_type='purchase') purchase,
      COALESCE(SUM(CASE WHEN event_type='purchase' THEN COALESCE((metadata->>'value')::numeric,0) ELSE 0 END),0) revenue
    FROM e GROUP BY campaign, source, medium, session_id
  )
  SELECT campaign, source, medium,
    COUNT(*)::bigint visitors,
    COUNT(*)::bigint sessions,
    COUNT(*) FILTER (WHERE product_view)::bigint product_views,
    COUNT(*) FILTER (WHERE add_to_cart)::bigint add_to_carts,
    COUNT(*) FILTER (WHERE checkout)::bigint checkouts,
    COUNT(*) FILTER (WHERE purchase)::bigint purchases,
    ROUND(SUM(revenue),2) revenue,
    ROUND(CASE WHEN COUNT(*)=0 THEN 0 ELSE COUNT(*) FILTER (WHERE purchase)::numeric/COUNT(*)*100 END,2) conversion_rate,
    ROUND(CASE WHEN COUNT(*) FILTER (WHERE purchase)=0 THEN 0 ELSE SUM(revenue)/COUNT(*) FILTER (WHERE purchase) END,2) avg_order_value
  FROM s
  GROUP BY campaign, source, medium
  ORDER BY revenue DESC, purchases DESC;
$$;

REVOKE ALL ON FUNCTION public.analytics_get_campaign_roi(uuid,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_get_campaign_roi(uuid,timestamptz,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.analytics_get_product_roi(
  p_store_id uuid,
  p_start timestamptz DEFAULT now() - interval '30 days',
  p_end timestamptz DEFAULT now()
)
RETURNS TABLE(
  product_id text,
  product_name text,
  views bigint,
  add_to_carts bigint,
  purchases bigint,
  revenue numeric,
  view_to_cart_rate numeric,
  cart_to_purchase_rate numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH e AS (
    SELECT metadata->>'item_id' product_id, COALESCE(metadata->>'item_name','(unknown)') product_name, event_type,
      COALESCE((metadata->>'value')::numeric,0) value
    FROM public.marketing_events
    WHERE store_id=p_store_id AND "timestamp">=p_start AND "timestamp"<p_end
      AND metadata->>'item_id' IS NOT NULL
  )
  SELECT product_id, product_name,
    COUNT(*) FILTER (WHERE event_type='view_item')::bigint views,
    COUNT(*) FILTER (WHERE event_type='add_to_cart')::bigint add_to_carts,
    COUNT(*) FILTER (WHERE event_type='purchase')::bigint purchases,
    ROUND(SUM(value) FILTER (WHERE event_type='purchase'),2) revenue,
    ROUND(CASE WHEN COUNT(*) FILTER (WHERE event_type='view_item')=0 THEN 0 ELSE COUNT(*) FILTER (WHERE event_type='add_to_cart')::numeric/COUNT(*) FILTER (WHERE event_type='view_item')*100 END,2) view_to_cart_rate,
    ROUND(CASE WHEN COUNT(*) FILTER (WHERE event_type='add_to_cart')=0 THEN 0 ELSE COUNT(*) FILTER (WHERE event_type='purchase')::numeric/COUNT(*) FILTER (WHERE event_type='add_to_cart')*100 END,2) cart_to_purchase_rate
  FROM e GROUP BY product_id, product_name ORDER BY revenue DESC, views DESC;
$$;

REVOKE ALL ON FUNCTION public.analytics_get_product_roi(uuid,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_get_product_roi(uuid,timestamptz,timestamptz) TO authenticated;

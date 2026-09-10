CREATE OR REPLACE FUNCTION public.get_pricing_engine_health(p_period_days integer DEFAULT 7)
RETURNS json
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  dashboard_data json;
  stats json;
BEGIN
  dashboard_data := public.get_pricing_dashboard(GREATEST(COALESCE(p_period_days, 7), 1));

  SELECT json_build_object(
    'active_products', COUNT(*),
    'ready', COUNT(*) FILTER (WHERE s.recommendation_status = 'ready'),
    'stale', COUNT(*) FILTER (WHERE s.recommendation_status = 'stale'),
    'blocked', COUNT(*) FILTER (
      WHERE COALESCE(s.execution_blocked, false)
         OR EXISTS (SELECT 1 FROM public.price_locks l WHERE l.product_id = s.product_id AND l.is_active = true)
         OR COALESCE(s.recommendation_status, 'stale') <> 'ready'
         OR p.price IS DISTINCT FROM s.current_price
    ),
    'passed', COUNT(*) FILTER (WHERE s.data_quality_status = 'passed'),
    'actionable', COUNT(*) FILTER (
      WHERE s.recommendation_status = 'ready'
        AND s.data_quality_status = 'passed'
        AND NOT COALESCE(s.execution_blocked, false)
        AND NOT EXISTS (SELECT 1 FROM public.price_locks l WHERE l.product_id = s.product_id AND l.is_active = true)
        AND p.price IS NOT DISTINCT FROM s.current_price
        AND COALESCE(s.approval_status, 'pending') IN ('pending','approved')
        AND COALESCE(s.execution_status, 'not_executed') <> 'executed'
    ),
    'actionable_potential_daily_profit', COALESCE(SUM(s.expected_daily_profit) FILTER (
      WHERE s.recommendation_status = 'ready'
        AND s.data_quality_status = 'passed'
        AND NOT COALESCE(s.execution_blocked, false)
        AND NOT EXISTS (SELECT 1 FROM public.price_locks l WHERE l.product_id = s.product_id AND l.is_active = true)
        AND p.price IS NOT DISTINCT FROM s.current_price
        AND COALESCE(s.approval_status, 'pending') IN ('pending','approved')
        AND COALESCE(s.execution_status, 'not_executed') <> 'executed'
    ), 0),
    'latest_generated_at', MAX(s.generated_at)
  ) INTO stats
  FROM public.pricing_suggestions s
  JOIN public.products p ON p.id = s.product_id
  WHERE p.is_active = true
    AND COALESCE(p.is_deleted, false) = false;

  RETURN json_build_object(
    'dashboard', dashboard_data,
    'active_products', (stats->>'active_products')::integer,
    'ready', (stats->>'ready')::integer,
    'stale', (stats->>'stale')::integer,
    'blocked', (stats->>'blocked')::integer,
    'passed', (stats->>'passed')::integer,
    'actionable', (stats->>'actionable')::integer,
    'actionable_potential_daily_profit', (stats->>'actionable_potential_daily_profit')::numeric,
    'latest_generated_at', stats->>'latest_generated_at'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_pricing_engine_health(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pricing_engine_health(integer) TO authenticated, service_role;

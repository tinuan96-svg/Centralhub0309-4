-- Pricing operational read-path + approval truth hardening.
-- Keeps recommendation generation scheduled/cached, while operational pages read the latest cached snapshot.

CREATE OR REPLACE FUNCTION public.get_pricing_control_rows(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS SETOF json
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH source AS (
    SELECT
      s.*,
      p.name AS product_name,
      p.sku,
      p.price AS catalog_current_price,
      EXISTS (
        SELECT 1
        FROM public.price_locks l
        WHERE l.product_id = s.product_id
          AND l.is_active = true
      ) AS live_price_locked,
      (p.price IS DISTINCT FROM s.current_price) AS price_changed_since_recommendation
    FROM public.pricing_suggestions s
    JOIN public.products p ON p.id = s.product_id
    WHERE p.is_active = true
      AND COALESCE(p.is_deleted, false) = false
  ), effective AS (
    SELECT
      source.*,
      (
        COALESCE(source.execution_blocked, false)
        OR source.live_price_locked
        OR COALESCE(source.recommendation_status, 'stale') <> 'ready'
        OR source.price_changed_since_recommendation
      ) AS effective_execution_blocked,
      (
        COALESCE(source.data_quality_reasons, '[]'::jsonb)
        || CASE WHEN source.live_price_locked AND NOT (COALESCE(source.data_quality_reasons, '[]'::jsonb) ? 'PRICE_LOCKED')
             THEN jsonb_build_array('PRICE_LOCKED') ELSE '[]'::jsonb END
        || CASE WHEN COALESCE(source.recommendation_status, 'stale') <> 'ready' AND NOT (COALESCE(source.data_quality_reasons, '[]'::jsonb) ? 'RECOMMENDATION_STALE')
             THEN jsonb_build_array('RECOMMENDATION_STALE') ELSE '[]'::jsonb END
        || CASE WHEN source.price_changed_since_recommendation AND NOT (COALESCE(source.data_quality_reasons, '[]'::jsonb) ? 'PRICE_CHANGED_SINCE_RECOMMENDATION')
             THEN jsonb_build_array('PRICE_CHANGED_SINCE_RECOMMENDATION') ELSE '[]'::jsonb END
      ) AS effective_data_quality_reasons
    FROM source
  )
  SELECT (
    to_jsonb(effective)
    || jsonb_build_object(
      'price_locked', effective.live_price_locked,
      'execution_blocked', effective.effective_execution_blocked,
      'data_quality_status', CASE WHEN effective.effective_execution_blocked THEN 'blocked' ELSE COALESCE(effective.data_quality_status, 'pending') END,
      'data_quality_reasons', effective.effective_data_quality_reasons,
      'market_analytics', jsonb_build_object(
        'lowest_competitor_price', effective.lowest_competitor_price,
        'median_competitor_price', effective.median_market_price,
        'highest_competitor_price', effective.highest_competitor_price,
        'valid_competitor_count', COALESCE(effective.in_stock_competitor_count, 0),
        'fresh_competitor_count', CASE WHEN effective.competitor_data_quality = 'FRESH' THEN COALESCE(effective.in_stock_competitor_count, 0) ELSE 0 END,
        'data_quality', effective.competitor_data_quality
      ),
      'recommendation_source', 'CACHED_SCHEDULED_PRICING_ENGINE'
    )
  )::json
  FROM effective
  ORDER BY effective.product_name
  OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 1000);
$function$;

DROP FUNCTION IF EXISTS public.get_pricing_approval_queue(integer);
CREATE FUNCTION public.get_pricing_approval_queue(p_limit integer DEFAULT 200)
RETURNS TABLE(
  product_id uuid,
  product_name text,
  current_price numeric,
  recommended_price numeric,
  expected_daily_profit numeric,
  expected_profit_per_unit numeric,
  expected_margin numeric,
  pricing_status text,
  approval_status text,
  execution_status text,
  price_locked boolean,
  decision_reason text,
  generated_at timestamptz,
  recommendation_status text,
  data_quality_status text,
  data_quality_reasons jsonb,
  execution_blocked boolean,
  cost_price numeric,
  profit_floor_price numeric,
  required_profit_price numeric,
  optimization_action text
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH source AS (
    SELECT
      s.*,
      p.name AS product_name,
      p.price AS catalog_current_price,
      EXISTS (
        SELECT 1
        FROM public.price_locks l
        WHERE l.product_id = s.product_id
          AND l.is_active = true
      ) AS live_price_locked,
      (p.price IS DISTINCT FROM s.current_price) AS price_changed_since_recommendation
    FROM public.pricing_suggestions s
    JOIN public.products p ON p.id = s.product_id
    WHERE p.is_active = true
      AND COALESCE(p.is_deleted, false) = false
  )
  SELECT
    source.product_id,
    source.product_name,
    source.current_price,
    source.recommended_price,
    source.expected_daily_profit,
    source.expected_profit_per_unit,
    source.expected_margin,
    source.pricing_status,
    source.approval_status,
    source.execution_status,
    source.live_price_locked AS price_locked,
    COALESCE(source.decision_reason, source.reason) AS decision_reason,
    source.generated_at,
    source.recommendation_status,
    CASE
      WHEN COALESCE(source.execution_blocked, false)
        OR source.live_price_locked
        OR COALESCE(source.recommendation_status, 'stale') <> 'ready'
        OR source.price_changed_since_recommendation
      THEN 'blocked'
      ELSE COALESCE(source.data_quality_status, 'pending')
    END AS data_quality_status,
    (
      COALESCE(source.data_quality_reasons, '[]'::jsonb)
      || CASE WHEN source.live_price_locked AND NOT (COALESCE(source.data_quality_reasons, '[]'::jsonb) ? 'PRICE_LOCKED')
           THEN jsonb_build_array('PRICE_LOCKED') ELSE '[]'::jsonb END
      || CASE WHEN COALESCE(source.recommendation_status, 'stale') <> 'ready' AND NOT (COALESCE(source.data_quality_reasons, '[]'::jsonb) ? 'RECOMMENDATION_STALE')
           THEN jsonb_build_array('RECOMMENDATION_STALE') ELSE '[]'::jsonb END
      || CASE WHEN source.price_changed_since_recommendation AND NOT (COALESCE(source.data_quality_reasons, '[]'::jsonb) ? 'PRICE_CHANGED_SINCE_RECOMMENDATION')
           THEN jsonb_build_array('PRICE_CHANGED_SINCE_RECOMMENDATION') ELSE '[]'::jsonb END
    ) AS data_quality_reasons,
    (
      COALESCE(source.execution_blocked, false)
      OR source.live_price_locked
      OR COALESCE(source.recommendation_status, 'stale') <> 'ready'
      OR source.price_changed_since_recommendation
    ) AS execution_blocked,
    source.cost_price,
    source.profit_floor_price,
    source.required_profit_price,
    source.optimization_action
  FROM source
  ORDER BY
    CASE
      WHEN source.approval_status = 'pending'
       AND NOT COALESCE(source.execution_blocked, false)
       AND NOT source.live_price_locked
       AND source.recommendation_status = 'ready'
       AND NOT source.price_changed_since_recommendation THEN 0
      WHEN source.approval_status = 'pending' THEN 1
      WHEN source.approval_status = 'approved' THEN 2
      WHEN source.execution_status = 'executed' THEN 3
      ELSE 4
    END,
    source.expected_daily_profit DESC NULLS LAST,
    source.generated_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
$function$;

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
    ),
    'actionable_potential_daily_profit', COALESCE(SUM(s.expected_daily_profit) FILTER (
      WHERE s.recommendation_status = 'ready'
        AND s.data_quality_status = 'passed'
        AND NOT COALESCE(s.execution_blocked, false)
        AND NOT EXISTS (SELECT 1 FROM public.price_locks l WHERE l.product_id = s.product_id AND l.is_active = true)
        AND p.price IS NOT DISTINCT FROM s.current_price
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

CREATE OR REPLACE FUNCTION public.check_pricing_data_quality(p_suggestion_id uuid)
RETURNS TABLE(suggestion_id uuid, data_quality_status text, data_quality_reasons jsonb, execution_blocked boolean)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  s record;
  reasons jsonb := '[]'::jsonb;
  blocked boolean := false;
  live_locked boolean := false;
BEGIN
  SELECT ps.*, p.cost_price AS product_cost, p.price AS catalog_current_price,
         p.is_active AS product_is_active, p.is_deleted, p.name AS product_name
  INTO s
  FROM public.pricing_suggestions ps
  JOIN public.products p ON p.id = ps.product_id
  WHERE ps.id = p_suggestion_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Pricing suggestion not found'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.price_locks l
    WHERE l.product_id = s.product_id AND l.is_active = true
  ) INTO live_locked;

  IF NOT COALESCE(s.product_is_active, false) THEN reasons := reasons || jsonb_build_array('PRODUCT_INACTIVE'); blocked := true; END IF;
  IF COALESCE(s.is_deleted, false) THEN reasons := reasons || jsonb_build_array('PRODUCT_DELETED'); blocked := true; END IF;
  IF s.product_cost IS NULL OR s.product_cost <= 0 THEN reasons := reasons || jsonb_build_array('MISSING_OR_INVALID_PRODUCT_COST'); blocked := true; END IF;
  IF s.recommended_price IS NULL OR s.recommended_price <= 0 THEN reasons := reasons || jsonb_build_array('INVALID_RECOMMENDED_PRICE'); blocked := true; END IF;
  IF live_locked THEN reasons := reasons || jsonb_build_array('PRICE_LOCKED'); blocked := true; END IF;
  IF COALESCE(s.recommendation_status, 'stale') <> 'ready' OR s.generated_at IS NULL OR s.generated_at < now() - interval '48 hours' THEN reasons := reasons || jsonb_build_array('RECOMMENDATION_STALE'); blocked := true; END IF;
  IF s.catalog_current_price IS DISTINCT FROM s.current_price THEN reasons := reasons || jsonb_build_array('PRICE_CHANGED_SINCE_RECOMMENDATION'); blocked := true; END IF;

  IF s.pricing_status = 'WAIT_FOR_DEMAND_DATA' OR s.optimization_action = 'WAIT_FOR_DATA' THEN
    reasons := reasons || jsonb_build_array('INSUFFICIENT_PAID_DEMAND_DATA');
    blocked := true;
  ELSIF COALESCE(s.financial_data_age_hours, 999999) > 72 OR COALESCE(s.financial_data_age_hours, -1) < 0 THEN
    reasons := reasons || jsonb_build_array('FINANCIAL_DATA_INVALID_OR_STALE');
    blocked := true;
  END IF;

  IF s.competitor_data_age_hours IS NOT NULL AND s.competitor_data_age_hours > 72 AND s.competitive_target_price IS NOT NULL THEN reasons := reasons || jsonb_build_array('COMPETITOR_DATA_STALE'); blocked := true; END IF;
  IF COALESCE(s.required_profit_price, 0) <= 0 AND COALESCE(s.target_profit_per_unit, 0) > 0 THEN reasons := reasons || jsonb_build_array('INVALID_PROFIT_TARGET'); blocked := true; END IF;
  IF COALESCE(s.recommended_price, 0) > 0 AND s.product_cost IS NOT NULL AND s.recommended_price < s.product_cost THEN reasons := reasons || jsonb_build_array('PRICE_BELOW_COST'); blocked := true; END IF;

  -- Deduplicate reasons while preserving a compact JSON array.
  SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb)
  INTO reasons
  FROM (SELECT DISTINCT value FROM jsonb_array_elements_text(reasons) AS t(value)) deduped;

  IF jsonb_array_length(reasons) = 0 THEN
    UPDATE public.pricing_suggestions
    SET data_quality_status = 'passed', data_quality_reasons = '[]'::jsonb,
        data_quality_checked_at = now(), execution_blocked = false,
        price_locked = live_locked
    WHERE id = p_suggestion_id;
  ELSE
    UPDATE public.pricing_suggestions
    SET data_quality_status = 'blocked', data_quality_reasons = reasons,
        data_quality_checked_at = now(), execution_blocked = true,
        requires_approval = true, price_locked = live_locked
    WHERE id = p_suggestion_id;
  END IF;

  RETURN QUERY SELECT p_suggestion_id, CASE WHEN blocked THEN 'blocked' ELSE 'passed' END, reasons, blocked;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_pricing_recommendation(
  p_product_id uuid,
  p_new_price numeric,
  p_manually_approved boolean DEFAULT false,
  p_initiated_by text DEFAULT NULL::text,
  p_reason text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  old numeric;
  rec json;
  floor numeric;
  latest_suggestion_id uuid;
  quality record;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin authorization required'; END IF;
  IF NOT COALESCE(p_manually_approved, false) THEN
    RETURN json_build_object('success', false, 'error', 'Explicit manual approval is required before a price can change');
  END IF;

  SELECT price INTO old
  FROM public.products
  WHERE id = p_product_id AND is_active = true AND COALESCE(is_deleted, false) = false
  FOR UPDATE;
  IF old IS NULL THEN RETURN json_build_object('success', false, 'error', 'Active product not found'); END IF;
  IF p_new_price IS NULL OR p_new_price <= 0 THEN RETURN json_build_object('success', false, 'error', 'New price must be greater than zero'); END IF;

  SELECT id INTO latest_suggestion_id
  FROM public.pricing_suggestions
  WHERE product_id = p_product_id
  ORDER BY generated_at DESC NULLS LAST
  LIMIT 1;
  IF latest_suggestion_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'No pricing recommendation found'); END IF;

  SELECT * INTO quality FROM public.check_pricing_data_quality(latest_suggestion_id);
  IF quality.execution_blocked THEN
    RETURN json_build_object('success', false, 'error', 'DATA_QUALITY_BLOCKED', 'reasons', quality.data_quality_reasons);
  END IF;

  SELECT public.calculate_pricing_recommendation(p_product_id) INTO rec;
  floor := NULLIF(rec->>'profit_floor_price', '')::numeric;
  IF floor IS NOT NULL AND p_new_price < floor THEN
    RETURN json_build_object('success', false, 'error', 'Price is below the direct economic floor and cannot be applied from Pricing Control', 'profit_floor_price', floor);
  END IF;

  UPDATE public.products
  SET price = ROUND(p_new_price, 2), updated_at = now()
  WHERE id = p_product_id;

  INSERT INTO public.price_change_audit(
    product_id, old_price, new_price, competitive_target, required_profit_price, final_price,
    lowest_competitor, average_competitor, target_profit, allocated_overhead, product_cost,
    strategy, decision_reason, initiated_by, manually_approved, automatically_applied
  ) VALUES (
    p_product_id, old, ROUND(p_new_price, 2), (rec->>'competitive_target_price')::numeric,
    (rec->>'required_profit_price')::numeric, ROUND(p_new_price, 2),
    (rec->'market_analytics'->>'lowest_competitor_price')::numeric,
    (rec->'market_analytics'->>'average_competitor_price')::numeric,
    (rec->>'target_daily_profit')::numeric, 0, (rec->>'cost_price')::numeric,
    (rec->>'strategy'), COALESCE(p_reason, rec->>'decision_reason'), p_initiated_by, true, false
  );

  INSERT INTO public.pricing_recommendation_history(
    product_id, current_price, recommended_price, profit_floor_price, required_profit_price,
    competitive_target_price, lowest_competitor, median_competitor, average_competitor,
    expected_daily_units, target_profit_per_unit, expected_profit_per_unit, expected_daily_profit,
    expected_margin, market_position, pricing_strategy, competitor_data_quality, decision_reason,
    status, applied_at, applied_by
  ) VALUES (
    p_product_id, old, ROUND(p_new_price, 2), (rec->>'profit_floor_price')::numeric,
    (rec->>'required_profit_price')::numeric, (rec->>'competitive_target_price')::numeric,
    (rec->'market_analytics'->>'lowest_competitor_price')::numeric,
    (rec->'market_analytics'->>'median_competitor_price')::numeric,
    (rec->'market_analytics'->>'average_competitor_price')::numeric,
    (rec->>'expected_daily_units')::numeric, (rec->>'target_profit_per_unit')::numeric,
    (ROUND(p_new_price, 2) - ((rec->>'cost_price')::numeric + COALESCE((rec->>'variable_cost')::numeric, 0))),
    CASE WHEN (rec->>'expected_daily_units')::numeric > 0 THEN
      (ROUND(p_new_price, 2) - ((rec->>'cost_price')::numeric + COALESCE((rec->>'variable_cost')::numeric, 0))) * (rec->>'expected_daily_units')::numeric
    ELSE 0 END,
    CASE WHEN ROUND(p_new_price, 2) > 0 THEN
      (ROUND(p_new_price, 2) - ((rec->>'cost_price')::numeric + COALESCE((rec->>'variable_cost')::numeric, 0))) / ROUND(p_new_price, 2) * 100
    ELSE 0 END,
    (rec->>'market_position'), (rec->>'strategy'), (rec->>'competitor_data_quality'),
    COALESCE(p_reason, rec->>'decision_reason'), 'applied', now(), p_initiated_by
  );

  RETURN json_build_object(
    'success', true,
    'old_price', old,
    'new_price', ROUND(p_new_price, 2),
    'recommendation', rec,
    'manual_action', true
  );
END;
$function$;

-- Read RPCs are authenticated operational surfaces; mutation remains admin-gated inside the function.
REVOKE EXECUTE ON FUNCTION public.get_pricing_control_rows(integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_pricing_approval_queue(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_pricing_engine_health(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_pricing_data_quality(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_pricing_recommendation(uuid, numeric, boolean, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_pricing_control_rows(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pricing_approval_queue(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pricing_engine_health(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_pricing_data_quality(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_pricing_recommendation(uuid, numeric, boolean, text, text) TO authenticated, service_role;

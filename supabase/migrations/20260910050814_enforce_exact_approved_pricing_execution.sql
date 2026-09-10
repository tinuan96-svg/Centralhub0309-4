-- A price write must match the latest approved recommendation exactly.
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
  latest_suggestion record;
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

  SELECT * INTO latest_suggestion
  FROM public.pricing_suggestions
  WHERE product_id = p_product_id
  ORDER BY generated_at DESC NULLS LAST
  LIMIT 1;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'No pricing recommendation found'); END IF;
  IF latest_suggestion.approval_status <> 'approved' THEN
    RETURN json_build_object('success', false, 'error', 'Recommendation must be approved in Pricing Approval Centre before execution');
  END IF;
  IF ROUND(p_new_price, 2) IS DISTINCT FROM ROUND(latest_suggestion.recommended_price, 2) THEN
    RETURN json_build_object('success', false, 'error', 'Requested price does not match the approved recommendation', 'approved_price', ROUND(latest_suggestion.recommended_price, 2));
  END IF;

  SELECT * INTO quality FROM public.check_pricing_data_quality(latest_suggestion.id);
  IF quality.execution_blocked THEN
    RETURN json_build_object('success', false, 'error', 'DATA_QUALITY_BLOCKED', 'reasons', quality.data_quality_reasons);
  END IF;

  SELECT public.calculate_pricing_recommendation(p_product_id) INTO rec;
  floor := NULLIF(rec->>'profit_floor_price', '')::numeric;
  IF floor IS NOT NULL AND p_new_price < floor THEN
    RETURN json_build_object('success', false, 'error', 'Price is below the direct economic floor and cannot be applied from Pricing Control', 'profit_floor_price', floor);
  END IF;

  UPDATE public.products SET price = ROUND(p_new_price, 2), updated_at = now() WHERE id = p_product_id;

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

  RETURN json_build_object('success', true, 'old_price', old, 'new_price', ROUND(p_new_price, 2), 'recommendation', rec, 'manual_action', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_pricing_recommendation(uuid, numeric, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_pricing_recommendation(uuid, numeric, boolean, text, text) TO authenticated, service_role;

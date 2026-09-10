-- Treat optimizer COLLECT_MORE_DATA exactly like WAIT_FOR_DATA for operational block messaging.
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

  IF s.pricing_status = 'WAIT_FOR_DEMAND_DATA' OR s.optimization_action IN ('WAIT_FOR_DATA', 'COLLECT_MORE_DATA') THEN
    reasons := reasons || jsonb_build_array('INSUFFICIENT_PAID_DEMAND_DATA');
    blocked := true;
  ELSIF COALESCE(s.financial_data_age_hours, 999999) > 72 OR COALESCE(s.financial_data_age_hours, -1) < 0 THEN
    reasons := reasons || jsonb_build_array('FINANCIAL_DATA_INVALID_OR_STALE');
    blocked := true;
  END IF;

  IF s.competitor_data_age_hours IS NOT NULL AND s.competitor_data_age_hours > 72 AND s.competitive_target_price IS NOT NULL THEN reasons := reasons || jsonb_build_array('COMPETITOR_DATA_STALE'); blocked := true; END IF;
  IF COALESCE(s.required_profit_price, 0) <= 0 AND COALESCE(s.target_profit_per_unit, 0) > 0 THEN reasons := reasons || jsonb_build_array('INVALID_PROFIT_TARGET'); blocked := true; END IF;
  IF COALESCE(s.recommended_price, 0) > 0 AND s.product_cost IS NOT NULL AND s.recommended_price < s.product_cost THEN reasons := reasons || jsonb_build_array('PRICE_BELOW_COST'); blocked := true; END IF;

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

REVOKE EXECUTE ON FUNCTION public.check_pricing_data_quality(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_pricing_data_quality(uuid) TO authenticated, service_role;

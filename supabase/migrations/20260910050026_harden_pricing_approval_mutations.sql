-- Enforce CentralHub administrator authorization on pricing approval-state mutations.

CREATE OR REPLACE FUNCTION public.validate_pricing_execution_for_product(p_product_id uuid)
RETURNS TABLE(can_execute boolean, reason text, data_quality_status text)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  sid uuid;
  q record;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin authorization required'; END IF;
  SELECT id INTO sid
  FROM public.pricing_suggestions
  WHERE product_id = p_product_id
  ORDER BY generated_at DESC NULLS LAST
  LIMIT 1;
  IF sid IS NULL THEN RETURN QUERY SELECT false, 'NO_PRICING_RECOMMENDATION', 'blocked'; RETURN; END IF;
  SELECT * INTO q FROM public.check_pricing_data_quality(sid);
  RETURN QUERY SELECT NOT q.execution_blocked, CASE WHEN q.execution_blocked THEN 'DATA_QUALITY_BLOCKED' ELSE 'READY' END, q.data_quality_status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_pricing_recommendation(p_product_id uuid, p_approved_by text DEFAULT 'admin'::text)
RETURNS json
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  s record;
  q record;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin authorization required'; END IF;
  SELECT * INTO s
  FROM public.pricing_suggestions
  WHERE product_id = p_product_id
  ORDER BY generated_at DESC NULLS LAST
  LIMIT 1;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'No pricing recommendation found'); END IF;

  SELECT * INTO q FROM public.check_pricing_data_quality(s.id);
  IF q.execution_blocked THEN
    RETURN json_build_object('success', false, 'error', 'DATA_QUALITY_BLOCKED', 'data_quality_status', q.data_quality_status, 'reasons', q.data_quality_reasons);
  END IF;

  UPDATE public.pricing_suggestions
  SET approval_status = 'approved', approved_at = now(), approved_by = p_approved_by,
      rejected_at = NULL, rejected_by = NULL, rejection_reason = NULL,
      execution_status = 'not_executed', execution_error = NULL
  WHERE id = s.id;

  RETURN json_build_object('success', true, 'suggestion_id', s.id, 'product_id', p_product_id, 'recommended_price', s.recommended_price, 'approval_status', 'approved');
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_pricing_recommendation(p_product_id uuid, p_reason text, p_rejected_by text DEFAULT 'admin'::text)
RETURNS json
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE sid uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin authorization required'; END IF;
  SELECT id INTO sid
  FROM public.pricing_suggestions
  WHERE product_id = p_product_id
  ORDER BY generated_at DESC NULLS LAST
  LIMIT 1;
  IF sid IS NULL THEN RETURN json_build_object('success', false, 'error', 'No pricing recommendation found'); END IF;

  UPDATE public.pricing_suggestions
  SET approval_status = 'rejected', rejected_at = now(), rejected_by = p_rejected_by,
      rejection_reason = COALESCE(NULLIF(trim(p_reason), ''), 'Rejected by administrator'),
      execution_status = 'not_executed'
  WHERE id = sid;

  RETURN json_build_object('success', true, 'suggestion_id', sid, 'product_id', p_product_id, 'approval_status', 'rejected');
END;
$function$;

CREATE OR REPLACE FUNCTION public.execute_approved_pricing_recommendation(p_product_id uuid, p_executed_by text DEFAULT 'pricing-control-centre'::text)
RETURNS json
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  s record;
  result json;
  q record;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin authorization required'; END IF;
  SELECT * INTO s
  FROM public.pricing_suggestions
  WHERE product_id = p_product_id
  ORDER BY generated_at DESC NULLS LAST
  LIMIT 1;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'No pricing recommendation found'); END IF;
  IF s.approval_status <> 'approved' THEN RETURN json_build_object('success', false, 'error', 'Recommendation must be approved before execution'); END IF;

  SELECT * INTO q FROM public.check_pricing_data_quality(s.id);
  IF q.execution_blocked THEN
    RETURN json_build_object('success', false, 'error', 'DATA_QUALITY_BLOCKED', 'data_quality_status', q.data_quality_status, 'reasons', q.data_quality_reasons);
  END IF;

  UPDATE public.pricing_suggestions
  SET execution_status = 'executing', execution_attempted_at = now(), execution_error = NULL
  WHERE id = s.id;

  BEGIN
    SELECT public.apply_pricing_recommendation(
      p_product_id, s.recommended_price, true, p_executed_by,
      COALESCE(s.decision_reason, s.reason, 'Approved pricing recommendation')
    ) INTO result;

    IF COALESCE((result->>'success')::boolean, false) THEN
      UPDATE public.pricing_suggestions
      SET execution_status = 'executed', approval_status = 'executed', applied_at = now(), applied_by = p_executed_by
      WHERE id = s.id;
      RETURN result || json_build_object('approval_status', 'executed');
    END IF;

    UPDATE public.pricing_suggestions
    SET execution_status = 'failed', execution_error = COALESCE(result->>'error', 'Price application failed')
    WHERE id = s.id;
    RETURN result || json_build_object('approval_status', 'approved');
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pricing_suggestions
    SET execution_status = 'failed', execution_error = SQLERRM
    WHERE id = s.id;
    RETURN json_build_object('success', false, 'error', SQLERRM, 'approval_status', 'approved');
  END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.validate_pricing_execution_for_product(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_pricing_recommendation(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_pricing_recommendation(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.execute_approved_pricing_recommendation(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.validate_pricing_execution_for_product(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_pricing_recommendation(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_pricing_recommendation(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_approved_pricing_recommendation(uuid, text) TO authenticated, service_role;

-- Fail closed when the pricing engine lacks the minimum evidence needed for a safe recommendation.
-- This guard is deliberately database-side so stale UI/service code cannot publish or execute
-- a recommendation that was generated without product cost or sales-demand evidence.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_pricing_suggestion_missing_data()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_reason text;
BEGIN
  v_reason := COALESCE(NEW.decision_reason, NEW.reason, '');

  IF COALESCE(NEW.cost_price, 0) <= 0
     OR v_reason IN ('MISSING_COST', 'MISSING_SALES_FORECAST') THEN
    NEW.recommendation_status := 'stale';
    NEW.execution_blocked := true;
    NEW.requires_approval := true;
    NEW.data_quality_status := 'blocked';

    NEW.data_quality_reasons := COALESCE(NEW.data_quality_reasons, '[]'::jsonb)
      || CASE
           WHEN COALESCE(NEW.cost_price, 0) <= 0
             THEN jsonb_build_array('MISSING_OR_INVALID_PRODUCT_COST')
           ELSE jsonb_build_array('MISSING_SALES_FORECAST')
         END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_guard_pricing_missing_data ON public.pricing_suggestions;
CREATE TRIGGER zz_guard_pricing_missing_data
BEFORE INSERT OR UPDATE OF recommendation_status, decision_reason, reason, cost_price, execution_blocked
ON public.pricing_suggestions
FOR EACH ROW
EXECUTE FUNCTION public.guard_pricing_suggestion_missing_data();

-- Harden any pre-existing rows that were generated before this guard existed.
UPDATE public.pricing_suggestions
SET recommendation_status = 'stale',
    execution_blocked = true,
    requires_approval = true,
    data_quality_status = 'blocked',
    data_quality_reasons = COALESCE(data_quality_reasons, '[]'::jsonb)
      || CASE
           WHEN COALESCE(cost_price, 0) <= 0
             THEN jsonb_build_array('MISSING_OR_INVALID_PRODUCT_COST')
           ELSE jsonb_build_array('MISSING_SALES_FORECAST')
         END
WHERE COALESCE(cost_price, 0) <= 0
   OR COALESCE(decision_reason, reason, '') IN ('MISSING_COST', 'MISSING_SALES_FORECAST');

COMMIT;

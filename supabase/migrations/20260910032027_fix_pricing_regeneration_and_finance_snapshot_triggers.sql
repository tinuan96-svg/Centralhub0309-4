-- Keep regenerated suggestion safety metadata valid and keep operating overhead
-- outside item-level economic cost snapshots.

CREATE OR REPLACE FUNCTION public.reset_pricing_suggestion_safety_on_regeneration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public','extensions','pg_temp'
AS $function$
BEGIN
  IF NEW.generated_at IS DISTINCT FROM OLD.generated_at
     AND NEW.generated_at > COALESCE(OLD.generated_at,'-infinity'::timestamptz)
     AND NEW.recommendation_status IN ('ready','review_required') THEN
    NEW.execution_blocked:=false;
    NEW.data_quality_status:='pending';
    NEW.data_quality_reasons:='[]'::jsonb;
    NEW.data_quality_checked_at:=NULL;
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.populate_pricing_finance_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  f record; pf record; ps record; strat json;
  v_days integer; v_gap numeric; v_var numeric; v_direct_cost numeric;
  v_contribution_unit numeric; v_margin numeric; v_units_day numeric;
BEGIN
  SELECT * INTO ps FROM public.pricing_settings WHERE store_id IS NULL ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  v_days:=GREATEST(COALESCE(ps.financial_lookback_days,30),7);
  SELECT * INTO f FROM public.get_pricing_financial_context(NULL,v_days);
  SELECT * INTO pf FROM public.get_product_pricing_financial_context(NEW.product_id,NULL,v_days);
  strat:=public.calculate_weekly_pricing_strategy(current_date,7);

  v_gap:=COALESCE((strat->>'profit_gap_required')::numeric,0);
  v_var:=CASE WHEN COALESCE(pf.units_sold,0)>0 THEN COALESCE(pf.variable_costs,0)/pf.units_sold ELSE 0 END;
  v_direct_cost:=COALESCE(NEW.cost_price,0)+v_var;
  v_units_day:=COALESCE(pf.expected_daily_units,0);
  v_contribution_unit:=COALESCE(NEW.suggested_price,0)-v_direct_cost;
  v_margin:=CASE WHEN COALESCE(NEW.suggested_price,0)>0 THEN v_contribution_unit/NEW.suggested_price*100 ELSE 0 END;

  NEW.financial_data_as_of:=COALESCE(pf.financial_data_as_of,f.financial_data_as_of);
  NEW.current_daily_net_profit:=COALESCE((strat->>'current_average_profit_per_day')::numeric,COALESCE(f.daily_net_profit,0));
  NEW.daily_profit_gap:=v_gap;
  NEW.required_incremental_profit_per_unit:=COALESCE((strat->>'required_profit_per_unit')::numeric,0);
  NEW.financial_cost_per_unit:=v_direct_cost;
  NEW.expected_contribution_profit:=v_contribution_unit*v_units_day;
  NEW.expected_contribution_margin:=v_margin;
  NEW.expected_margin:=v_margin;
  NEW.allocated_overhead:=0;
  RETURN NEW;
END
$function$;

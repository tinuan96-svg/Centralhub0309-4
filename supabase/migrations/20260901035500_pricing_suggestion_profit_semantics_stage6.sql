-- Stage 6: pricing suggestion profit fields are contribution-profit semantics, not price-minus-COGS only.
CREATE OR REPLACE FUNCTION public.populate_pricing_finance_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f record; pf record; ps record; v_days integer; v_target numeric; v_gap numeric; v_fin_cost numeric; v_var numeric; v_expected numeric; v_margin numeric; v_contribution numeric;
BEGIN
  SELECT * INTO ps FROM public.pricing_settings WHERE store_id IS NULL ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  v_days:=GREATEST(COALESCE(ps.financial_lookback_days,30),1); v_target:=COALESCE(ps.daily_target_net_profit,100);
  SELECT * INTO f FROM public.get_pricing_financial_context(NULL,v_days); SELECT * INTO pf FROM public.get_product_pricing_financial_context(NEW.product_id,NULL,v_days);
  v_gap:=GREATEST(v_target-COALESCE(f.daily_net_profit,0),0); v_expected:=COALESCE(f.units_sold,0)/GREATEST(f.period_days,1);
  v_var:=CASE WHEN COALESCE(pf.units_sold,0)>0 THEN COALESCE(pf.variable_costs,0)/pf.units_sold ELSE 0 END;
  v_fin_cost:=v_var+CASE WHEN v_expected>0 THEN COALESCE(f.daily_operating_expenses,0)/v_expected ELSE 0 END;
  v_contribution:=COALESCE(NEW.suggested_price,0)-COALESCE(NEW.cost_price,0)-v_var;
  v_margin:=CASE WHEN COALESCE(NEW.suggested_price,0)>0 THEN v_contribution/NEW.suggested_price*100 ELSE 0 END;
  NEW.financial_data_as_of:=f.financial_data_as_of; NEW.current_daily_net_profit:=COALESCE(f.daily_net_profit,0); NEW.daily_profit_gap:=v_gap;
  NEW.required_incremental_profit_per_unit:=CASE WHEN v_expected>0 THEN v_gap/v_expected ELSE NULL END; NEW.financial_cost_per_unit:=v_fin_cost;
  NEW.expected_contribution_profit:=v_contribution; NEW.expected_contribution_margin:=v_margin; NEW.expected_profit:=v_contribution; NEW.expected_margin:=v_margin;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_pricing_suggestions_finance_snapshot ON public.pricing_suggestions;
CREATE TRIGGER trg_pricing_suggestions_finance_snapshot BEFORE INSERT OR UPDATE OF suggested_price,cost_price,product_id ON public.pricing_suggestions FOR EACH ROW EXECUTE FUNCTION public.populate_pricing_finance_snapshot();
NOTIFY pgrst,'reload schema';

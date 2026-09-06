-- Stage 6 safety: enforce configured pricing movement caps while preserving minimum-margin safety.
-- CentralHub pricing remains global; no store-specific pricing overload is used.

CREATE OR REPLACE FUNCTION public.calculate_required_profit_price(
  p_product_id uuid,
  p_daily_target numeric DEFAULT 100.00,
  p_sales_window_days integer DEFAULT 30,
  p_undercut_amount numeric DEFAULT 0.10
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_cost numeric; v_current_price numeric; v_min_margin numeric; v_product_name text;
  v_market json; v_lowest_competitor numeric; v_competitive_target numeric; v_final_price numeric; v_raw_final_price numeric; v_decision_reason text;
  v_finance record; v_product_finance record; v_total_daily_units numeric; v_expected_daily_units numeric; v_daily_operating_expenses numeric; v_daily_net_profit numeric; v_daily_profit_gap numeric;
  v_required_incremental_profit_per_unit numeric; v_product_variable_cost_per_unit numeric; v_allocated_operating_cost_per_unit numeric; v_financial_cost_per_unit numeric; v_required_profit_price numeric; v_margin_floor_price numeric; v_has_sales boolean;
  v_finance_days integer; v_use_actual boolean := true; v_freshness_hours integer := 48; v_max_inc numeric := 20; v_max_dec numeric := 20; v_upper_price numeric; v_lower_price numeric;
BEGIN
  SELECT price,cost_price,min_margin,name INTO v_current_price,v_cost,v_min_margin,v_product_name FROM public.products WHERE id=p_product_id AND COALESCE(is_deleted,false)=false AND COALESCE(is_active,true)=true;
  IF NOT FOUND THEN RETURN json_build_object('error','Product not found or inactive'); END IF;
  v_cost:=COALESCE(v_cost,0); v_current_price:=COALESCE(v_current_price,0); v_finance_days:=GREATEST(COALESCE(p_sales_window_days,30),1);
  SELECT COALESCE(ps.use_actual_financial_costs,true),GREATEST(COALESCE(ps.financial_lookback_days,v_finance_days),1),GREATEST(COALESCE(ps.competitor_freshness_window_hours,48),1),GREATEST(COALESCE(ps.max_price_increase_percent,20),0),GREATEST(COALESCE(ps.max_price_decrease_percent,20),0)
  INTO v_use_actual,v_finance_days,v_freshness_hours,v_max_inc,v_max_dec FROM public.pricing_settings ps WHERE ps.store_id IS NULL ORDER BY ps.updated_at DESC NULLS LAST LIMIT 1;
  v_use_actual:=COALESCE(v_use_actual,true); v_finance_days:=COALESCE(v_finance_days,GREATEST(COALESCE(p_sales_window_days,30),1)); v_freshness_hours:=COALESCE(v_freshness_hours,48); v_max_inc:=COALESCE(v_max_inc,20); v_max_dec:=COALESCE(v_max_dec,20);
  SELECT * INTO v_finance FROM public.get_pricing_financial_context(NULL,v_finance_days); SELECT * INTO v_product_finance FROM public.get_product_pricing_financial_context(p_product_id,NULL,v_finance_days);
  v_daily_net_profit:=COALESCE(v_finance.daily_net_profit,0); v_daily_operating_expenses:=COALESCE(v_finance.daily_operating_expenses,0); v_total_daily_units:=COALESCE(v_finance.units_sold,0)/GREATEST(v_finance.period_days,1); v_expected_daily_units:=COALESCE(v_product_finance.expected_daily_units,0);
  v_product_variable_cost_per_unit:=CASE WHEN COALESCE(v_product_finance.units_sold,0)>0 THEN COALESCE(v_product_finance.variable_costs,0)/v_product_finance.units_sold ELSE 0 END;
  IF v_total_daily_units<=0 THEN SELECT COALESCE(SUM(oi.quantity),0)/v_finance_days INTO v_total_daily_units FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id WHERE o.payment_status='paid' AND COALESCE(o.is_deleted,false)=false AND COALESCE(o.order_status,'') NOT IN ('cancelled','refunded','failed') AND o.created_at>=now()-(v_finance_days||' days')::interval; END IF;
  v_total_daily_units:=GREATEST(COALESCE(v_total_daily_units,0),0); v_has_sales:=v_total_daily_units>0; v_daily_profit_gap:=GREATEST(COALESCE(p_daily_target,0)-v_daily_net_profit,0); v_required_incremental_profit_per_unit:=CASE WHEN v_total_daily_units>0 THEN v_daily_profit_gap/v_total_daily_units ELSE NULL END; v_allocated_operating_cost_per_unit:=CASE WHEN v_total_daily_units>0 THEN v_daily_operating_expenses/v_total_daily_units ELSE 0 END; v_financial_cost_per_unit:=v_product_variable_cost_per_unit+v_allocated_operating_cost_per_unit;
  IF v_cost>0 AND v_has_sales THEN v_required_profit_price:=CASE WHEN v_use_actual THEN v_cost+v_product_variable_cost_per_unit+v_allocated_operating_cost_per_unit+COALESCE(v_required_incremental_profit_per_unit,0) ELSE v_cost+COALESCE(v_required_incremental_profit_per_unit,0) END; END IF;
  v_min_margin:=COALESCE(v_min_margin,8); IF v_min_margin>=100 THEN v_min_margin:=99.99; END IF; v_margin_floor_price:=CASE WHEN v_min_margin>0 AND v_cost>0 THEN v_cost/(1-(v_min_margin/100)) ELSE v_cost END;
  SELECT public.get_market_analytics(p_product_id,v_freshness_hours) INTO v_market; v_lowest_competitor:=NULLIF((v_market->>'lowest_competitor_price')::numeric,0); IF v_lowest_competitor IS NOT NULL AND v_lowest_competitor>0 THEN v_competitive_target:=ROUND(GREATEST(v_lowest_competitor-COALESCE(p_undercut_amount,0.10),0.01),2); END IF;
  v_raw_final_price:=COALESCE(v_margin_floor_price,v_cost); IF v_competitive_target IS NOT NULL THEN v_raw_final_price:=GREATEST(v_raw_final_price,v_competitive_target); END IF; IF v_required_profit_price IS NOT NULL THEN v_raw_final_price:=GREATEST(v_raw_final_price,v_required_profit_price); END IF;
  v_upper_price:=CASE WHEN v_current_price>0 THEN v_current_price*(1+v_max_inc/100) ELSE v_raw_final_price END; v_lower_price:=CASE WHEN v_current_price>0 THEN v_current_price*(1-v_max_dec/100) ELSE 0 END; v_final_price:=v_raw_final_price;
  IF v_current_price>0 AND v_raw_final_price>v_upper_price AND v_margin_floor_price<=v_upper_price THEN v_final_price:=v_upper_price; END IF;
  IF v_current_price>0 AND v_raw_final_price<v_lower_price THEN v_final_price:=GREATEST(v_lower_price,v_margin_floor_price); END IF;
  v_final_price:=ROUND(v_final_price,2);
  IF v_cost<=0 THEN v_decision_reason:='MISSING_COST'; ELSIF NOT v_has_sales THEN v_decision_reason:='MISSING_SALES_FORECAST'; ELSIF v_margin_floor_price>v_upper_price AND v_current_price>0 THEN v_decision_reason:='SAFETY_MARGIN_EXCEEDS_PRICE_CAP'; ELSIF v_raw_final_price>v_upper_price AND v_margin_floor_price<=v_upper_price THEN v_decision_reason:='CAPPED_BY_MAX_INCREASE'; ELSIF v_raw_final_price<v_lower_price THEN v_decision_reason:='CAPPED_BY_MAX_DECREASE'; ELSIF v_competitive_target IS NOT NULL AND v_competitive_target>=COALESCE(v_required_profit_price,0) THEN v_decision_reason:='COMPETE_BELOW_LOWEST'; ELSIF v_daily_profit_gap<=0 AND v_competitive_target IS NULL THEN v_decision_reason:='TARGET_ALREADY_MET'; ELSIF v_required_profit_price>COALESCE(v_competitive_target,0) THEN v_decision_reason:='PROTECT_REQUIRED_PROFIT'; ELSE v_decision_reason:='PROTECT_MINIMUM_MARGIN'; END IF;
  RETURN json_build_object('product_id',p_product_id,'product_name',v_product_name,'cost_price',v_cost,'current_price',v_current_price,'lowest_competitor',v_lowest_competitor,'competitive_target',v_competitive_target,'required_profit_price',v_required_profit_price,'margin_floor_price',v_margin_floor_price,'raw_recommended_price',ROUND(v_raw_final_price,2),'final_recommended_price',v_final_price,'decision_reason',v_decision_reason,'expected_daily_units',v_expected_daily_units,'total_daily_units',v_total_daily_units,'daily_overhead',v_daily_operating_expenses,'target_profit_per_unit',v_required_incremental_profit_per_unit,'daily_profit_gap',v_daily_profit_gap,'current_daily_net_profit',v_daily_net_profit,'daily_target_net_profit',COALESCE(p_daily_target,0),'required_incremental_profit_per_unit',v_required_incremental_profit_per_unit,'product_variable_cost_per_unit',v_product_variable_cost_per_unit,'allocated_operating_cost_per_unit',v_allocated_operating_cost_per_unit,'financial_cost_per_unit',v_financial_cost_per_unit,'financial_lookback_days',v_finance_days,'use_actual_financial_costs',v_use_actual,'max_price_increase_percent',v_max_inc,'max_price_decrease_percent',v_max_dec,'max_allowed_price',v_upper_price,'min_allowed_change_price',v_lower_price,'financial_data_as_of',v_finance.financial_data_as_of,'has_sales_history',v_has_sales,'has_expense_data',v_daily_operating_expenses>0,'market_analytics',v_market);
END;
$$;
GRANT EXECUTE ON FUNCTION public.calculate_required_profit_price(uuid,numeric,integer,numeric) TO authenticated;

DROP FUNCTION IF EXISTS public.calculate_required_profit_price(uuid,uuid,numeric,integer,numeric);
NOTIFY pgrst,'reload schema';

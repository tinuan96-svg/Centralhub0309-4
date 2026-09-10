-- Regenerate the single canonical suggestion row per product instead of attempting
-- to append duplicates. Every refresh resets approval/execution state and leaves
-- application manual.

CREATE OR REPLACE FUNCTION public.run_daily_pricing_optimization(
  p_store_id uuid DEFAULT NULL::uuid,
  p_lookback_days integer DEFAULT NULL::integer
)
RETURNS json
LANGUAGE plpgsql
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_days integer; v_target numeric; v_run uuid:=gen_random_uuid();
  v_product record; v_rec json; v_opt json; v_strategy text; v_action text; v_status text;
  v_created integer:=0; v_increase integer:=0; v_decrease integer:=0; v_hold integer:=0; v_warning integer:=0; v_evaluated integer:=0;
  v_current numeric; v_chosen numeric; v_floor numeric; v_cost numeric; v_variable numeric; v_direct_cost numeric;
  v_units numeric; v_profit_unit numeric; v_daily_profit numeric; v_margin numeric; v_pct numeric;
  v_finance_as_of timestamptz; v_finance_age numeric; v_comp_age numeric; v_suggestion_id uuid;
  v_locked boolean; v_target_json json; v_current_business_profit numeric; v_gap numeric;
BEGIN
  SELECT GREATEST(COALESCE(p_lookback_days,ps.financial_lookback_days,30),7),COALESCE(ps.daily_target_net_profit,100)
  INTO v_days,v_target FROM public.pricing_settings ps WHERE ps.store_id IS NULL ORDER BY ps.updated_at DESC NULLS LAST LIMIT 1;
  v_days:=COALESCE(v_days,GREATEST(COALESCE(p_lookback_days,30),7)); v_target:=COALESCE(v_target,100);

  v_target_json:=public.calculate_weekly_pricing_strategy(current_date,7);
  v_current_business_profit:=COALESCE((v_target_json->>'current_average_profit_per_day')::numeric,0);
  v_gap:=COALESCE((v_target_json->>'profit_gap_required')::numeric,GREATEST(v_target-v_current_business_profit,0));

  INSERT INTO public.pricing_optimization_runs(id,store_id,lookback_days,daily_profit_target,current_daily_net_profit,daily_profit_gap,status)
  VALUES(v_run,p_store_id,v_days,v_target,v_current_business_profit,v_gap,'running');

  FOR v_product IN SELECT p.id,p.price,p.cost_price,p.min_margin,p.name FROM public.products p
    WHERE COALESCE(p.is_deleted,false)=false AND COALESCE(p.is_active,true)=true ORDER BY p.name
  LOOP
    v_evaluated:=v_evaluated+1;
    v_rec:=public.calculate_pricing_recommendation(v_product.id,p_store_id,48);
    IF (v_rec::jsonb) ? 'error' THEN v_warning:=v_warning+1; CONTINUE; END IF;
    v_opt:=public.calculate_price_optimization(v_product.id,p_store_id,48);

    v_current:=COALESCE((v_rec->>'current_price')::numeric,0); v_floor:=COALESCE((v_rec->>'profit_floor_price')::numeric,0);
    v_cost:=COALESCE((v_rec->>'cost_price')::numeric,0); v_variable:=COALESCE((v_rec->>'variable_cost')::numeric,0);
    v_direct_cost:=COALESCE((v_rec->>'direct_economic_cost')::numeric,v_cost+v_variable);
    v_units:=COALESCE((v_rec->>'expected_daily_units')::numeric,0);
    v_chosen:=ROUND(GREATEST(v_floor,COALESCE((v_rec->>'recommended_price')::numeric,v_current)),2);
    v_status:=COALESCE(v_rec->>'pricing_status','REVIEW_REQUIRED');
    v_locked:=EXISTS(SELECT 1 FROM public.price_locks pl WHERE pl.product_id=v_product.id AND pl.is_active=true);

    IF v_locked THEN
      v_chosen:=v_current; v_strategy:='PRICE_LOCKED'; v_action:='KEEP_LOCKED'; v_status:='PRICE_LOCKED';
    ELSIF v_units<=0 OR v_status IN ('WAIT_FOR_DEMAND_DATA','LOW_VOLUME_GUARD') THEN
      v_strategy:='WAIT_FOR_DATA'; v_action:='COLLECT_MORE_DATA';
    ELSIF v_chosen>v_current+0.005 THEN
      v_strategy:='INCREASE_MARGIN'; v_action:='REVIEW_AND_APPROVE_PRICE_INCREASE'; v_increase:=v_increase+1;
    ELSIF v_chosen<v_current-0.005 THEN
      v_strategy:='LOWER_PRICE_TEST'; v_action:='REVIEW_AND_APPROVE_PRICE_DECREASE'; v_decrease:=v_decrease+1;
    ELSE
      v_strategy:='HOLD_PRICE'; v_action:='HOLD_CURRENT_PRICE'; v_hold:=v_hold+1;
    END IF;

    v_profit_unit:=v_chosen-v_direct_cost; v_daily_profit:=v_profit_unit*v_units;
    v_margin:=CASE WHEN v_chosen>0 THEN v_profit_unit/v_chosen*100 ELSE 0 END;
    v_pct:=CASE WHEN v_current>0 THEN (v_chosen/v_current-1)*100 ELSE 0 END;
    v_finance_as_of:=NULLIF(v_rec->>'financial_data_as_of','')::timestamptz;
    v_finance_age:=CASE WHEN v_finance_as_of IS NULL THEN 999999 ELSE EXTRACT(EPOCH FROM (now()-v_finance_as_of))/3600 END;
    v_comp_age:=NULLIF(v_rec->'market_analytics'->>'data_age_hours','')::numeric;

    INSERT INTO public.pricing_suggestions(
      product_id,store_id,current_price,suggested_price,cost_price,minimum_allowed_price,lowest_competitor_price,median_market_price,
      strategy,expected_margin,price_difference,percentage_difference,recommendation_status,reason,generated_at,competitive_target_price,
      required_profit_price,final_price,target_profit_contribution,allocated_overhead,decision_reason,competitor_data_age_hours,
      financial_data_age_hours,publication_status,market_position,variable_cost,profit_floor_price,target_economic_price,recommended_price,
      expected_profit_per_unit,expected_daily_profit,pricing_status,competitor_data_quality,competitor_freshness_hours,requires_approval,
      price_locked,target_profit_per_unit,expected_daily_units,target_mode,financial_data_as_of,daily_profit_gap,current_daily_net_profit,
      required_incremental_profit_per_unit,financial_cost_per_unit,expected_contribution_profit,expected_contribution_margin,
      optimization_strategy,optimization_score,scenario_best_price,scenario_best_daily_profit,scenario_method,scenario_json,
      optimization_run_id,generated_by_finance,optimization_action,approval_status,execution_status,data_quality_status,data_quality_reasons,execution_blocked
    ) VALUES(
      v_product.id,p_store_id,v_current,v_chosen,v_cost,v_floor,
      NULLIF(v_rec->'market_analytics'->>'lowest_competitor_price','')::numeric,NULLIF(v_rec->'market_analytics'->>'median_competitor_price','')::numeric,
      v_strategy,v_margin,v_chosen-v_current,v_pct,'ready',v_rec->>'decision_reason',now(),
      NULLIF(v_rec->>'competitive_target_price','')::numeric,NULLIF(v_rec->>'required_profit_price','')::numeric,v_chosen,
      COALESCE((v_rec->>'target_profit_per_unit')::numeric,0)*v_units,0,v_status,v_comp_age,v_finance_age,'pending',v_rec->>'market_position',
      v_variable,v_floor,NULLIF(v_rec->>'required_profit_price','')::numeric,v_chosen,v_profit_unit,v_daily_profit,v_status,
      v_rec->>'competitor_data_quality',48,true,v_locked,COALESCE((v_rec->>'target_profit_per_unit')::numeric,0),v_units,
      COALESCE((SELECT ps.target_mode FROM public.pricing_settings ps WHERE ps.store_id IS NULL ORDER BY ps.updated_at DESC NULLS LAST LIMIT 1),'performance'),
      v_finance_as_of,v_gap,v_current_business_profit,COALESCE((v_rec->>'target_profit_per_unit')::numeric,0),v_direct_cost,v_daily_profit,v_margin,
      COALESCE(v_opt->>'optimization_strategy',v_strategy),ABS(v_chosen-v_current)*v_units,NULLIF(v_opt->>'best_scenario_price','')::numeric,
      NULLIF(v_opt->>'best_scenario_daily_profit','')::numeric,v_opt->>'scenario_method',COALESCE(v_opt::jsonb,'{}'::jsonb),v_run,true,v_action,
      'pending','not_executed','pending','[]'::jsonb,false
    )
    ON CONFLICT (product_id) DO UPDATE SET
      store_id=excluded.store_id,current_price=excluded.current_price,suggested_price=excluded.suggested_price,cost_price=excluded.cost_price,
      minimum_allowed_price=excluded.minimum_allowed_price,lowest_competitor_price=excluded.lowest_competitor_price,
      median_market_price=excluded.median_market_price,strategy=excluded.strategy,expected_margin=excluded.expected_margin,
      price_difference=excluded.price_difference,percentage_difference=excluded.percentage_difference,recommendation_status='ready',
      reason=excluded.reason,generated_at=excluded.generated_at,competitive_target_price=excluded.competitive_target_price,
      required_profit_price=excluded.required_profit_price,final_price=excluded.final_price,target_profit_contribution=excluded.target_profit_contribution,
      allocated_overhead=0,decision_reason=excluded.decision_reason,competitor_data_age_hours=excluded.competitor_data_age_hours,
      financial_data_age_hours=excluded.financial_data_age_hours,publication_status='pending',applied_at=NULL,applied_by=NULL,
      market_position=excluded.market_position,variable_cost=excluded.variable_cost,profit_floor_price=excluded.profit_floor_price,
      target_economic_price=excluded.target_economic_price,recommended_price=excluded.recommended_price,
      expected_profit_per_unit=excluded.expected_profit_per_unit,expected_daily_profit=excluded.expected_daily_profit,
      pricing_status=excluded.pricing_status,competitor_data_quality=excluded.competitor_data_quality,
      competitor_freshness_hours=excluded.competitor_freshness_hours,requires_approval=true,price_locked=excluded.price_locked,
      target_profit_per_unit=excluded.target_profit_per_unit,expected_daily_units=excluded.expected_daily_units,target_mode=excluded.target_mode,
      financial_data_as_of=excluded.financial_data_as_of,daily_profit_gap=excluded.daily_profit_gap,current_daily_net_profit=excluded.current_daily_net_profit,
      required_incremental_profit_per_unit=excluded.required_incremental_profit_per_unit,financial_cost_per_unit=excluded.financial_cost_per_unit,
      expected_contribution_profit=excluded.expected_contribution_profit,expected_contribution_margin=excluded.expected_contribution_margin,
      optimization_strategy=excluded.optimization_strategy,optimization_score=excluded.optimization_score,
      scenario_best_price=excluded.scenario_best_price,scenario_best_daily_profit=excluded.scenario_best_daily_profit,
      scenario_method=excluded.scenario_method,scenario_json=excluded.scenario_json,optimization_run_id=excluded.optimization_run_id,
      generated_by_finance=true,optimization_action=excluded.optimization_action,approval_status='pending',approved_at=NULL,approved_by=NULL,
      rejected_at=NULL,rejected_by=NULL,rejection_reason=NULL,execution_status='not_executed',execution_attempted_at=NULL,execution_error=NULL,
      data_quality_status='pending',data_quality_reasons='[]'::jsonb,data_quality_checked_at=NULL,execution_blocked=false
    RETURNING id INTO v_suggestion_id;

    PERFORM 1 FROM public.check_pricing_data_quality(v_suggestion_id); v_created:=v_created+1;
  END LOOP;

  UPDATE public.pricing_optimization_runs SET products_evaluated=v_evaluated,recommendations_created=v_created,
    increase_count=v_increase,hold_count=v_hold,supplier_review_count=v_decrease,data_warning_count=v_warning,status='completed',completed_at=now()
  WHERE id=v_run;

  RETURN json_build_object('run_id',v_run,'status','completed','products_evaluated',v_evaluated,'recommendations_created',v_created,
    'increase_count',v_increase,'decrease_count',v_decrease,'hold_count',v_hold,'data_warning_count',v_warning,
    'daily_profit_target',v_target,'current_daily_net_profit',v_current_business_profit,'daily_profit_gap',v_gap,'lookback_days',v_days,
    'target_data_confidence',v_target_json->>'target_data_confidence',
    'pricing_can_close_business_gap',COALESCE((v_target_json->>'pricing_can_close_gap')::boolean,false),
    'unrecoverable_business_gap_per_day',COALESCE((v_target_json->>'unrecoverable_gap_per_day')::numeric,0),
    'guardrail','MANUAL_APPROVAL_DIRECT_COST_ONLY');
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pricing_optimization_runs SET status='failed',completed_at=now() WHERE id=v_run; RAISE;
END
$function$;

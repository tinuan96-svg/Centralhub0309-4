-- Restores the pricing control model after pricing was folded into BI.
-- Key rule: operating overhead is business-level context and is never forced into
-- every item's direct cost. The business profit gap is capped to what the configured
-- maximum price movement could realistically recover.

CREATE OR REPLACE FUNCTION public.calculate_weekly_pricing_strategy(
  p_period_end date DEFAULT CURRENT_DATE,
  p_window_days integer DEFAULT 7
)
RETURNS json
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_days integer := GREATEST(COALESCE(p_window_days,7),1);
  v_start date := p_period_end-(GREATEST(COALESCE(p_window_days,7),1)-1);
  v_baseline_days integer; v_baseline_start date;
  v_orders integer; v_units numeric; v_rev numeric; v_cogs numeric; v_varc numeric;
  v_gross numeric; v_contrib numeric; v_opx numeric; v_fin numeric; v_tax numeric; v_net numeric;
  v_avg_o numeric; v_avg_u numeric; v_avg_rev numeric; v_avg_profit numeric; v_avg_po numeric; v_prev_profit numeric;
  b_orders integer; b_units numeric; b_rev numeric; b_cogs numeric; b_varc numeric;
  b_gross numeric; b_contrib numeric; b_opx numeric; b_fin numeric; b_tax numeric; b_net numeric;
  b_avg_o numeric; b_avg_u numeric; b_avg_rev numeric; b_avg_profit numeric; b_avg_po numeric;
  v_target_week numeric; v_target_day numeric; v_config_daily_target numeric; v_growth numeric;
  v_target_mode text; v_gap_signed numeric; v_gap_required numeric; v_status text;
  v_raw_req_order numeric; v_raw_req_unit numeric; v_req_order numeric; v_req_unit numeric;
  v_avg_unit_revenue numeric; v_max_inc numeric; v_capacity_unit numeric; v_capacity_day numeric;
  v_unrecoverable_gap numeric; v_confidence text; v_can_close boolean;
BEGIN
  SELECT COALESCE(ps.target_mode,'performance'),ps.weekly_target_profit,
         COALESCE(ps.daily_target_net_profit,100),COALESCE(ps.target_growth_percent,10),
         GREATEST(COALESCE(ps.financial_lookback_days,30),7),
         GREATEST(COALESCE(ps.max_price_increase_percent,20),0)
  INTO v_target_mode,v_target_week,v_config_daily_target,v_growth,v_baseline_days,v_max_inc
  FROM public.pricing_settings ps WHERE ps.store_id IS NULL
  ORDER BY ps.updated_at DESC NULLS LAST LIMIT 1;

  v_target_mode:=COALESCE(v_target_mode,'performance');
  v_config_daily_target:=COALESCE(v_config_daily_target,100);
  v_growth:=COALESCE(v_growth,10);
  v_baseline_days:=GREATEST(COALESCE(v_baseline_days,30),v_days,7);
  v_max_inc:=COALESCE(v_max_inc,20);
  v_baseline_start:=p_period_end-(v_baseline_days-1);

  SELECT COALESCE(SUM(orders),0)::int,COALESCE(SUM(units_sold),0),COALESCE(SUM(revenue),0),
         COALESCE(SUM(cogs),0),COALESCE(SUM(variable_costs),0),COALESCE(SUM(gross_profit),0),
         COALESCE(SUM(contribution_profit),0),COALESCE(SUM(operating_expenses),0),
         COALESCE(SUM(finance_costs),0),COALESCE(SUM(taxes),0),COALESCE(SUM(net_profit),0)
  INTO v_orders,v_units,v_rev,v_cogs,v_varc,v_gross,v_contrib,v_opx,v_fin,v_tax,v_net
  FROM public.v_financial_daily_pnl WHERE business_date BETWEEN v_start AND p_period_end;

  SELECT COALESCE(SUM(orders),0)::int,COALESCE(SUM(units_sold),0),COALESCE(SUM(revenue),0),
         COALESCE(SUM(cogs),0),COALESCE(SUM(variable_costs),0),COALESCE(SUM(gross_profit),0),
         COALESCE(SUM(contribution_profit),0),COALESCE(SUM(operating_expenses),0),
         COALESCE(SUM(finance_costs),0),COALESCE(SUM(taxes),0),COALESCE(SUM(net_profit),0)
  INTO b_orders,b_units,b_rev,b_cogs,b_varc,b_gross,b_contrib,b_opx,b_fin,b_tax,b_net
  FROM public.v_financial_daily_pnl WHERE business_date BETWEEN v_baseline_start AND p_period_end;

  v_avg_o:=v_orders::numeric/v_days; v_avg_u:=v_units/v_days; v_avg_rev:=v_rev/v_days;
  v_avg_profit:=v_net/v_days; v_avg_po:=CASE WHEN v_orders>0 THEN v_net/v_orders ELSE 0 END;
  b_avg_o:=b_orders::numeric/v_baseline_days; b_avg_u:=b_units/v_baseline_days; b_avg_rev:=b_rev/v_baseline_days;
  b_avg_profit:=b_net/v_baseline_days; b_avg_po:=CASE WHEN b_orders>0 THEN b_net/b_orders ELSE 0 END;

  SELECT wpm.net_profit INTO v_prev_profit FROM public.weekly_profit_metrics wpm
  WHERE wpm.period_end=p_period_end-7 AND wpm.window_days=v_days;

  IF v_target_mode='performance' THEN
    v_target_day:=CASE WHEN b_avg_profit>0 THEN b_avg_profit*(1+v_growth/100) ELSE v_config_daily_target END;
  ELSE
    v_target_day:=COALESCE(v_target_week,v_config_daily_target*v_days)/v_days;
  END IF;
  v_target_week:=v_target_day*v_days;
  v_gap_signed:=b_avg_profit-v_target_day; v_gap_required:=GREATEST(v_target_day-b_avg_profit,0);
  v_raw_req_order:=CASE WHEN b_avg_o>0 THEN v_gap_required/b_avg_o ELSE 0 END;
  v_raw_req_unit:=CASE WHEN b_avg_u>0 THEN v_gap_required/b_avg_u ELSE 0 END;
  v_avg_unit_revenue:=CASE WHEN b_units>0 THEN b_rev/b_units ELSE 0 END;
  v_capacity_unit:=GREATEST(v_avg_unit_revenue,0)*(v_max_inc/100);
  v_req_unit:=CASE WHEN b_avg_u<=0 THEN 0 ELSE LEAST(v_raw_req_unit,GREATEST(v_capacity_unit,0)) END;
  v_req_order:=CASE WHEN b_avg_o<=0 THEN 0 ELSE v_req_unit*(b_avg_u/b_avg_o) END;
  v_capacity_day:=v_req_unit*b_avg_u; v_unrecoverable_gap:=GREATEST(v_gap_required-v_capacity_day,0);
  v_can_close:=v_gap_required<=0.01 OR v_unrecoverable_gap<=0.01;
  v_confidence:=CASE WHEN b_orders>=20 AND b_units>=50 THEN 'HIGH' WHEN b_orders>=7 AND b_units>=20 THEN 'MEDIUM' ELSE 'LOW' END;
  v_status:=CASE WHEN v_confidence='LOW' THEN 'LOW_VOLUME_GUARD' WHEN v_gap_required<=0 THEN 'ABOVE_TARGET'
                 WHEN NOT v_can_close THEN 'PRICING_CAPACITY_LIMITED'
                 WHEN b_avg_profit>=v_target_day*0.95 THEN 'NEAR_TARGET' ELSE 'BELOW_TARGET' END;

  INSERT INTO public.weekly_profit_metrics(period_end,window_days,orders_count,units_sold,revenue_net,cogs_net,variable_costs_net,
    operating_expenses_net,gross_profit,contribution_profit,net_profit,average_orders_per_day,average_units_per_day,
    average_revenue_per_day,average_profit_per_day,average_profit_per_order,comparable_previous_profit,updated_at)
  VALUES(p_period_end,v_days,v_orders,v_units,v_rev,v_cogs,v_varc,v_opx,v_gross,v_contrib,v_net,v_avg_o,v_avg_u,v_avg_rev,v_avg_profit,v_avg_po,v_prev_profit,now())
  ON CONFLICT(period_end,window_days) DO UPDATE SET orders_count=excluded.orders_count,units_sold=excluded.units_sold,
    revenue_net=excluded.revenue_net,cogs_net=excluded.cogs_net,variable_costs_net=excluded.variable_costs_net,
    operating_expenses_net=excluded.operating_expenses_net,gross_profit=excluded.gross_profit,
    contribution_profit=excluded.contribution_profit,net_profit=excluded.net_profit,average_orders_per_day=excluded.average_orders_per_day,
    average_units_per_day=excluded.average_units_per_day,average_revenue_per_day=excluded.average_revenue_per_day,
    average_profit_per_day=excluded.average_profit_per_day,average_profit_per_order=excluded.average_profit_per_order,
    comparable_previous_profit=excluded.comparable_previous_profit,updated_at=now();

  INSERT INTO public.weekly_pricing_strategy(period_end,target_mode,weekly_profit_target,daily_profit_target,target_growth_percent,
    average_orders_per_day,average_units_per_day,required_profit_per_order,required_profit_per_unit,current_average_profit_per_day,
    gap_to_target,status,updated_at)
  VALUES(p_period_end,v_target_mode,v_target_week,v_target_day,v_growth,b_avg_o,b_avg_u,v_req_order,v_req_unit,b_avg_profit,v_gap_signed,v_status,now())
  ON CONFLICT(period_end) DO UPDATE SET target_mode=excluded.target_mode,weekly_profit_target=excluded.weekly_profit_target,
    daily_profit_target=excluded.daily_profit_target,target_growth_percent=excluded.target_growth_percent,
    average_orders_per_day=excluded.average_orders_per_day,average_units_per_day=excluded.average_units_per_day,
    required_profit_per_order=excluded.required_profit_per_order,required_profit_per_unit=excluded.required_profit_per_unit,
    current_average_profit_per_day=excluded.current_average_profit_per_day,gap_to_target=excluded.gap_to_target,status=excluded.status,updated_at=now();

  RETURN json_build_object('period_end',p_period_end,'window_days',v_days,'orders',v_orders,'units',v_units,'revenue',v_rev,'cogs',v_cogs,
    'variable_costs',v_varc,'operating_expenses',v_opx,'finance_costs',v_fin,'taxes',v_tax,'gross_profit',v_gross,
    'contribution_profit',v_contrib,'net_profit',v_net,'average_orders_per_day',v_avg_o,'average_units_per_day',v_avg_u,
    'average_revenue_per_day',v_avg_rev,'average_profit_per_day',v_avg_profit,'average_profit_per_order',v_avg_po,
    'target_mode',v_target_mode,'weekly_profit_target',v_target_week,'daily_profit_target',v_target_day,
    'required_profit_per_order',v_req_order,'required_profit_per_unit',v_req_unit,'raw_required_profit_per_order',v_raw_req_order,
    'raw_required_profit_per_unit',v_raw_req_unit,'current_average_profit_per_day',b_avg_profit,'gap_to_target',v_gap_signed,
    'profit_gap_required',v_gap_required,'status',v_status,'calculation_window_days',v_baseline_days,'baseline_orders',b_orders,
    'baseline_units',b_units,'baseline_revenue',b_rev,'baseline_net_profit',b_net,'target_data_confidence',v_confidence,
    'average_revenue_per_unit',v_avg_unit_revenue,'max_price_increase_percent',v_max_inc,
    'pricing_recovery_capacity_per_unit',v_capacity_unit,'pricing_recovery_capacity_per_day',v_capacity_day,
    'unrecoverable_gap_per_day',v_unrecoverable_gap,'pricing_can_close_gap',v_can_close,
    'guardrail','OVERHEAD_GAP_NOT_FORCED_INTO_ITEM_COST');
END
$function$;

CREATE OR REPLACE FUNCTION public.calculate_pricing_recommendation(
  p_product_id uuid,p_store_id uuid DEFAULT NULL::uuid,p_freshness_hours integer DEFAULT 48
)
RETURNS json LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  p record; f record; m json; s record; strat json; lookback integer;
  product_units numeric; total_units numeric; variable_per_unit numeric; direct_cost numeric;
  target_day numeric; current_day_profit numeric; target_gap numeric; target_profit_unit numeric;
  margin_floor numeric; profit_floor numeric; theoretical_required numeric; required numeric; cap_price numeric;
  market numeric; rec numeric; margin numeric; profit_unit numeric; daily_profit numeric; reason text; status text;
  strategy text; min_margin numeric; data_confidence text; calculation_window integer;
BEGIN
  SELECT * INTO p FROM public.products WHERE id=p_product_id AND is_active=true AND COALESCE(is_deleted,false)=false;
  IF NOT FOUND THEN RETURN json_build_object('error','Product not found or inactive'); END IF;
  SELECT * INTO s FROM public.pricing_settings WHERE store_id IS NULL ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  lookback:=GREATEST(COALESCE(s.financial_lookback_days,s.expected_sales_window_days,30),7);
  SELECT * INTO f FROM public.get_product_pricing_financial_context(p_product_id,p_store_id,lookback);
  strat:=public.calculate_weekly_pricing_strategy(current_date,7);
  target_day:=COALESCE((strat->>'daily_profit_target')::numeric,COALESCE(s.daily_target_net_profit,100));
  current_day_profit:=COALESCE((strat->>'current_average_profit_per_day')::numeric,(strat->>'average_profit_per_day')::numeric,0);
  target_gap:=COALESCE((strat->>'profit_gap_required')::numeric,GREATEST(target_day-current_day_profit,0));
  target_profit_unit:=GREATEST(COALESCE((strat->>'required_profit_per_unit')::numeric,0),0);
  data_confidence:=COALESCE(strat->>'target_data_confidence','LOW');
  calculation_window:=COALESCE((strat->>'calculation_window_days')::int,lookback);
  product_units:=COALESCE(f.expected_daily_units,0);

  SELECT COALESCE(SUM(oi.quantity),0)::numeric/lookback INTO total_units FROM public.order_items oi
  JOIN public.orders o ON o.id=oi.order_id WHERE lower(coalesce(o.payment_status,''))='paid'
    AND coalesce(o.is_deleted,false)=false AND lower(coalesce(o.order_status,o.status,'')) NOT IN ('cancelled','refunded','failed')
    AND o.created_at>=CURRENT_DATE-lookback+1 AND (p_store_id IS NULL OR o.store_id=p_store_id);
  total_units:=GREATEST(COALESCE(total_units,0),0);
  variable_per_unit:=GREATEST(COALESCE(f.financial_cost_per_unit,0),0);
  direct_cost:=GREATEST(COALESCE(p.cost_price,0)+variable_per_unit,0);
  min_margin:=LEAST(GREATEST(COALESCE(p.min_margin,5),0),99.99);
  margin_floor:=CASE WHEN direct_cost>0 THEN direct_cost/(1-min_margin/100) ELSE 0 END;
  profit_floor:=GREATEST(direct_cost,margin_floor,COALESCE(s.minimum_price_floor,0));
  theoretical_required:=GREATEST(profit_floor,COALESCE(p.price,profit_floor)+target_profit_unit);
  cap_price:=CASE WHEN COALESCE(p.price,0)>0 THEN p.price*(1+GREATEST(COALESCE(s.max_price_increase_percent,20),0)/100) ELSE theoretical_required END;
  required:=GREATEST(profit_floor,LEAST(theoretical_required,cap_price));

  SELECT public.get_market_analytics(p_product_id,p_freshness_hours) INTO m;
  market:=CASE WHEN COALESCE((m->>'valid_competitor_count')::int,0)>=COALESCE(s.minimum_competitor_count,1)
               THEN COALESCE((m->>'median_competitor_price')::numeric,(m->>'lowest_competitor_price')::numeric) ELSE NULL END;
  strategy:=COALESCE(s.strategy_config->>COALESCE(p.product_type,'simple'),'standard');

  IF product_units<=0 THEN
    rec:=GREATEST(COALESCE(p.price,0),profit_floor);
    reason:=CASE WHEN COALESCE(p.price,0)<profit_floor THEN 'No paid demand history; current price is below the direct economic floor. Review at the floor only.'
                 ELSE 'No paid demand history; hold current price until reliable paid sales data exists.' END;
    status:=CASE WHEN COALESCE(p.price,0)<profit_floor THEN 'BELOW_ECONOMIC_FLOOR' ELSE 'WAIT_FOR_DEMAND_DATA' END;
  ELSIF data_confidence='LOW' THEN
    rec:=GREATEST(COALESCE(p.price,0),profit_floor);
    reason:='Business pricing baseline is low confidence. Hold the current price unless it breaches the direct economic floor.';
    status:=CASE WHEN COALESCE(p.price,0)<profit_floor THEN 'BELOW_ECONOMIC_FLOOR' ELSE 'LOW_VOLUME_GUARD' END;
  ELSIF market IS NULL THEN
    rec:=required;
    reason:=CASE WHEN theoretical_required>cap_price THEN 'No reliable fresh competitor data. The safe target is capped by the configured maximum price increase.'
                 ELSE 'No reliable fresh competitor data; use the guarded paid-order economic target.' END;
    status:=CASE WHEN theoretical_required>cap_price THEN 'TARGET_CONSTRAINED' ELSE 'ECONOMIC_ONLY' END;
  ELSIF market<profit_floor THEN
    rec:=GREATEST(profit_floor,LEAST(required,cap_price));
    reason:='Reliable market price is below the direct economic floor; protect the floor and require manual review.'; status:='MARKET_BELOW_PROFIT';
  ELSE
    rec:=GREATEST(profit_floor,LEAST(required,CASE WHEN COALESCE(s.market_position_target,'BELOW_MARKET')='MATCH' THEN market
      ELSE GREATEST(market-COALESCE(s.competitor_undercut_amount,0.10),profit_floor) END));
    reason:='Market data is compatible with direct economics; position within the configured target without crossing the floor.'; status:='MARKET_ALIGNED';
  END IF;

  rec:=ROUND(COALESCE(rec,p.price),2); profit_unit:=rec-direct_cost;
  margin:=CASE WHEN rec>0 THEN profit_unit/rec*100 ELSE 0 END; daily_profit:=profit_unit*product_units;
  RETURN json_build_object('product_id',p.id,'product_name',p.name,'sku',p.sku,'current_price',p.price,'cost_price',p.cost_price,
    'variable_cost',variable_per_unit,'direct_economic_cost',direct_cost,'expected_daily_units',product_units,'total_daily_units',total_units,
    'allocated_overhead_per_unit',0,'business_overhead_reference_only',true,'target_daily_profit',target_day,
    'current_business_profit_per_day',current_day_profit,'target_gap_per_day',target_gap,'target_profit_per_unit',target_profit_unit,
    'raw_target_profit_per_unit',COALESCE((strat->>'raw_required_profit_per_unit')::numeric,target_profit_unit),
    'unconstrained_target_price',theoretical_required,'profit_floor_price',profit_floor,'required_profit_price',required,
    'minimum_margin_floor_price',margin_floor,'competitive_target_price',market,'recommended_price',rec,
    'expected_profit_per_unit',profit_unit,'expected_daily_profit',daily_profit,'expected_margin',margin,
    'market_position',CASE WHEN market IS NULL THEN 'NO_VALID_DATA' WHEN rec<market THEN 'BELOW_MARKET' WHEN rec=market THEN 'MARKET_ALIGNED' ELSE 'ABOVE_MARKET' END,
    'pricing_status',status,'decision_reason',reason,'strategy',strategy,
    'competitor_data_quality',CASE WHEN COALESCE((m->>'valid_competitor_count')::int,0)=0 THEN 'NO_DATA' WHEN COALESCE((m->>'stale_count')::int,0)>0 THEN 'AGING' ELSE 'FRESH' END,
    'target_data_confidence',data_confidence,'calculation_window_days',calculation_window,
    'pricing_can_close_business_gap',COALESCE((strat->>'pricing_can_close_gap')::boolean,false),
    'unrecoverable_business_gap_per_day',COALESCE((strat->>'unrecoverable_gap_per_day')::numeric,0),
    'financial_data_as_of',f.financial_data_as_of,'market_analytics',m);
END
$function$;

CREATE OR REPLACE FUNCTION public.calculate_required_profit_price(
  p_product_id uuid,p_daily_target numeric DEFAULT 100.00,p_sales_window_days integer DEFAULT 30,p_undercut_amount numeric DEFAULT 0.10
)
RETURNS json LANGUAGE plpgsql SET search_path TO 'public','pg_temp'
AS $function$
DECLARE r json; fctx record; bctx record; s record; v_direct_cost numeric; v_finance_age numeric; v_comp_age numeric;
BEGIN
  SELECT * INTO s FROM public.pricing_settings WHERE store_id IS NULL ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  r:=public.calculate_pricing_recommendation(p_product_id,NULL,GREATEST(COALESCE(s.competitor_freshness_window_hours,48),1));
  IF (r::jsonb) ? 'error' THEN RETURN r; END IF;
  SELECT * INTO fctx FROM public.get_product_pricing_financial_context(p_product_id,NULL,GREATEST(COALESCE(s.financial_lookback_days,p_sales_window_days,30),7));
  SELECT * INTO bctx FROM public.get_pricing_financial_context(NULL,GREATEST(COALESCE(s.financial_lookback_days,p_sales_window_days,30),7));
  v_direct_cost:=COALESCE((r->>'direct_economic_cost')::numeric,COALESCE((r->>'cost_price')::numeric,0)+COALESCE((r->>'variable_cost')::numeric,0));
  v_finance_age:=CASE WHEN fctx.financial_data_as_of IS NULL THEN NULL ELSE EXTRACT(EPOCH FROM (now()-fctx.financial_data_as_of))/3600 END;
  v_comp_age:=NULLIF(r->'market_analytics'->>'data_age_hours','')::numeric;
  RETURN json_build_object('product_id',p_product_id,'product_name',r->>'product_name','cost_price',(r->>'cost_price')::numeric,
    'current_price',(r->>'current_price')::numeric,'lowest_competitor',NULLIF(r->'market_analytics'->>'lowest_competitor_price','')::numeric,
    'competitive_target',(r->>'competitive_target_price')::numeric,'required_profit_price',(r->>'required_profit_price')::numeric,
    'margin_floor_price',(r->>'minimum_margin_floor_price')::numeric,'raw_recommended_price',(r->>'unconstrained_target_price')::numeric,
    'final_recommended_price',(r->>'recommended_price')::numeric,'decision_reason',r->>'pricing_status','decision_explanation',r->>'decision_reason',
    'expected_daily_units',(r->>'expected_daily_units')::numeric,'total_daily_units',(r->>'total_daily_units')::numeric,
    'daily_overhead',COALESCE(bctx.daily_operating_expenses,0),'target_profit_per_unit',(r->>'target_profit_per_unit')::numeric,
    'daily_profit_gap',(r->>'target_gap_per_day')::numeric,'current_daily_net_profit',(r->>'current_business_profit_per_day')::numeric,
    'daily_target_net_profit',(r->>'target_daily_profit')::numeric,'required_incremental_profit_per_unit',(r->>'target_profit_per_unit')::numeric,
    'product_variable_cost_per_unit',COALESCE((r->>'variable_cost')::numeric,0),'allocated_operating_cost_per_unit',0,
    'financial_cost_per_unit',v_direct_cost,'financial_lookback_days',GREATEST(COALESCE(s.financial_lookback_days,p_sales_window_days,30),7),
    'use_actual_financial_costs',true,'max_price_increase_percent',COALESCE(s.max_price_increase_percent,20),
    'max_price_decrease_percent',COALESCE(s.max_price_decrease_percent,20),
    'max_allowed_price',CASE WHEN COALESCE((r->>'current_price')::numeric,0)>0 THEN (r->>'current_price')::numeric*(1+COALESCE(s.max_price_increase_percent,20)/100) ELSE (r->>'recommended_price')::numeric END,
    'min_allowed_change_price',CASE WHEN COALESCE((r->>'current_price')::numeric,0)>0 THEN (r->>'current_price')::numeric*(1-COALESCE(s.max_price_decrease_percent,20)/100) ELSE 0 END,
    'financial_data_as_of',fctx.financial_data_as_of,'financial_data_age_hours',v_finance_age,'competitor_data_age_hours',v_comp_age,
    'has_sales_history',COALESCE((r->>'expected_daily_units')::numeric,0)>0,'has_expense_data',COALESCE(bctx.daily_operating_expenses,0)>0,
    'overhead_allocated_to_item_price',false,'target_data_confidence',r->>'target_data_confidence','market_analytics',r->'market_analytics');
END
$function$;

CREATE OR REPLACE FUNCTION public.get_pricing_control_rows(p_limit integer DEFAULT 100,p_offset integer DEFAULT 0)
RETURNS SETOF json LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE r record; rec json; opt json; merged jsonb; chosen numeric; floor numeric; current numeric; direct_cost numeric;
  units_day numeric; profit_unit numeric; margin numeric; daily_profit numeric; final_status text;
BEGIN
  FOR r IN SELECT id FROM public.products WHERE is_active=true AND COALESCE(is_deleted,false)=false ORDER BY name
    OFFSET GREATEST(COALESCE(p_offset,0),0) LIMIT LEAST(GREATEST(COALESCE(p_limit,100),1),1000)
  LOOP
    rec:=public.calculate_pricing_recommendation(r.id,NULL,48); opt:=public.calculate_price_optimization(r.id,NULL,48);
    IF (rec::jsonb) ? 'error' THEN CONTINUE; END IF;
    merged:=rec::jsonb||opt::jsonb; floor:=COALESCE((rec->>'profit_floor_price')::numeric,0); current:=COALESCE((rec->>'current_price')::numeric,0);
    direct_cost:=COALESCE((rec->>'direct_economic_cost')::numeric,COALESCE((rec->>'cost_price')::numeric,0)+COALESCE((rec->>'variable_cost')::numeric,0));
    units_day:=COALESCE((rec->>'expected_daily_units')::numeric,0);
    chosen:=GREATEST(floor,COALESCE((rec->>'recommended_price')::numeric,current)); chosen:=ROUND(chosen,2);
    profit_unit:=chosen-direct_cost; margin:=CASE WHEN chosen>0 THEN profit_unit/chosen*100 ELSE 0 END; daily_profit:=profit_unit*units_day;
    final_status:=COALESCE(rec->>'pricing_status','REVIEW_REQUIRED');
    merged:=merged||jsonb_build_object('recommended_price',chosen,'expected_profit_per_unit',profit_unit,'expected_margin',margin,
      'expected_daily_profit',daily_profit,'pricing_status',final_status,'variable_cost',COALESCE((rec->>'variable_cost')::numeric,0),
      'profit_floor_price',floor,'required_profit_price',COALESCE((rec->>'required_profit_price')::numeric,floor),
      'decision_reason',rec->>'decision_reason','recommendation_source','GUARDED_PRICING_ENGINE',
      'optimization_best_price',NULLIF(opt->>'best_scenario_price','')::numeric);
    RETURN NEXT merged::json;
  END LOOP;
END
$function$;

CREATE OR REPLACE FUNCTION public.mark_pricing_suggestion_stale_on_competitor_change()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.price IS NOT DISTINCT FROM OLD.price
       AND NEW.source_regular_price IS NOT DISTINCT FROM OLD.source_regular_price
       AND NEW.source_sale_price IS NOT DISTINCT FROM OLD.source_sale_price
       AND NEW.normalised_price_per_kg IS NOT DISTINCT FROM OLD.normalised_price_per_kg
       AND NEW.source_stock_status IS NOT DISTINCT FROM OLD.source_stock_status
       AND NEW.match_status IS NOT DISTINCT FROM OLD.match_status
       AND NEW.match_confidence IS NOT DISTINCT FROM OLD.match_confidence
       AND NEW.is_conditional IS NOT DISTINCT FROM OLD.is_conditional
       AND NEW.product_id IS NOT DISTINCT FROM OLD.product_id THEN RETURN NEW; END IF;
  END IF;
  UPDATE public.pricing_suggestions SET recommendation_status='stale',execution_blocked=true,
    data_quality_status='STALE_RECALC_REQUIRED',data_quality_checked_at=now()
  WHERE product_id=NEW.product_id AND recommendation_status<>'applied';
  UPDATE public.intelligence_recommendations SET status='stale',is_stale=true,
    reason=coalesce(reason,'')||CASE WHEN coalesce(reason,'')='' THEN '' ELSE ' | ' END||'STALE: material competitor data changed'
  WHERE recommendation_type='pricing_opportunity' AND entity_id=NEW.product_id::text AND status IN ('recommended','approved');
  RETURN NEW;
END
$function$;

DO $do$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname='centralhub-pricing-refresh' LOOP PERFORM cron.unschedule(j.jobid); END LOOP;
END
$do$;

SELECT cron.schedule('centralhub-pricing-refresh','45 */6 * * *','select public.run_daily_pricing_optimization();');

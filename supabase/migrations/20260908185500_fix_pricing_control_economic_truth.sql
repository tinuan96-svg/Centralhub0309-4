-- Pricing Control economic-truth repair.
-- Paid orders only, customer-paid delivery offset against courier cost, direct economic floors,
-- P&L-aligned weekly strategy, demand-aware recommendations, and hard server-side apply protection.

CREATE OR REPLACE FUNCTION public.get_product_pricing_financial_context(p_product_id uuid, p_store_id uuid DEFAULT NULL::uuid, p_days integer DEFAULT 30)
RETURNS TABLE(product_id uuid, store_id uuid, units_sold numeric, revenue numeric, cogs numeric, variable_costs numeric, contribution_profit numeric, contribution_margin numeric, profit_per_unit numeric, avg_selling_price numeric, avg_cost_price numeric, financial_cost_per_unit numeric, expected_daily_units numeric, financial_data_as_of timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
WITH paid_orders AS (
  SELECT o.* FROM public.orders o
  WHERE lower(coalesce(o.payment_status,''))='paid'
    AND coalesce(o.is_deleted,false)=false
    AND lower(coalesce(o.order_status,o.status,'')) NOT IN ('cancelled','refunded','failed')
    AND o.created_at >= CURRENT_DATE-GREATEST(COALESCE(p_days,30),1)+1
    AND (p_store_id IS NULL OR o.store_id=p_store_id)
), order_totals AS (
  SELECT oi.order_id,
         SUM(COALESCE(oi.total_price,oi.quantity*oi.unit_price,0))::numeric AS order_item_revenue,
         SUM(oi.quantity)::numeric AS order_qty
  FROM public.order_items oi JOIN paid_orders o ON o.id=oi.order_id
  GROUP BY oi.order_id
), q AS (
  SELECT oi.product_id,o.store_id,o.id order_id,
         SUM(oi.quantity)::numeric units_sold,
         SUM(COALESCE(oi.total_price,oi.quantity*oi.unit_price,0))::numeric revenue,
         SUM(oi.quantity*COALESCE(oi.cost_price,p.cost_price,0))::numeric cogs,
         (COALESCE(o.packing_cost_net,o.packing_cost,0)
          +COALESCE(o.gateway_fee_net,o.gateway_fee_actual,o.payment_fee,0)
          +GREATEST(COALESCE(o.shipping_cost_net,o.shipping_cost,0)-COALESCE(o.delivery_fee,0),0))::numeric AS net_order_variable,
         CASE WHEN ot.order_item_revenue>0 THEN SUM(COALESCE(oi.total_price,oi.quantity*oi.unit_price,0))/ot.order_item_revenue
              WHEN ot.order_qty>0 THEN SUM(oi.quantity)::numeric/ot.order_qty ELSE 0 END AS item_share
  FROM public.order_items oi
  JOIN paid_orders o ON o.id=oi.order_id
  JOIN order_totals ot ON ot.order_id=o.id
  LEFT JOIN public.products p ON p.id=oi.product_id
  WHERE oi.product_id=p_product_id
  GROUP BY oi.product_id,o.store_id,o.id,o.packing_cost_net,o.packing_cost,o.gateway_fee_net,o.gateway_fee_actual,o.payment_fee,o.shipping_cost_net,o.shipping_cost,o.delivery_fee,ot.order_item_revenue,ot.order_qty
), a AS (
  SELECT product_id,store_id,SUM(units_sold) units_sold,SUM(revenue) revenue,SUM(cogs) cogs,SUM(net_order_variable*item_share) variable_costs
  FROM q GROUP BY product_id,store_id
), latest AS (SELECT max(created_at) financial_data_as_of FROM paid_orders)
SELECT a.product_id,a.store_id,a.units_sold,a.revenue,a.cogs,a.variable_costs,
       a.revenue-a.cogs-a.variable_costs,
       CASE WHEN a.revenue=0 THEN 0 ELSE (a.revenue-a.cogs-a.variable_costs)/a.revenue*100 END,
       CASE WHEN a.units_sold=0 THEN 0 ELSE (a.revenue-a.cogs-a.variable_costs)/a.units_sold END,
       CASE WHEN a.units_sold=0 THEN 0 ELSE a.revenue/a.units_sold END,
       CASE WHEN a.units_sold=0 THEN 0 ELSE a.cogs/a.units_sold END,
       CASE WHEN a.units_sold=0 THEN 0 ELSE a.variable_costs/a.units_sold END,
       a.units_sold/GREATEST(COALESCE(p_days,30),1),latest.financial_data_as_of
FROM a CROSS JOIN latest;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_weekly_pricing_strategy(p_period_end date DEFAULT CURRENT_DATE, p_window_days integer DEFAULT 7)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_start date := p_period_end-(GREATEST(p_window_days,1)-1);
  v_orders integer; v_units numeric; v_rev numeric; v_cogs numeric; v_varc numeric; v_gross numeric; v_contrib numeric; v_opx numeric; v_fin numeric; v_tax numeric; v_net numeric;
  v_avg_o numeric; v_avg_u numeric; v_avg_rev numeric; v_avg_profit numeric; v_avg_po numeric; v_prev_profit numeric;
  v_target_week numeric; v_target_day numeric; v_growth numeric; v_target_mode text; v_gap numeric; v_status text; v_req_order numeric; v_req_unit numeric;
BEGIN
  SELECT COALESCE(SUM(orders),0)::int,COALESCE(SUM(units_sold),0),COALESCE(SUM(revenue),0),COALESCE(SUM(cogs),0),
         COALESCE(SUM(variable_costs),0),COALESCE(SUM(gross_profit),0),COALESCE(SUM(contribution_profit),0),
         COALESCE(SUM(operating_expenses),0),COALESCE(SUM(finance_costs),0),COALESCE(SUM(taxes),0),COALESCE(SUM(net_profit),0)
  INTO v_orders,v_units,v_rev,v_cogs,v_varc,v_gross,v_contrib,v_opx,v_fin,v_tax,v_net
  FROM public.v_financial_daily_pnl WHERE business_date BETWEEN v_start AND p_period_end;
  v_avg_o:=v_orders::numeric/GREATEST(p_window_days,1); v_avg_u:=v_units/GREATEST(p_window_days,1);
  v_avg_rev:=v_rev/GREATEST(p_window_days,1); v_avg_profit:=v_net/GREATEST(p_window_days,1);
  v_avg_po:=CASE WHEN v_orders>0 THEN v_net/v_orders ELSE 0 END;
  SELECT wpm.net_profit INTO v_prev_profit FROM public.weekly_profit_metrics wpm WHERE wpm.period_end=p_period_end-7 AND wpm.window_days=p_window_days;
  SELECT ps.target_mode,COALESCE(ps.weekly_target_profit,ps.daily_target_net_profit*GREATEST(p_window_days,1)),COALESCE(ps.target_growth_percent,10)
  INTO v_target_mode,v_target_week,v_growth FROM public.pricing_settings ps WHERE ps.store_id IS NULL ORDER BY ps.updated_at DESC NULLS LAST LIMIT 1;
  v_target_mode:=COALESCE(v_target_mode,'performance'); v_target_week:=COALESCE(v_target_week,100*GREATEST(p_window_days,1)); v_growth:=COALESCE(v_growth,10);
  IF v_target_mode='performance' THEN
    v_target_day:=CASE WHEN v_avg_profit>0 THEN v_avg_profit*(1+v_growth/100) ELSE v_target_week/GREATEST(p_window_days,1) END;
    v_target_week:=v_target_day*GREATEST(p_window_days,1);
  ELSE v_target_day:=v_target_week/GREATEST(p_window_days,1); END IF;
  v_gap:=v_avg_profit-v_target_day;
  v_status:=CASE WHEN v_avg_profit>=v_target_day*1.05 THEN 'ABOVE_TARGET' WHEN v_avg_profit>=v_target_day*0.95 THEN 'NEAR_TARGET' ELSE 'BELOW_TARGET' END;
  v_req_order:=CASE WHEN v_avg_o>0 THEN GREATEST(v_target_day-v_avg_profit,0)/v_avg_o ELSE 0 END;
  v_req_unit:=CASE WHEN v_avg_u>0 THEN GREATEST(v_target_day-v_avg_profit,0)/v_avg_u ELSE 0 END;
  INSERT INTO public.weekly_profit_metrics(period_end,window_days,orders_count,units_sold,revenue_net,cogs_net,variable_costs_net,operating_expenses_net,gross_profit,contribution_profit,net_profit,average_orders_per_day,average_units_per_day,average_revenue_per_day,average_profit_per_day,average_profit_per_order,comparable_previous_profit,updated_at)
  VALUES(p_period_end,p_window_days,v_orders,v_units,v_rev,v_cogs,v_varc,v_opx,v_gross,v_contrib,v_net,v_avg_o,v_avg_u,v_avg_rev,v_avg_profit,v_avg_po,v_prev_profit,now())
  ON CONFLICT(period_end,window_days) DO UPDATE SET orders_count=excluded.orders_count,units_sold=excluded.units_sold,revenue_net=excluded.revenue_net,cogs_net=excluded.cogs_net,variable_costs_net=excluded.variable_costs_net,operating_expenses_net=excluded.operating_expenses_net,gross_profit=excluded.gross_profit,contribution_profit=excluded.contribution_profit,net_profit=excluded.net_profit,average_orders_per_day=excluded.average_orders_per_day,average_units_per_day=excluded.average_units_per_day,average_revenue_per_day=excluded.average_revenue_per_day,average_profit_per_day=excluded.average_profit_per_day,average_profit_per_order=excluded.average_profit_per_order,comparable_previous_profit=excluded.comparable_previous_profit,updated_at=now();
  INSERT INTO public.weekly_pricing_strategy(period_end,target_mode,weekly_profit_target,daily_profit_target,target_growth_percent,average_orders_per_day,average_units_per_day,required_profit_per_order,required_profit_per_unit,current_average_profit_per_day,gap_to_target,status,updated_at)
  VALUES(p_period_end,v_target_mode,v_target_week,v_target_day,v_growth,v_avg_o,v_avg_u,v_req_order,v_req_unit,v_avg_profit,v_gap,v_status,now())
  ON CONFLICT(period_end) DO UPDATE SET target_mode=excluded.target_mode,weekly_profit_target=excluded.weekly_profit_target,daily_profit_target=excluded.daily_profit_target,target_growth_percent=excluded.target_growth_percent,average_orders_per_day=excluded.average_orders_per_day,average_units_per_day=excluded.average_units_per_day,required_profit_per_order=excluded.required_profit_per_order,required_profit_per_unit=excluded.required_profit_per_unit,current_average_profit_per_day=excluded.current_average_profit_per_day,gap_to_target=excluded.gap_to_target,status=excluded.status,updated_at=now();
  RETURN json_build_object('period_end',p_period_end,'window_days',p_window_days,'orders',v_orders,'units',v_units,'revenue',v_rev,'cogs',v_cogs,'variable_costs',v_varc,'operating_expenses',v_opx,'finance_costs',v_fin,'taxes',v_tax,'gross_profit',v_gross,'contribution_profit',v_contrib,'net_profit',v_net,'average_orders_per_day',v_avg_o,'average_units_per_day',v_avg_u,'average_revenue_per_day',v_avg_rev,'average_profit_per_day',v_avg_profit,'average_profit_per_order',v_avg_po,'target_mode',v_target_mode,'weekly_profit_target',v_target_week,'daily_profit_target',v_target_day,'required_profit_per_order',v_req_order,'required_profit_per_unit',v_req_unit,'gap_to_target',v_gap,'status',v_status);
END
$function$;

CREATE OR REPLACE FUNCTION public.calculate_pricing_recommendation(p_product_id uuid, p_store_id uuid DEFAULT NULL::uuid, p_freshness_hours integer DEFAULT 48)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  p record; f record; m json; s record; strat json; lookback integer;
  product_units numeric; total_units numeric; variable_per_unit numeric; direct_cost numeric; target_day numeric; current_day_profit numeric; target_gap numeric; target_profit_unit numeric;
  margin_floor numeric; profit_floor numeric; theoretical_required numeric; required numeric; cap_price numeric; market numeric; rec numeric; margin numeric; profit_unit numeric; daily_profit numeric; reason text; status text; strategy text; min_margin numeric;
BEGIN
  SELECT * INTO p FROM public.products WHERE id=p_product_id AND is_active=true AND COALESCE(is_deleted,false)=false;
  IF NOT FOUND THEN RETURN json_build_object('error','Product not found or inactive'); END IF;
  SELECT * INTO s FROM public.pricing_settings WHERE store_id IS NULL ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  lookback:=GREATEST(COALESCE(s.financial_lookback_days,s.expected_sales_window_days,30),7);
  SELECT * INTO f FROM public.get_product_pricing_financial_context(p_product_id,p_store_id,lookback);
  strat:=public.calculate_weekly_pricing_strategy(current_date,7);
  target_day:=COALESCE((strat->>'daily_profit_target')::numeric,COALESCE(s.daily_target_net_profit,100)); current_day_profit:=COALESCE((strat->>'average_profit_per_day')::numeric,0); target_gap:=GREATEST(target_day-current_day_profit,0);
  product_units:=COALESCE(f.expected_daily_units,0);
  SELECT COALESCE(SUM(oi.quantity),0)::numeric/lookback INTO total_units FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id
  WHERE lower(coalesce(o.payment_status,''))='paid' AND coalesce(o.is_deleted,false)=false AND lower(coalesce(o.order_status,o.status,'')) NOT IN ('cancelled','refunded','failed') AND o.created_at>=CURRENT_DATE-lookback+1 AND (p_store_id IS NULL OR o.store_id=p_store_id);
  total_units:=GREATEST(COALESCE(total_units,0),0); variable_per_unit:=GREATEST(COALESCE(f.financial_cost_per_unit,0),0); direct_cost:=GREATEST(COALESCE(p.cost_price,0)+variable_per_unit,0);
  min_margin:=LEAST(GREATEST(COALESCE(p.min_margin,5),0),99.99); margin_floor:=CASE WHEN direct_cost>0 THEN direct_cost/(1-min_margin/100) ELSE 0 END;
  profit_floor:=GREATEST(direct_cost,margin_floor,COALESCE(s.minimum_price_floor,0)); target_profit_unit:=CASE WHEN total_units>0 THEN target_gap/total_units ELSE 0 END;
  theoretical_required:=GREATEST(profit_floor,COALESCE(p.price,profit_floor)+target_profit_unit); cap_price:=CASE WHEN COALESCE(p.price,0)>0 THEN p.price*(1+GREATEST(COALESCE(s.max_price_increase_percent,20),0)/100) ELSE theoretical_required END;
  required:=GREATEST(profit_floor,LEAST(theoretical_required,cap_price));
  SELECT public.get_market_analytics(p_product_id,p_freshness_hours) INTO m;
  market:=CASE WHEN COALESCE((m->>'valid_competitor_count')::int,0)>=COALESCE(s.minimum_competitor_count,1) THEN COALESCE((m->>'median_competitor_price')::numeric,(m->>'lowest_competitor_price')::numeric) ELSE NULL END;
  strategy:=COALESCE(s.strategy_config->>COALESCE(p.product_type,'simple'),'standard');
  IF product_units<=0 THEN rec:=GREATEST(COALESCE(p.price,0),profit_floor); reason:=CASE WHEN COALESCE(p.price,0)<profit_floor THEN 'No paid demand history; current price is below direct economic floor, so review at the floor.' ELSE 'No paid demand history; hold current price until reliable paid sales or competitor data exists.' END; status:=CASE WHEN COALESCE(p.price,0)<profit_floor THEN 'BELOW_ECONOMIC_FLOOR' ELSE 'WAIT_FOR_DEMAND_DATA' END;
  ELSIF market IS NULL THEN rec:=required; reason:=CASE WHEN theoretical_required>cap_price THEN 'No reliable fresh competitor data. Business target cannot be reached by a safe price move alone; recommendation is constrained by the configured maximum increase.' ELSE 'No reliable fresh competitor data; use the paid-order economic target within guardrails.' END; status:=CASE WHEN theoretical_required>cap_price THEN 'TARGET_CONSTRAINED' ELSE 'ECONOMIC_ONLY' END;
  ELSIF market<profit_floor THEN rec:=GREATEST(profit_floor,LEAST(required,cap_price)); reason:='Reliable market price is below our direct economic floor; protect the floor and require review.'; status:='MARKET_BELOW_PROFIT';
  ELSE rec:=GREATEST(profit_floor,LEAST(required,CASE WHEN COALESCE(s.market_position_target,'BELOW_MARKET')='MATCH' THEN market ELSE GREATEST(market-COALESCE(s.competitor_undercut_amount,0.10),profit_floor) END)); reason:='Market data is compatible with direct economics; position within the configured target without crossing the floor.'; status:='MARKET_ALIGNED'; END IF;
  rec:=ROUND(COALESCE(rec,p.price),2); profit_unit:=rec-direct_cost; margin:=CASE WHEN rec>0 THEN profit_unit/rec*100 ELSE 0 END; daily_profit:=profit_unit*product_units;
  RETURN json_build_object('product_id',p.id,'product_name',p.name,'sku',p.sku,'current_price',p.price,'cost_price',p.cost_price,'variable_cost',variable_per_unit,'expected_daily_units',product_units,'total_daily_units',total_units,'allocated_overhead_per_unit',0,'business_overhead_reference_only',true,'target_daily_profit',target_day,'current_business_profit_per_day',current_day_profit,'target_gap_per_day',target_gap,'target_profit_per_unit',target_profit_unit,'unconstrained_target_price',theoretical_required,'profit_floor_price',profit_floor,'required_profit_price',required,'minimum_margin_floor_price',margin_floor,'competitive_target_price',market,'recommended_price',rec,'expected_profit_per_unit',profit_unit,'expected_daily_profit',daily_profit,'expected_margin',margin,'market_position',CASE WHEN market IS NULL THEN 'NO_VALID_DATA' WHEN rec<market THEN 'BELOW_MARKET' WHEN rec=market THEN 'MARKET_ALIGNED' ELSE 'ABOVE_MARKET' END,'pricing_status',status,'decision_reason',reason,'strategy',strategy,'competitor_data_quality',CASE WHEN COALESCE((m->>'valid_competitor_count')::int,0)=0 THEN 'NO_DATA' WHEN COALESCE((m->>'stale_count')::int,0)>0 THEN 'AGING' ELSE 'FRESH' END,'market_analytics',m);
END
$function$;

CREATE OR REPLACE FUNCTION public.get_pricing_control_rows(p_limit integer DEFAULT 100,p_offset integer DEFAULT 0)
RETURNS SETOF json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; rec json; opt json; merged jsonb; chosen numeric; floor numeric; current numeric; direct_cost numeric; units_day numeric; profit_unit numeric; margin numeric; daily_profit numeric; opt_strategy text; final_status text;
BEGIN
  FOR r IN SELECT id FROM public.products WHERE is_active=true AND COALESCE(is_deleted,false)=false ORDER BY name OFFSET GREATEST(COALESCE(p_offset,0),0) LIMIT 1000 LOOP
    rec:=public.calculate_pricing_recommendation(r.id,NULL,48); opt:=public.calculate_price_optimization(r.id,NULL,48); merged:=rec::jsonb||opt::jsonb;
    floor:=COALESCE((rec->>'profit_floor_price')::numeric,0); current:=COALESCE((rec->>'current_price')::numeric,0);
    direct_cost:=COALESCE((opt->>'financial_cost_per_unit')::numeric,COALESCE((rec->>'cost_price')::numeric,0)+COALESCE((rec->>'variable_cost')::numeric,0)); units_day:=COALESCE((opt->>'baseline_units_per_day')::numeric,0); opt_strategy:=COALESCE(opt->>'optimization_strategy','');
    IF opt_strategy='WAIT_FOR_DEMAND_DATA' THEN chosen:=GREATEST(current,floor); ELSE chosen:=GREATEST(floor,COALESCE((opt->>'best_scenario_price')::numeric,(rec->>'recommended_price')::numeric,current)); END IF;
    chosen:=ROUND(chosen,2); profit_unit:=chosen-direct_cost; margin:=CASE WHEN chosen>0 THEN profit_unit/chosen*100 ELSE 0 END; daily_profit:=profit_unit*units_day;
    final_status:=CASE WHEN current<floor THEN 'BELOW_ECONOMIC_FLOOR' WHEN opt_strategy='WAIT_FOR_DEMAND_DATA' THEN 'WAIT_FOR_DEMAND_DATA' ELSE COALESCE(rec->>'pricing_status','REVIEW_REQUIRED') END;
    merged:=merged||jsonb_build_object('recommended_price',chosen,'expected_profit_per_unit',profit_unit,'expected_margin',margin,'expected_daily_profit',daily_profit,'pricing_status',final_status,'variable_cost',COALESCE((rec->>'variable_cost')::numeric,0),'profit_floor_price',floor,'required_profit_price',COALESCE((rec->>'required_profit_price')::numeric,floor),'decision_reason',rec->>'decision_reason');
    RETURN NEXT merged::json;
  END LOOP;
END
$function$;

CREATE OR REPLACE FUNCTION public.get_pricing_dashboard(p_period_days integer DEFAULT 7)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t record; w record; target json; today json; d integer:=GREATEST(COALESCE(p_period_days,7),1);
BEGIN
  SELECT * INTO t FROM public.get_financial_performance(current_date,current_date,NULL); SELECT * INTO w FROM public.get_financial_performance(current_date-d+1,current_date,NULL); target:=public.calculate_weekly_pricing_strategy(current_date,d);
  today:=json_build_object('orders',t.orders,'revenue',t.revenue,'cogs',t.cogs,'variable_costs',t.variable_costs,'operating_expenses',t.operating_expenses,'gross_profit',t.gross_profit,'contribution_profit',t.contribution_profit,'net_profit',t.net_profit,'average_profit_per_order',t.average_profit_per_order);
  RETURN json_build_object('today',today,'weekly',json_build_object('orders',w.orders,'units',(target->>'units')::numeric,'revenue',w.revenue,'cogs',w.cogs,'variable_costs',w.variable_costs,'operating_expenses',w.operating_expenses,'finance_costs',w.finance_costs,'taxes',w.taxes,'gross_profit',w.gross_profit,'contribution_profit',w.contribution_profit,'net_profit',w.net_profit,'average_orders_per_day',w.orders::numeric/d,'average_units_per_day',COALESCE((target->>'average_units_per_day')::numeric,0),'average_revenue_per_day',w.revenue/d,'average_profit_per_day',w.net_profit/d,'average_profit_per_order',w.average_profit_per_order),'target',target);
END
$function$;

CREATE OR REPLACE FUNCTION public.apply_pricing_recommendation(p_product_id uuid, p_new_price numeric, p_manually_approved boolean DEFAULT false, p_initiated_by text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE old numeric; locked boolean; rec json; floor numeric;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin authorization required'; END IF;
  SELECT price INTO old FROM public.products WHERE id=p_product_id FOR UPDATE; IF old IS NULL THEN RETURN json_build_object('success',false,'error','Product not found'); END IF;
  IF p_new_price IS NULL OR p_new_price<=0 THEN RETURN json_build_object('success',false,'error','New price must be greater than zero'); END IF;
  SELECT EXISTS(SELECT 1 FROM public.price_locks WHERE product_id=p_product_id AND is_active=true) INTO locked; SELECT public.calculate_pricing_recommendation(p_product_id) INTO rec; floor:=NULLIF(rec->>'profit_floor_price','')::numeric;
  IF locked THEN RETURN json_build_object('success',false,'error','Price is locked. Unlock the product before applying a new price.'); END IF;
  IF floor IS NOT NULL AND p_new_price<floor THEN RETURN json_build_object('success',false,'error','Price is below the direct economic floor and cannot be applied from Pricing Control','profit_floor_price',floor); END IF;
  UPDATE public.products SET price=ROUND(p_new_price,2),updated_at=now() WHERE id=p_product_id;
  INSERT INTO public.price_change_audit(product_id,old_price,new_price,competitive_target,required_profit_price,final_price,lowest_competitor,average_competitor,target_profit,allocated_overhead,product_cost,strategy,decision_reason,initiated_by,manually_approved,automatically_applied)
  VALUES(p_product_id,old,ROUND(p_new_price,2),(rec->>'competitive_target_price')::numeric,(rec->>'required_profit_price')::numeric,ROUND(p_new_price,2),(rec->'market_analytics'->>'lowest_competitor_price')::numeric,(rec->'market_analytics'->>'average_competitor_price')::numeric,(rec->>'target_daily_profit')::numeric,0,(rec->>'cost_price')::numeric,(rec->>'strategy'),COALESCE(p_reason,rec->>'decision_reason'),p_initiated_by,true,false);
  INSERT INTO public.pricing_recommendation_history(product_id,current_price,recommended_price,profit_floor_price,required_profit_price,competitive_target_price,lowest_competitor,median_competitor,average_competitor,expected_daily_units,target_profit_per_unit,expected_profit_per_unit,expected_daily_profit,expected_margin,market_position,pricing_strategy,competitor_data_quality,decision_reason,status,applied_at,applied_by)
  VALUES(p_product_id,old,ROUND(p_new_price,2),(rec->>'profit_floor_price')::numeric,(rec->>'required_profit_price')::numeric,(rec->>'competitive_target_price')::numeric,(rec->'market_analytics'->>'lowest_competitor_price')::numeric,(rec->'market_analytics'->>'median_competitor_price')::numeric,(rec->'market_analytics'->>'average_competitor_price')::numeric,(rec->>'expected_daily_units')::numeric,(rec->>'target_profit_per_unit')::numeric,(ROUND(p_new_price,2)-((rec->>'cost_price')::numeric+COALESCE((rec->>'variable_cost')::numeric,0))),CASE WHEN (rec->>'expected_daily_units')::numeric>0 THEN (ROUND(p_new_price,2)-((rec->>'cost_price')::numeric+COALESCE((rec->>'variable_cost')::numeric,0)))*(rec->>'expected_daily_units')::numeric ELSE 0 END,CASE WHEN ROUND(p_new_price,2)>0 THEN (ROUND(p_new_price,2)-((rec->>'cost_price')::numeric+COALESCE((rec->>'variable_cost')::numeric,0)))/ROUND(p_new_price,2)*100 ELSE 0 END,(rec->>'market_position'),(rec->>'strategy'),(rec->>'competitor_data_quality'),COALESCE(p_reason,rec->>'decision_reason'),'applied',now(),p_initiated_by);
  RETURN json_build_object('success',true,'old_price',old,'new_price',ROUND(p_new_price,2),'recommendation',rec,'locked',locked,'manual_action',true);
END
$function$;

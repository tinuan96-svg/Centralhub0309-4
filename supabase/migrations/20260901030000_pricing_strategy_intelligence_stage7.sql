/* Stage 7: Pricing Strategy Intelligence
   - Adds price scenario optimisation
   - Uses historical price elasticity only when data quality is sufficient
   - Falls back to volume-neutral scenarios when demand history is insufficient
   - Surfaces optimisation strategy through the existing Pricing Control Centre RPC
*/

CREATE OR REPLACE FUNCTION public.calculate_price_optimization(p_product_id uuid,p_store_id uuid DEFAULT NULL,p_freshness_hours integer DEFAULT 48)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p record; f record; s record; m json; market numeric; current_price numeric; cost numeric; financial_cost numeric; units_day numeric; min_margin numeric; min_price numeric; max_inc numeric; max_dec numeric; low numeric; high numeric; step numeric; best_price numeric; best_profit numeric; current_profit numeric; best_delta numeric; strategy text; confidence text; scenarios jsonb:='[]'::jsonb; candidate numeric; scenario_profit numeric; scenario_margin numeric; scenario_position text; valid_market boolean; elasticity numeric:=NULL; elasticity_r2 numeric:=NULL; weeks integer:=0; scenario_units numeric;
BEGIN
 SELECT pr.id,pr.name,pr.price,pr.cost_price,pr.min_margin INTO p FROM public.products pr WHERE pr.id=p_product_id AND pr.is_active=true AND COALESCE(pr.is_deleted,false)=false;
 IF NOT FOUND THEN RETURN json_build_object('error','Product not found or inactive'); END IF;
 SELECT * INTO s FROM public.pricing_settings ps WHERE ps.store_id IS NULL ORDER BY ps.updated_at DESC NULLS LAST LIMIT 1;
 SELECT * INTO f FROM public.get_product_pricing_financial_context(p_product_id,p_store_id,COALESCE(s.financial_lookback_days,30));
 current_price:=COALESCE(p.price,0); cost:=COALESCE(p.cost_price,0); financial_cost:=cost+COALESCE(f.financial_cost_per_unit,0); units_day:=COALESCE(f.expected_daily_units,0); min_margin:=LEAST(GREATEST(COALESCE(p.min_margin,5),0),99.99);
 min_price:=GREATEST(financial_cost,CASE WHEN cost>0 THEN cost/(1-min_margin/100) ELSE 0 END); max_inc:=GREATEST(COALESCE(s.max_price_increase_percent,20),0); max_dec:=GREATEST(COALESCE(s.max_price_decrease_percent,20),0);
 low:=CASE WHEN current_price>0 THEN GREATEST(current_price*(1-max_dec/100),min_price) ELSE min_price END; high:=CASE WHEN current_price>0 THEN current_price*(1+max_inc/100) ELSE min_price*1.2 END; IF high<low THEN high:=low; END IF; step:=GREATEST(ROUND(current_price*0.05,2),0.01);
 SELECT public.get_market_analytics(p_product_id,p_freshness_hours) INTO m; market:=NULLIF((m->>'median_competitor_price')::numeric,0); IF market IS NULL THEN market:=NULLIF((m->>'lowest_competitor_price')::numeric,0); END IF; valid_market:=market IS NOT NULL AND market>0 AND COALESCE((m->>'valid_competitor_count')::int,0)>=COALESCE(s.minimum_competitor_count,1);
 WITH weekly AS (SELECT date_trunc('week',o.created_at) wk,SUM(oi.quantity)::numeric qty,SUM(COALESCE(oi.total_price,oi.quantity*oi.unit_price,0))/NULLIF(SUM(oi.quantity),0) price FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id WHERE oi.product_id=p_product_id AND COALESCE(o.is_deleted,false)=false AND COALESCE(o.order_status,'') NOT IN ('cancelled','refunded','failed') AND o.payment_status='paid' AND o.created_at>=CURRENT_DATE-INTERVAL '90 days' AND (p_store_id IS NULL OR o.store_id=p_store_id) GROUP BY 1 HAVING SUM(oi.quantity)>0), stats AS (SELECT COUNT(*)::int n,regr_slope(ln(qty),ln(price)) AS el,regr_r2(ln(qty),ln(price)) AS fit FROM weekly WHERE price>0) SELECT st.n,st.el,st.fit INTO weeks,elasticity,elasticity_r2 FROM stats st;
 IF weeks<6 OR elasticity IS NULL OR elasticity_r2 IS NULL OR elasticity_r2<0.20 OR elasticity>=-0.10 THEN elasticity:=NULL; END IF;
 best_price:=GREATEST(current_price,min_price); scenario_units:=units_day; IF elasticity IS NOT NULL AND current_price>0 THEN scenario_units:=units_day*power(best_price/current_price,elasticity); END IF; best_profit:=GREATEST(best_price-financial_cost,0)*scenario_units; current_profit:=GREATEST(current_price-financial_cost,0)*units_day;
 FOR candidate IN SELECT DISTINCT GREATEST(low,LEAST(high,x)) FROM generate_series(low,high,step) x UNION SELECT min_price UNION SELECT current_price UNION SELECT CASE WHEN valid_market THEN market-COALESCE(s.competitor_undercut_amount,0.10) ELSE NULL END LOOP
  IF candidate IS NULL OR candidate<min_price OR candidate<low OR candidate>high THEN CONTINUE; END IF; candidate:=ROUND(candidate,2); scenario_units:=CASE WHEN elasticity IS NOT NULL AND current_price>0 THEN units_day*power(candidate/current_price,elasticity) ELSE units_day END; scenario_profit:=GREATEST(candidate-financial_cost,0)*scenario_units; scenario_margin:=CASE WHEN candidate>0 THEN GREATEST(candidate-financial_cost,0)/candidate*100 ELSE 0 END; scenario_position:=CASE WHEN NOT valid_market THEN 'NO_MARKET_DATA' WHEN candidate<market THEN 'BELOW_MARKET' WHEN candidate=market THEN 'MARKET_ALIGNED' ELSE 'ABOVE_MARKET' END;
  scenarios:=scenarios||jsonb_build_object('price',candidate,'price_change_percent',CASE WHEN current_price>0 THEN ROUND((candidate/current_price-1)*100,2) ELSE NULL END,'expected_daily_units',ROUND(scenario_units,3),'expected_daily_profit',ROUND(scenario_profit,2),'expected_profit_per_unit',ROUND(GREATEST(candidate-financial_cost,0),2),'expected_margin',ROUND(scenario_margin,2),'market_position',scenario_position,'volume_assumption',CASE WHEN elasticity IS NULL THEN 'HOLD_CURRENT_SALES_RATE' ELSE 'ELASTICITY_MODEL' END);
  IF scenario_profit>best_profit THEN best_profit:=scenario_profit; best_price:=candidate; END IF;
 END LOOP;
 best_delta:=CASE WHEN current_price>0 THEN (best_price/current_price-1)*100 ELSE NULL END;
 IF units_day<=0 THEN strategy:='WAIT_FOR_DEMAND_DATA'; confidence:='LOW'; ELSIF best_price<current_price AND best_profit>current_profit*1.02 THEN strategy:='LOWER_PRICE_TEST'; confidence:=CASE WHEN elasticity IS NOT NULL AND valid_market THEN 'HIGH' ELSE 'MEDIUM' END; ELSIF best_price>current_price AND best_profit>current_profit*1.02 THEN strategy:='INCREASE_MARGIN'; confidence:=CASE WHEN elasticity IS NOT NULL AND valid_market THEN 'HIGH' ELSE 'MEDIUM' END; ELSIF best_price=current_price OR best_profit<=current_profit*1.02 THEN strategy:='HOLD_PRICE'; confidence:=CASE WHEN valid_market THEN 'HIGH' ELSE 'MEDIUM' END; ELSE strategy:='REVIEW_SUPPLIER_COST'; confidence:='LOW'; END IF;
 IF current_profit>0 AND best_profit<current_profit*1.02 AND financial_cost>=current_price THEN strategy:='REVIEW_SUPPLIER_COST'; confidence:='LOW'; END IF;
 RETURN json_build_object('product_id',p.id,'product_name',p.name,'current_price',current_price,'financial_cost_per_unit',ROUND(financial_cost,2),'baseline_units_per_day',ROUND(units_day,3),'current_expected_daily_profit',ROUND(current_profit,2),'best_scenario_price',ROUND(best_price,2),'best_scenario_daily_profit',ROUND(best_profit,2),'best_price_change_percent',ROUND(best_delta,2),'minimum_economic_price',ROUND(min_price,2),'scenario_low_price',ROUND(low,2),'scenario_high_price',ROUND(high,2),'optimization_strategy',strategy,'confidence',confidence,'scenario_method',CASE WHEN elasticity IS NULL THEN 'VOLUME_NEUTRAL_HISTORICAL_RATE' ELSE 'HISTORICAL_PRICE_ELASTICITY' END,'demand_elasticity_used',elasticity IS NOT NULL,'estimated_price_elasticity',elasticity,'elasticity_r2',elasticity_r2,'elasticity_weeks',weeks,'market_price',market,'market_data_valid',valid_market,'market_analytics',m,'scenarios',scenarios);
END $$;
GRANT EXECUTE ON FUNCTION public.calculate_price_optimization(uuid,uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_pricing_control_rows(p_limit integer DEFAULT 100,p_offset integer DEFAULT 0)
RETURNS SETOF json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; rec json; opt json;
BEGIN
 FOR r IN SELECT id FROM public.products WHERE is_active=true AND COALESCE(is_deleted,false)=false ORDER BY name LIMIT GREATEST(p_limit,1) OFFSET GREATEST(p_offset,0) LOOP
   rec:=public.calculate_pricing_recommendation(r.id,NULL,48);
   opt:=public.calculate_price_optimization(r.id,NULL,48);
   RETURN NEXT ((rec::jsonb || opt::jsonb)::json);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.get_pricing_control_rows(integer,integer) TO authenticated;

ALTER TABLE public.pricing_suggestions ADD COLUMN IF NOT EXISTS optimization_strategy text;
ALTER TABLE public.pricing_suggestions ADD COLUMN IF NOT EXISTS optimization_score numeric;
ALTER TABLE public.pricing_suggestions ADD COLUMN IF NOT EXISTS scenario_best_price numeric;
ALTER TABLE public.pricing_suggestions ADD COLUMN IF NOT EXISTS scenario_best_daily_profit numeric;
ALTER TABLE public.pricing_suggestions ADD COLUMN IF NOT EXISTS scenario_method text;
ALTER TABLE public.pricing_suggestions ADD COLUMN IF NOT EXISTS scenario_json jsonb;

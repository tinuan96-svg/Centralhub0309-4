-- Stage 8: portfolio-level profit optimisation control centre
-- Uses existing pricing_suggestions/product/pricing infrastructure. No duplicate product or pricing tables.

CREATE OR REPLACE VIEW public.v_profit_optimization_latest AS
WITH latest AS (
  SELECT DISTINCT ON (ps.product_id, ps.store_id) ps.*
  FROM public.pricing_suggestions ps
  ORDER BY ps.product_id, ps.store_id, ps.generated_at DESC
)
SELECT l.id suggestion_id,l.product_id,l.store_id,p.name product_name,p.sku,
COALESCE(l.current_price,p.price,0) current_price,
COALESCE(l.recommended_price,l.final_price,l.suggested_price,l.current_price,p.price,0) recommended_price,
COALESCE(l.cost_price,p.cost_price,0) cost_price,COALESCE(l.financial_cost_per_unit,0) financial_cost_per_unit,
COALESCE(l.expected_profit_per_unit,0) expected_profit_per_unit,COALESCE(l.expected_daily_profit,0) expected_daily_profit,
COALESCE(l.expected_daily_units,0) expected_daily_units,COALESCE(l.expected_contribution_profit,0) expected_contribution_profit,
COALESCE(l.expected_contribution_margin,0) expected_contribution_margin,COALESCE(l.current_daily_net_profit,0) current_daily_net_profit,
COALESCE(l.daily_profit_gap,0) daily_profit_gap,COALESCE(l.required_incremental_profit_per_unit,0) required_incremental_profit_per_unit,
COALESCE(l.scenario_best_price,l.recommended_price,l.final_price,l.suggested_price,l.current_price,p.price,0) scenario_best_price,
COALESCE(l.scenario_best_daily_profit,0) scenario_best_daily_profit,COALESCE(l.optimization_score,0) optimization_score,
COALESCE(l.optimization_strategy,'HOLD_PRICE') optimization_strategy,COALESCE(l.pricing_status,l.recommendation_status,'pending') pricing_status,
COALESCE(l.price_locked,false) price_locked,COALESCE(l.requires_approval,true) requires_approval,COALESCE(l.competitor_data_quality,'unknown') competitor_data_quality,
l.competitor_freshness_hours,l.financial_data_as_of,l.scenario_method,l.scenario_json,l.generated_at
FROM latest l JOIN public.products p ON p.id=l.product_id WHERE COALESCE(p.is_deleted,false)=false;
GRANT SELECT ON public.v_profit_optimization_latest TO authenticated;

CREATE OR REPLACE FUNCTION public.get_profit_optimization_summary(p_store_id uuid DEFAULT NULL)
RETURNS TABLE(daily_target numeric,current_daily_net_profit numeric,daily_profit_gap numeric,current_product_daily_profit numeric,optimized_product_daily_profit numeric,recoverable_daily_profit numeric,recoverable_gap_percent numeric,products_reviewed bigint,increase_margin_count bigint,lower_price_test_count bigint,hold_price_count bigint,supplier_cost_review_count bigint,wait_for_data_count bigint,locked_count bigint,approval_count bigint,generated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
WITH s AS (SELECT * FROM public.get_daily_profit_pricing_target(p_store_id)), q AS (SELECT * FROM public.v_profit_optimization_latest WHERE (p_store_id IS NULL OR store_id=p_store_id)), a AS (
SELECT COALESCE(SUM(CASE WHEN q.expected_daily_units>0 THEN ((q.current_price-q.cost_price-q.financial_cost_per_unit)*q.expected_daily_units) ELSE 0 END),0) current_product_profit,
COALESCE(SUM(q.scenario_best_daily_profit),0) optimized_product_profit,COUNT(*) reviewed,
COUNT(*) FILTER (WHERE q.optimization_strategy='INCREASE_MARGIN') increase_count,COUNT(*) FILTER (WHERE q.optimization_strategy='LOWER_PRICE_TEST') lower_count,
COUNT(*) FILTER (WHERE q.optimization_strategy='HOLD_PRICE') hold_count,COUNT(*) FILTER (WHERE q.optimization_strategy='REVIEW_SUPPLIER_COST') supplier_count,
COUNT(*) FILTER (WHERE q.optimization_strategy='WAIT_FOR_DEMAND_DATA') wait_count,COUNT(*) FILTER (WHERE q.price_locked) locked_count,
COUNT(*) FILTER (WHERE q.requires_approval AND NOT q.price_locked) approval_count,MAX(q.generated_at) generated FROM q), z AS (
SELECT COALESCE((SELECT daily_target FROM s),0) target,COALESCE((SELECT current_daily_net_profit FROM s),0) current_net,COALESCE((SELECT gap FROM s),0) gap,a.* FROM a)
SELECT target,current_net,gap,current_product_profit,optimized_product_profit,GREATEST(optimized_product_profit-current_product_profit,0),
CASE WHEN gap<=0 THEN 100 ELSE LEAST(GREATEST(GREATEST(optimized_product_profit-current_product_profit,0)/gap*100,0),100) END,
reviewed,increase_count,lower_count,hold_count,supplier_count,wait_count,locked_count,approval_count,generated FROM z;
$$;
GRANT EXECUTE ON FUNCTION public.get_profit_optimization_summary(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_profit_optimization_opportunities(p_store_id uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS TABLE(product_id uuid,store_id uuid,product_name text,sku text,optimization_strategy text,current_price numeric,recommended_price numeric,price_change_percent numeric,current_expected_daily_profit numeric,optimized_daily_profit numeric,incremental_daily_profit numeric,daily_profit_gap numeric,optimization_score numeric,priority text,action text,price_locked boolean,requires_approval boolean,reason text,generated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
WITH q AS (SELECT v.*,COALESCE(s.reason,s.decision_reason) reason FROM public.v_profit_optimization_latest v LEFT JOIN public.pricing_suggestions s ON s.id=v.suggestion_id WHERE (p_store_id IS NULL OR v.store_id=p_store_id)), x AS (
SELECT q.*,GREATEST(q.scenario_best_daily_profit-((q.current_price-q.cost_price-q.financial_cost_per_unit)*q.expected_daily_units),0) incremental FROM q)
SELECT product_id,store_id,product_name,sku,optimization_strategy,current_price,recommended_price,
CASE WHEN current_price=0 THEN 0 ELSE (recommended_price-current_price)/current_price*100 END,
((current_price-cost_price-financial_cost_per_unit)*expected_daily_units),scenario_best_daily_profit,incremental,daily_profit_gap,optimization_score,
CASE WHEN optimization_strategy='REVIEW_SUPPLIER_COST' THEN 'HIGH' WHEN incremental>0 THEN 'HIGH' WHEN optimization_strategy IN ('INCREASE_MARGIN','LOWER_PRICE_TEST') THEN 'MEDIUM' ELSE 'LOW' END,
CASE WHEN optimization_strategy='REVIEW_SUPPLIER_COST' THEN 'Review supplier cost' WHEN price_locked THEN 'Price locked — review only' WHEN requires_approval THEN 'Review and approve price change' WHEN optimization_strategy='WAIT_FOR_DEMAND_DATA' THEN 'Collect more demand data' WHEN optimization_strategy='HOLD_PRICE' THEN 'Hold current price' ELSE 'Run recommended price test' END,
price_locked,requires_approval,reason,generated_at FROM x
ORDER BY CASE WHEN optimization_strategy='REVIEW_SUPPLIER_COST' THEN 0 WHEN incremental>0 THEN 1 ELSE 2 END,incremental DESC,optimization_score DESC NULLS LAST
LIMIT GREATEST(COALESCE(p_limit,100),1);
$$;
GRANT EXECUTE ON FUNCTION public.get_profit_optimization_opportunities(uuid,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
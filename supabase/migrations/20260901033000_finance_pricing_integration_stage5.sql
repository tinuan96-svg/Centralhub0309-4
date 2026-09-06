-- Finance -> Pricing integration
-- Makes Finance Control Centre the authoritative financial context for pricing.

CREATE OR REPLACE FUNCTION public.get_pricing_financial_context(p_store_id uuid DEFAULT NULL,p_days integer DEFAULT 30)
RETURNS TABLE(period_days integer,revenue numeric,cogs numeric,variable_costs numeric,operating_expenses numeric,net_profit numeric,orders bigint,units_sold numeric,profit_per_order numeric,profit_per_unit numeric,daily_net_profit numeric,daily_operating_expenses numeric,financial_cost_per_unit numeric,financial_data_as_of timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
WITH s AS (SELECT GREATEST(COALESCE(p_days,30),1) d),
x AS (SELECT * FROM public.get_finance_period_summary(CURRENT_DATE-(SELECT d FROM s)+1,CURRENT_DATE,p_store_id)),
latest AS (SELECT max(business_date)::timestamptz+interval '23:59:59' as asof FROM public.v_financial_daily_pnl WHERE (p_store_id IS NULL OR store_id=p_store_id))
SELECT (SELECT d FROM s),x.revenue,x.cogs,x.variable_costs,x.operating_expenses,x.net_profit,x.orders,x.units_sold,
CASE WHEN x.orders>0 THEN x.net_profit/x.orders ELSE 0 END,
CASE WHEN x.units_sold>0 THEN x.net_profit/x.units_sold ELSE 0 END,
x.net_profit/(SELECT d FROM s),x.operating_expenses/(SELECT d FROM s),
CASE WHEN x.units_sold>0 THEN (x.variable_costs+x.operating_expenses)/x.units_sold ELSE 0 END,latest.asof
FROM x CROSS JOIN latest;
$$;
GRANT EXECUTE ON FUNCTION public.get_pricing_financial_context(uuid,integer) TO authenticated;

DROP FUNCTION IF EXISTS public.get_product_pricing_financial_context(uuid,uuid,integer);
CREATE OR REPLACE FUNCTION public.get_product_pricing_financial_context(p_product_id uuid,p_store_id uuid DEFAULT NULL,p_days integer DEFAULT 30)
RETURNS TABLE(product_id uuid,store_id uuid,units_sold numeric,revenue numeric,cogs numeric,variable_costs numeric,contribution_profit numeric,contribution_margin numeric,profit_per_unit numeric,avg_selling_price numeric,avg_cost_price numeric,financial_cost_per_unit numeric,expected_daily_units numeric,financial_data_as_of timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
WITH q AS (
SELECT oi.product_id,o.store_id,o.id order_id,SUM(oi.quantity)::numeric units_sold,
SUM(COALESCE(oi.total_price,oi.quantity*oi.unit_price,0)) revenue,
SUM(oi.quantity*COALESCE(oi.cost_price,p.cost_price,0)) cogs,
COALESCE(MAX(COALESCE(o.packing_cost_net,o.packing_cost,0)+COALESCE(o.shipping_cost_net,o.shipping_cost,0)+COALESCE(o.gateway_fee_net,o.gateway_fee_actual,o.payment_fee,0)),0) order_variable,
SUM(oi.quantity)::numeric/NULLIF(SUM(SUM(oi.quantity)) OVER(PARTITION BY o.id),0) item_share
FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id LEFT JOIN public.products p ON p.id=oi.product_id
WHERE oi.product_id=p_product_id AND COALESCE(o.is_deleted,false)=false AND COALESCE(o.order_status,'') NOT IN ('cancelled','refunded','failed')
AND o.created_at>=CURRENT_DATE-GREATEST(COALESCE(p_days,30),1)+1 AND (p_store_id IS NULL OR o.store_id=p_store_id)
GROUP BY oi.product_id,o.store_id,o.id),
a AS (SELECT product_id,store_id,SUM(units_sold) units_sold,SUM(revenue) revenue,SUM(cogs)cogs,SUM(order_variable*item_share) variable_costs FROM q GROUP BY product_id,store_id),
latest AS (SELECT max(created_at) financial_data_as_of FROM public.orders WHERE COALESCE(is_deleted,false)=false)
SELECT a.product_id,a.store_id,a.units_sold,a.revenue,a.cogs,a.variable_costs,a.revenue-a.cogs-a.variable_costs,
CASE WHEN a.revenue=0 THEN 0 ELSE (a.revenue-a.cogs-a.variable_costs)/a.revenue*100 END,
CASE WHEN a.units_sold=0 THEN 0 ELSE (a.revenue-a.cogs-a.variable_costs)/a.units_sold END,
CASE WHEN a.units_sold=0 THEN 0 ELSE a.revenue/a.units_sold END,
CASE WHEN a.units_sold=0 THEN 0 ELSE a.cogs/a.units_sold END,
CASE WHEN a.units_sold=0 THEN 0 ELSE a.variable_costs/a.units_sold END,
a.units_sold/GREATEST(COALESCE(p_days,30),1),latest.financial_data_as_of
FROM a CROSS JOIN latest;
$$;
GRANT EXECUTE ON FUNCTION public.get_product_pricing_financial_context(uuid,uuid,integer) TO authenticated;

CREATE OR REPLACE VIEW public.v_pricing_financial_context AS
SELECT p.id product_id,p.name,p.cost_price,p.price,COALESCE(f.units_sold,0) units_sold,COALESCE(f.revenue,0) revenue,COALESCE(f.cogs,0)cogs,COALESCE(f.variable_costs,0)variable_costs,COALESCE(f.contribution_profit,0)contribution_profit,COALESCE(f.contribution_margin,0)contribution_margin,COALESCE(f.profit_per_unit,0)profit_per_unit,COALESCE(f.avg_selling_price,0)avg_selling_price,COALESCE(f.avg_cost_price,p.cost_price,0)avg_cost_price,COALESCE(f.financial_cost_per_unit,0)financial_cost_per_unit,COALESCE(f.expected_daily_units,0)expected_daily_units,f.financial_data_as_of
FROM public.products p LEFT JOIN LATERAL public.get_product_pricing_financial_context(p.id,NULL,30) f ON true
WHERE COALESCE(p.is_deleted,false)=false;
GRANT SELECT ON public.v_pricing_financial_context TO authenticated;

ALTER TABLE public.pricing_settings ADD COLUMN IF NOT EXISTS financial_source text NOT NULL DEFAULT 'finance_control_centre';
ALTER TABLE public.pricing_settings ADD COLUMN IF NOT EXISTS financial_lookback_days integer NOT NULL DEFAULT 30;
ALTER TABLE public.pricing_settings ADD COLUMN IF NOT EXISTS use_actual_financial_costs boolean NOT NULL DEFAULT true;
ALTER TABLE public.pricing_settings ADD COLUMN IF NOT EXISTS minimum_financial_data_days integer NOT NULL DEFAULT 7;

CREATE OR REPLACE FUNCTION public.get_daily_profit_pricing_target(p_store_id uuid DEFAULT NULL)
RETURNS TABLE(daily_target numeric,current_daily_net_profit numeric,gap numeric,required_incremental_daily_profit numeric,actual_units_per_day numeric,required_profit_per_unit numeric,lookback_days integer,source text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
WITH ps AS (SELECT COALESCE(daily_target_net_profit,0) target,COALESCE(financial_lookback_days,30) days FROM public.pricing_settings WHERE p_store_id IS NOT DISTINCT FROM store_id ORDER BY updated_at DESC LIMIT 1),
f AS (SELECT * FROM public.get_pricing_financial_context(p_store_id,COALESCE((SELECT days FROM ps),30))),
z AS (SELECT COALESCE((SELECT target FROM ps),0) target,COALESCE(f.daily_net_profit,0) current_daily_net_profit,COALESCE(f.units_sold,0)/GREATEST(f.period_days,1) actual_units_per_day,f.period_days FROM f)
SELECT target,current_daily_net_profit,GREATEST(target-current_daily_net_profit,0),GREATEST(target-current_daily_net_profit,0),actual_units_per_day,
CASE WHEN actual_units_per_day>0 THEN GREATEST(target-current_daily_net_profit,0)/actual_units_per_day ELSE 0 END,period_days,'finance_control_centre' FROM z;
$$;
GRANT EXECUTE ON FUNCTION public.get_daily_profit_pricing_target(uuid) TO authenticated;

NOTIFY pgrst,'reload schema';

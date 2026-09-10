-- Keep full pricing precision internally while presenting human-friendly dashboard ratios.
-- This affects display-oriented RPC output only; no pricing recommendation or product price is changed.

CREATE OR REPLACE FUNCTION public.get_pricing_dashboard(p_period_days integer DEFAULT 7)
RETURNS json
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  t record;
  w record;
  target json;
  today json;
  d integer := GREATEST(COALESCE(p_period_days,7),1);
BEGIN
  SELECT * INTO t FROM public.get_financial_performance(current_date,current_date,NULL);
  SELECT * INTO w FROM public.get_financial_performance(current_date-d+1,current_date,NULL);
  target := public.calculate_weekly_pricing_strategy(current_date,d);

  today := json_build_object(
    'orders', t.orders,
    'revenue', t.revenue,
    'cogs', t.cogs,
    'variable_costs', t.variable_costs,
    'operating_expenses', t.operating_expenses,
    'gross_profit', t.gross_profit,
    'contribution_profit', t.contribution_profit,
    'net_profit', t.net_profit,
    'average_profit_per_order', t.average_profit_per_order
  );

  RETURN json_build_object(
    'today', today,
    'weekly', json_build_object(
      'orders', w.orders,
      'units', (target->>'units')::numeric,
      'revenue', w.revenue,
      'cogs', w.cogs,
      'variable_costs', w.variable_costs,
      'operating_expenses', w.operating_expenses,
      'finance_costs', w.finance_costs,
      'taxes', w.taxes,
      'gross_profit', w.gross_profit,
      'contribution_profit', w.contribution_profit,
      'net_profit', w.net_profit,
      'average_orders_per_day', ROUND(w.orders::numeric/d, 2),
      'average_units_per_day', ROUND(COALESCE((target->>'average_units_per_day')::numeric,0), 2),
      'average_revenue_per_day', w.revenue/d,
      'average_profit_per_day', w.net_profit/d,
      'average_profit_per_order', w.average_profit_per_order
    ),
    'target', target
  );
END
$function$;

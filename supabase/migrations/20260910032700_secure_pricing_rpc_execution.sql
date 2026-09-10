-- Pricing intelligence is an authenticated CentralHub admin capability.
REVOKE EXECUTE ON FUNCTION public.calculate_weekly_pricing_strategy(date,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.calculate_pricing_recommendation(uuid,uuid,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.calculate_required_profit_price(uuid,numeric,integer,numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_pricing_control_rows(integer,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.run_daily_pricing_optimization(uuid,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_pricing_suggestion_stale_on_competitor_change() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reset_pricing_suggestion_safety_on_regeneration() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.populate_pricing_finance_snapshot() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.calculate_weekly_pricing_strategy(date,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_pricing_recommendation(uuid,uuid,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_required_profit_price(uuid,numeric,integer,numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pricing_control_rows(integer,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_daily_pricing_optimization(uuid,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_pricing_suggestion_stale_on_competitor_change() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_pricing_suggestion_safety_on_regeneration() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.populate_pricing_finance_snapshot() TO authenticated, service_role;

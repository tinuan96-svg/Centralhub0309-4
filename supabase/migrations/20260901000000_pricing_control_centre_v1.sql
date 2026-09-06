/* Pricing Control Centre v1 — idempotent schema/functions used by the live Supabase pricing upgrade.
   Product master remains products. No store_products or parallel product sync is introduced. */

ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS target_mode text DEFAULT 'performance';
ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS weekly_target_profit numeric;
ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS target_growth_percent numeric DEFAULT 10;
ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS units_7d_weight numeric DEFAULT 0.7;
ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS units_30d_weight numeric DEFAULT 0.3;
ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS minimum_competitor_count integer DEFAULT 1;
ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS market_position_target text DEFAULT 'BELOW_MARKET';
ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS target_buffer_percent numeric DEFAULT 0;
ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS strategy_config jsonb DEFAULT '{}'::jsonb;

ALTER TABLE product_economics ADD COLUMN IF NOT EXISTS variable_cost_per_unit numeric DEFAULT 0;
ALTER TABLE product_economics ADD COLUMN IF NOT EXISTS packaging_cost_per_unit numeric DEFAULT 0;
ALTER TABLE product_economics ADD COLUMN IF NOT EXISTS payment_cost_per_unit numeric DEFAULT 0;
ALTER TABLE product_economics ADD COLUMN IF NOT EXISTS profit_floor_price numeric;
ALTER TABLE product_economics ADD COLUMN IF NOT EXISTS target_economic_price numeric;
ALTER TABLE product_economics ADD COLUMN IF NOT EXISTS recent_daily_units numeric;
ALTER TABLE product_economics ADD COLUMN IF NOT EXISTS units_sold_7d integer DEFAULT 0;
ALTER TABLE product_economics ADD COLUMN IF NOT EXISTS units_sold_30d integer DEFAULT 0;
ALTER TABLE product_economics ADD COLUMN IF NOT EXISTS days_of_cover numeric;
ALTER TABLE product_economics ADD COLUMN IF NOT EXISTS pricing_strategy text DEFAULT 'standard';

ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS variable_cost numeric DEFAULT 0;
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS profit_floor_price numeric;
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS target_economic_price numeric;
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS recommended_price numeric;
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS expected_profit_per_unit numeric;
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS expected_daily_profit numeric;
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS pricing_status text;
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS competitor_data_quality text;
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS competitor_freshness_hours numeric;
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS requires_approval boolean DEFAULT true;
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS price_locked boolean DEFAULT false;
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS target_profit_per_unit numeric;
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS expected_daily_units numeric;
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS target_mode text;

ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS name text DEFAULT 'Pricing Rule';
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS store_id uuid;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS category_id uuid;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS type text DEFAULT 'percentage';
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS action text DEFAULT 'markup';
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS value numeric DEFAULT 0;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS priority integer DEFAULT 0;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS pricing_recommendation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
  current_price numeric, recommended_price numeric, profit_floor_price numeric, required_profit_price numeric,
  competitive_target_price numeric, lowest_competitor numeric, median_competitor numeric, average_competitor numeric,
  expected_daily_units numeric, target_profit_per_unit numeric, expected_profit_per_unit numeric, expected_daily_profit numeric,
  expected_margin numeric, market_position text, pricing_strategy text, competitor_data_quality text, decision_reason text,
  status text NOT NULL DEFAULT 'recommended', rejected_reason text, applied_at timestamptz, applied_by text
);
CREATE INDEX IF NOT EXISTS idx_prh_product_created ON pricing_recommendation_history(product_id,created_at DESC);
ALTER TABLE pricing_recommendation_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pricing_recommendation_history_select ON pricing_recommendation_history;
DROP POLICY IF EXISTS pricing_recommendation_history_insert ON pricing_recommendation_history;
CREATE POLICY pricing_recommendation_history_select ON pricing_recommendation_history FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY pricing_recommendation_history_insert ON pricing_recommendation_history FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE TABLE IF NOT EXISTS weekly_profit_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period_end date NOT NULL, window_days integer NOT NULL DEFAULT 7,
  orders_count integer NOT NULL DEFAULT 0, units_sold numeric NOT NULL DEFAULT 0, revenue_net numeric NOT NULL DEFAULT 0,
  cogs_net numeric NOT NULL DEFAULT 0, variable_costs_net numeric NOT NULL DEFAULT 0, operating_expenses_net numeric NOT NULL DEFAULT 0,
  gross_profit numeric NOT NULL DEFAULT 0, contribution_profit numeric NOT NULL DEFAULT 0, net_profit numeric NOT NULL DEFAULT 0,
  average_orders_per_day numeric NOT NULL DEFAULT 0, average_units_per_day numeric NOT NULL DEFAULT 0,
  average_revenue_per_day numeric NOT NULL DEFAULT 0, average_profit_per_day numeric NOT NULL DEFAULT 0,
  average_profit_per_order numeric NOT NULL DEFAULT 0, comparable_previous_profit numeric, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(period_end,window_days)
);
CREATE INDEX IF NOT EXISTS idx_wpm_period ON weekly_profit_metrics(period_end DESC,window_days);
ALTER TABLE weekly_profit_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS weekly_profit_metrics_select ON weekly_profit_metrics;
CREATE POLICY weekly_profit_metrics_select ON weekly_profit_metrics FOR SELECT TO authenticated USING (is_admin());

CREATE TABLE IF NOT EXISTS weekly_pricing_strategy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period_end date NOT NULL UNIQUE, target_mode text NOT NULL DEFAULT 'performance',
  weekly_profit_target numeric NOT NULL DEFAULT 0, daily_profit_target numeric NOT NULL DEFAULT 0, target_growth_percent numeric NOT NULL DEFAULT 10,
  average_orders_per_day numeric NOT NULL DEFAULT 0, average_units_per_day numeric NOT NULL DEFAULT 0,
  required_profit_per_order numeric NOT NULL DEFAULT 0, required_profit_per_unit numeric NOT NULL DEFAULT 0,
  current_average_profit_per_day numeric NOT NULL DEFAULT 0, gap_to_target numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'BELOW_TARGET', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE weekly_pricing_strategy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS weekly_pricing_strategy_select ON weekly_pricing_strategy;
DROP POLICY IF EXISTS weekly_pricing_strategy_write ON weekly_pricing_strategy;
CREATE POLICY weekly_pricing_strategy_select ON weekly_pricing_strategy FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY weekly_pricing_strategy_write ON weekly_pricing_strategy FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION get_market_analytics(p_product_id uuid, p_freshness_hours integer DEFAULT 48)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r json;
BEGIN
  SELECT json_build_object('product_id',p_product_id,'lowest_competitor_price',MIN(cp.price),'highest_competitor_price',MAX(cp.price),
    'average_competitor_price',AVG(cp.price),'median_competitor_price',percentile_cont(0.5) within group(order by cp.price),
    'valid_competitor_count',COUNT(*),'in_stock_count',COUNT(*),'fresh_competitor_count',COUNT(*) FILTER (WHERE cp.last_scanned_at >= now()-make_interval(hours=>p_freshness_hours)),
    'stale_count',COUNT(*) FILTER (WHERE cp.last_scanned_at IS NULL OR cp.last_scanned_at < now()-make_interval(hours=>p_freshness_hours)),
    'cheapest_competitor_id',(array_agg(cp.competitor_id order by cp.price))[1],
    'cheapest_competitor_name',(array_agg(c.name order by cp.price))[1],'cheapest_competitor_url',(array_agg(cp.product_url order by cp.price))[1],
    'freshest_scan_at',MAX(cp.last_scanned_at),'has_sale_prices',COUNT(*) FILTER (WHERE cp.source_sale_price IS NOT NULL)>0,
    'sale_price_lowest',MIN(cp.source_sale_price) FILTER (WHERE cp.source_sale_price IS NOT NULL)) INTO r
  FROM competitor_prices cp JOIN competitors c ON c.id=cp.competitor_id
  WHERE cp.product_id=p_product_id AND cp.price>0 AND cp.scan_status='success' AND cp.match_status IN ('automatic','manual')
    AND COALESCE(cp.match_confidence,1)>=0.80 AND COALESCE(cp.brand_match,true) AND COALESCE(cp.size_match,true)
    AND COALESCE(cp.product_type_match,true) AND COALESCE(cp.is_conditional,false)=false
    AND (cp.source_stock_status IS NULL OR lower(cp.source_stock_status) NOT IN ('out of stock','outofstock','unavailable'))
    AND cp.last_scanned_at >= now()-make_interval(hours=>p_freshness_hours) AND COALESCE(cp.source_sale_price,0)<=0;
  RETURN COALESCE(r,json_build_object('product_id',p_product_id,'valid_competitor_count',0));
END $$;

CREATE OR REPLACE FUNCTION get_pricing_control_rows(p_limit integer DEFAULT 100,p_offset integer DEFAULT 0)
RETURNS SETOF json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; rec json;
BEGIN
  FOR r IN SELECT id FROM products WHERE is_active=true AND COALESCE(is_deleted,false)=false ORDER BY name LIMIT GREATEST(p_limit,1) OFFSET GREATEST(p_offset,0) LOOP
    rec:=calculate_pricing_recommendation(r.id,NULL,48); RETURN NEXT rec;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION get_pricing_dashboard(p_period_days integer DEFAULT 7)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record; w record; target json; today json; opx numeric;
BEGIN
  SELECT COUNT(*) orders,COALESCE(SUM(total_net),0) revenue,COALESCE(SUM(product_cost_net),0) cogs,
    COALESCE(SUM(packing_cost_net+shipping_cost_net+gateway_fee_net),0) variable_costs,
    COALESCE(SUM(total_net-product_cost_net),0) gross_profit,
    COALESCE(SUM(total_net-product_cost_net-packing_cost_net-shipping_cost_net-gateway_fee_net),0) contribution_profit
    INTO t FROM orders WHERE payment_status='paid' AND COALESCE(is_deleted,false)=false AND created_at>=current_date AND created_at<current_date+interval '1 day';
  SELECT COUNT(DISTINCT o.id) orders,COALESCE(SUM(oi.quantity),0) units,COALESCE(SUM(o.total_net),0) revenue,
    COALESCE(SUM(o.product_cost_net),0) cogs,COALESCE(SUM(o.packing_cost_net+o.shipping_cost_net+o.gateway_fee_net),0) variable_costs,
    COALESCE(SUM(o.total_net-o.product_cost_net),0) gross_profit,
    COALESCE(SUM(o.total_net-o.product_cost_net-o.packing_cost_net-o.shipping_cost_net-o.gateway_fee_net),0) contribution_profit
    INTO w FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id
    WHERE o.payment_status='paid' AND COALESCE(o.is_deleted,false)=false AND o.created_at>=now()-(p_period_days||' days')::interval;
  SELECT COALESCE(SUM(amount_gross),0) INTO opx FROM expenses WHERE invoice_date>=now()-(p_period_days||' days')::interval;
  target:=calculate_weekly_pricing_strategy(current_date,p_period_days);
  today:=json_build_object('orders',t.orders,'revenue',t.revenue,'cogs',t.cogs,'variable_costs',t.variable_costs,'operating_expenses',0,
    'gross_profit',t.gross_profit,'contribution_profit',t.contribution_profit,'net_profit',t.contribution_profit,
    'average_profit_per_order',CASE WHEN t.orders>0 THEN t.contribution_profit/t.orders ELSE 0 END);
  RETURN json_build_object('today',today,'weekly',json_build_object('orders',w.orders,'units',w.units,'revenue',w.revenue,'cogs',w.cogs,
    'variable_costs',w.variable_costs,'operating_expenses',opx,'gross_profit',w.gross_profit,'contribution_profit',w.contribution_profit,
    'net_profit',w.contribution_profit-opx,'average_orders_per_day',w.orders::numeric/p_period_days,'average_units_per_day',w.units::numeric/p_period_days,
    'average_revenue_per_day',w.revenue/p_period_days,'average_profit_per_day',(w.contribution_profit-opx)/p_period_days,
    'average_profit_per_order',CASE WHEN w.orders>0 THEN (w.contribution_profit-opx)/w.orders ELSE 0 END),'target',target);
END $$;

GRANT EXECUTE ON FUNCTION get_market_analytics(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_pricing_control_rows(integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_pricing_dashboard(integer) TO authenticated;

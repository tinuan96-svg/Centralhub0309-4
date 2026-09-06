/*
# Fix calculate_required_profit_price RPC - Remove store_id parameter

## Rationale
The CentralHub pricing engine manages ONLY the CentralHub master product price.
It does NOT do store-specific pricing. The p_store_id parameter was used to:
1. Filter sales by store - but CentralHub pricing should consider ALL sales
2. Filter expenses by store - but expenses are global

Both uses are wrong for this feature. CentralHub pricing considers:
- ALL product sales (not store-specific)
- ALL business expenses (global overhead pool)
- The product's own cost_price from the products table

This migration recreates the RPC without p_store_id.
*/

CREATE OR REPLACE FUNCTION calculate_required_profit_price(
  p_product_id uuid,
  p_daily_target numeric DEFAULT 100.00,
  p_sales_window_days integer DEFAULT 30,
  p_undercut_amount numeric DEFAULT 0.10
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost numeric;
  v_current_price numeric;
  v_expected_daily_units numeric;
  v_total_daily_units numeric;
  v_daily_overhead numeric;
  v_target_profit_per_unit numeric;
  v_required_profit_price numeric;
  v_market json;
  v_lowest_competitor numeric;
  v_competitive_target numeric;
  v_final_price numeric;
  v_decision_reason text;
  v_min_margin numeric;
  v_margin_floor_price numeric;
  v_product_name text;
  v_has_sales boolean;
BEGIN
  -- Get product info from CentralHub master products table
  SELECT price, cost_price, min_margin, name
  INTO v_current_price, v_cost, v_min_margin, v_product_name
  FROM products
  WHERE id = p_product_id AND is_deleted = false AND is_active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Product not found or inactive');
  END IF;

  v_cost := COALESCE(v_cost, 0);
  v_current_price := COALESCE(v_current_price, 0);

  -- Get market analytics (server-side, verified matches only)
  SELECT get_market_analytics(p_product_id) INTO v_market;
  v_lowest_competitor := (v_market->>'lowest_competitor_price')::numeric;

  -- Calculate expected daily units from ALL paid sales (not store-specific)
  SELECT SUM(quantity) / GREATEST(p_sales_window_days, 1)
  INTO v_expected_daily_units
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.product_id = p_product_id
    AND o.payment_status = 'paid'
    AND o.created_at >= now() - (p_sales_window_days || ' days')::interval;

  v_has_sales := v_expected_daily_units IS NOT NULL AND v_expected_daily_units > 0;

  -- Calculate total daily units across ALL stores for overhead allocation
  SELECT SUM(quantity) / GREATEST(p_sales_window_days, 1)
  INTO v_total_daily_units
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.payment_status = 'paid'
    AND o.created_at >= now() - (p_sales_window_days || ' days')::interval;

  v_total_daily_units := COALESCE(v_total_daily_units, 0);
  IF v_total_daily_units = 0 THEN
    v_total_daily_units := 1;
  END IF;

  -- Calculate daily operating overhead from GLOBAL expenses (last N days)
  -- Expenses are a shared global pool — not store-specific
  SELECT COALESCE(SUM(amount_gross), 0) / GREATEST(p_sales_window_days, 1)
  INTO v_daily_overhead
  FROM expenses
  WHERE invoice_date >= now() - (p_sales_window_days || ' days')::interval;

  v_daily_overhead := COALESCE(v_daily_overhead, 0);

  -- Calculate target profit contribution per unit
  IF v_has_sales THEN
    v_target_profit_per_unit := p_daily_target / v_total_daily_units;
  ELSE
    v_target_profit_per_unit := NULL;
  END IF;

  -- Calculate required profit price
  IF v_cost > 0 AND v_target_profit_per_unit IS NOT NULL THEN
    v_required_profit_price := v_cost
      + (v_daily_overhead / GREATEST(v_total_daily_units, 1))
      + v_target_profit_per_unit;
  ELSE
    v_required_profit_price := NULL;
  END IF;

  -- Calculate margin floor (existing min_margin safety)
  v_min_margin := COALESCE(v_min_margin, 8);
  IF v_min_margin > 0 AND v_cost > 0 THEN
    v_margin_floor_price := v_cost / (1 - (v_min_margin / 100));
  ELSE
    v_margin_floor_price := v_cost;
  END IF;

  -- Calculate competitive target
  IF v_lowest_competitor IS NOT NULL AND v_lowest_competitor > 0 THEN
    v_competitive_target := ROUND((v_lowest_competitor - p_undercut_amount)::numeric, 2);
    IF v_competitive_target <= 0 THEN
      v_competitive_target := 0.01;
    END IF;
  ELSE
    v_competitive_target := NULL;
  END IF;

  -- FINAL PRICE DECISION: MAX(competitive_target, required_profit_price, margin_floor)
  v_final_price := COALESCE(v_margin_floor_price, v_cost);

  IF v_competitive_target IS NOT NULL THEN
    v_final_price := GREATEST(v_final_price, v_competitive_target);
  END IF;

  IF v_required_profit_price IS NOT NULL THEN
    v_final_price := GREATEST(v_final_price, v_required_profit_price);
  END IF;

  v_final_price := ROUND(v_final_price, 2);

  -- Decision reason
  IF v_cost = 0 OR v_cost IS NULL THEN
    v_decision_reason := 'MISSING_COST';
  ELSIF v_lowest_competitor IS NULL THEN
    IF v_has_sales THEN
      v_decision_reason := 'NO_VALID_COMPETITOR_DATA';
    ELSE
      v_decision_reason := 'MISSING_SALES_FORECAST';
    END IF;
  ELSIF v_required_profit_price IS NULL THEN
    v_decision_reason := 'MISSING_SALES_FORECAST';
  ELSIF v_competitive_target >= v_required_profit_price THEN
    v_decision_reason := 'COMPETE_BELOW_LOWEST';
  ELSIF v_required_profit_price > v_competitive_target THEN
    v_decision_reason := 'PROTECT_REQUIRED_PROFIT';
  ELSE
    v_decision_reason := 'PROTECT_MINIMUM_MARGIN';
  END IF;

  RETURN json_build_object(
    'product_id', p_product_id,
    'product_name', v_product_name,
    'cost_price', v_cost,
    'current_price', v_current_price,
    'lowest_competitor', v_lowest_competitor,
    'competitive_target', v_competitive_target,
    'required_profit_price', v_required_profit_price,
    'margin_floor_price', v_margin_floor_price,
    'final_recommended_price', v_final_price,
    'decision_reason', v_decision_reason,
    'expected_daily_units', v_expected_daily_units,
    'total_daily_units', v_total_daily_units,
    'daily_overhead', v_daily_overhead,
    'target_profit_per_unit', v_target_profit_per_unit,
    'has_sales_history', v_has_sales,
    'has_expense_data', v_daily_overhead > 0,
    'market_analytics', v_market
  );
END;
$$;
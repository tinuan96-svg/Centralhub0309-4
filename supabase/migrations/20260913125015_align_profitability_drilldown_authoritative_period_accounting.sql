-- Align profitability drill-down tabs to one period-based accounting model.
-- Reporting-only: no order, item, expense, supplier, or payment rows are mutated.

CREATE OR REPLACE FUNCTION public.get_finance_order_profitability(
  p_start_date date,
  p_end_date date,
  p_store_id uuid DEFAULT NULL
)
RETURNS TABLE(
  order_id uuid,
  order_number text,
  created_at timestamptz,
  store_id uuid,
  customer_id uuid,
  customer_name text,
  customer_email text,
  revenue numeric,
  cogs numeric,
  direct_variable_cost numeric,
  allocated_variable_expense numeric,
  variable_costs numeric,
  contribution_profit numeric,
  allocated_operating_expense numeric,
  allocated_finance_cost numeric,
  allocated_tax numeric,
  allocated_net_profit numeric,
  margin_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH all_orders AS (
  SELECT
    o.id AS order_id,
    o.order_number::text AS order_number,
    o.created_at,
    o.store_id,
    o.user_id AS customer_id,
    o.customer_name::text AS customer_name,
    o.customer_email::text AS customer_email,
    COALESCE(NULLIF(o.total_amount, 0), NULLIF(o.total_revenue, 0), NULLIF(o.total, 0), COALESCE(o.subtotal, 0) + COALESCE(o.delivery_fee, 0))::numeric AS revenue,
    COALESCE(NULLIF(o.product_cost_net, 0), NULLIF(o.order_cost, 0), 0)::numeric AS cogs,
    (COALESCE(o.packing_cost_net, o.packing_cost, 0) + COALESCE(o.shipping_cost_net, o.shipping_cost, 0) + COALESCE(o.gateway_fee_net, o.gateway_fee_actual, o.payment_fee, 0))::numeric AS direct_variable_cost
  FROM public.orders o
  WHERE o.created_at::date BETWEEN p_start_date AND p_end_date
    AND COALESCE(o.is_deleted, false) = false
    AND lower(COALESCE(o.payment_status, '')) = 'paid'
    AND lower(COALESCE(o.order_status, o.status::varchar, '')) NOT IN ('cancelled', 'refunded', 'failed')
    AND public.finance_can_manage()
),
store_revenue AS (
  SELECT store_id, SUM(revenue)::numeric AS revenue FROM all_orders GROUP BY store_id
),
all_revenue AS (
  SELECT COALESCE(SUM(revenue), 0)::numeric AS revenue FROM all_orders
),
expense_by_store AS (
  SELECT
    e.store_id,
    COALESCE(SUM(CASE WHEN COALESCE(e.is_variable_cost, false) THEN COALESCE(e.amount_net, e.amount_gross, 0) ELSE 0 END), 0)::numeric AS variable_expense,
    COALESCE(SUM(CASE WHEN NOT COALESCE(e.is_variable_cost, false) AND COALESCE(e.expense_type, 'operating') = 'operating' THEN COALESCE(e.amount_net, e.amount_gross, 0) ELSE 0 END), 0)::numeric AS operating_expense,
    COALESCE(SUM(CASE WHEN NOT COALESCE(e.is_variable_cost, false) AND COALESCE(e.expense_type, '') = 'finance' THEN COALESCE(e.amount_net, e.amount_gross, 0) ELSE 0 END), 0)::numeric AS finance_cost,
    COALESCE(SUM(CASE WHEN NOT COALESCE(e.is_variable_cost, false) AND COALESCE(e.expense_type, '') = 'tax' THEN COALESCE(e.amount_net, e.amount_gross, 0) ELSE 0 END), 0)::numeric AS tax_cost
  FROM public.expenses e
  WHERE e.store_id IS NOT NULL
    AND COALESCE(e.invoice_date::date, e.created_at::date) BETWEEN p_start_date AND p_end_date
    AND COALESCE(e.pricing_relevant, true)
  GROUP BY e.store_id
),
global_expense AS (
  SELECT
    COALESCE(SUM(CASE WHEN COALESCE(e.is_variable_cost, false) THEN COALESCE(e.amount_net, e.amount_gross, 0) ELSE 0 END), 0)::numeric AS variable_expense,
    COALESCE(SUM(CASE WHEN NOT COALESCE(e.is_variable_cost, false) AND COALESCE(e.expense_type, 'operating') = 'operating' THEN COALESCE(e.amount_net, e.amount_gross, 0) ELSE 0 END), 0)::numeric AS operating_expense,
    COALESCE(SUM(CASE WHEN NOT COALESCE(e.is_variable_cost, false) AND COALESCE(e.expense_type, '') = 'finance' THEN COALESCE(e.amount_net, e.amount_gross, 0) ELSE 0 END), 0)::numeric AS finance_cost,
    COALESCE(SUM(CASE WHEN NOT COALESCE(e.is_variable_cost, false) AND COALESCE(e.expense_type, '') = 'tax' THEN COALESCE(e.amount_net, e.amount_gross, 0) ELSE 0 END), 0)::numeric AS tax_cost
  FROM public.expenses e
  WHERE e.store_id IS NULL
    AND COALESCE(e.invoice_date::date, e.created_at::date) BETWEEN p_start_date AND p_end_date
    AND COALESCE(e.pricing_relevant, true)
),
allocated AS (
  SELECT
    ao.*,
    (COALESCE(es.variable_expense, 0) * CASE WHEN COALESCE(sr.revenue, 0) > 0 THEN ao.revenue / sr.revenue ELSE 0 END + COALESCE(ge.variable_expense, 0) * CASE WHEN COALESCE(ar.revenue, 0) > 0 THEN ao.revenue / ar.revenue ELSE 0 END)::numeric AS allocated_variable_expense,
    (COALESCE(es.operating_expense, 0) * CASE WHEN COALESCE(sr.revenue, 0) > 0 THEN ao.revenue / sr.revenue ELSE 0 END + COALESCE(ge.operating_expense, 0) * CASE WHEN COALESCE(ar.revenue, 0) > 0 THEN ao.revenue / ar.revenue ELSE 0 END)::numeric AS allocated_operating_expense,
    (COALESCE(es.finance_cost, 0) * CASE WHEN COALESCE(sr.revenue, 0) > 0 THEN ao.revenue / sr.revenue ELSE 0 END + COALESCE(ge.finance_cost, 0) * CASE WHEN COALESCE(ar.revenue, 0) > 0 THEN ao.revenue / ar.revenue ELSE 0 END)::numeric AS allocated_finance_cost,
    (COALESCE(es.tax_cost, 0) * CASE WHEN COALESCE(sr.revenue, 0) > 0 THEN ao.revenue / sr.revenue ELSE 0 END + COALESCE(ge.tax_cost, 0) * CASE WHEN COALESCE(ar.revenue, 0) > 0 THEN ao.revenue / ar.revenue ELSE 0 END)::numeric AS allocated_tax
  FROM all_orders ao
  LEFT JOIN store_revenue sr ON sr.store_id IS NOT DISTINCT FROM ao.store_id
  LEFT JOIN expense_by_store es ON es.store_id IS NOT DISTINCT FROM ao.store_id
  CROSS JOIN all_revenue ar
  CROSS JOIN global_expense ge
  WHERE p_store_id IS NULL OR ao.store_id = p_store_id
)
SELECT
  a.order_id, a.order_number, a.created_at, a.store_id, a.customer_id, a.customer_name, a.customer_email,
  a.revenue, a.cogs, a.direct_variable_cost, a.allocated_variable_expense,
  (a.direct_variable_cost + a.allocated_variable_expense)::numeric AS variable_costs,
  (a.revenue - a.cogs - a.direct_variable_cost - a.allocated_variable_expense)::numeric AS contribution_profit,
  a.allocated_operating_expense, a.allocated_finance_cost, a.allocated_tax,
  (a.revenue - a.cogs - a.direct_variable_cost - a.allocated_variable_expense - a.allocated_operating_expense - a.allocated_finance_cost - a.allocated_tax)::numeric AS allocated_net_profit,
  CASE WHEN a.revenue <> 0 THEN ROUND((a.revenue - a.cogs - a.direct_variable_cost - a.allocated_variable_expense) / a.revenue * 100, 2) ELSE 0 END::numeric AS margin_pct
FROM allocated a
ORDER BY a.created_at DESC, a.order_id;
$$;

CREATE OR REPLACE FUNCTION public.get_finance_product_profitability(
  p_start_date date,
  p_end_date date,
  p_store_id uuid DEFAULT NULL
)
RETURNS TABLE(
  product_id uuid,
  product_name text,
  orders bigint,
  units_sold bigint,
  revenue numeric,
  cogs numeric,
  variable_costs numeric,
  contribution_profit numeric,
  allocated_operating_expense numeric,
  allocated_net_profit numeric,
  margin_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH scoped_orders AS (
  SELECT * FROM public.get_finance_order_profitability(p_start_date, p_end_date, p_store_id)
),
item_base AS (
  SELECT
    o.*,
    oi.id AS order_item_id,
    oi.product_id,
    oi.product_name::text AS product_name,
    COALESCE(oi.quantity, 0)::numeric AS quantity,
    COALESCE(oi.total_price, 0)::numeric AS raw_item_revenue,
    (COALESCE(oi.quantity, 0) * COALESCE(oi.cost_price, 0))::numeric AS raw_item_cogs,
    SUM(COALESCE(oi.total_price, 0)) OVER (PARTITION BY o.order_id)::numeric AS sum_item_revenue,
    SUM(COALESCE(oi.quantity, 0)) OVER (PARTITION BY o.order_id)::numeric AS sum_quantity,
    SUM(COALESCE(oi.quantity, 0) * COALESCE(oi.cost_price, 0)) OVER (PARTITION BY o.order_id)::numeric AS sum_raw_item_cogs,
    SUM(CASE WHEN COALESCE(oi.quantity, 0) * COALESCE(oi.cost_price, 0) = 0 THEN COALESCE(oi.total_price, 0) ELSE 0 END) OVER (PARTITION BY o.order_id)::numeric AS zero_cost_item_revenue,
    COUNT(*) OVER (PARTITION BY o.order_id)::numeric AS item_count
  FROM scoped_orders o
  JOIN public.order_items oi ON oi.order_id = o.order_id
),
shares AS (
  SELECT ib.*, CASE WHEN ib.sum_item_revenue > 0 THEN ib.raw_item_revenue / ib.sum_item_revenue WHEN ib.sum_quantity > 0 THEN ib.quantity / ib.sum_quantity ELSE 1 / NULLIF(ib.item_count, 0) END::numeric AS revenue_share
  FROM item_base ib
),
allocated_items AS (
  SELECT
    s.*,
    (s.revenue * s.revenue_share)::numeric AS attributed_revenue,
    CASE
      WHEN abs(s.sum_raw_item_cogs - s.cogs) <= 0.01 THEN s.raw_item_cogs
      WHEN s.sum_raw_item_cogs < s.cogs AND s.zero_cost_item_revenue > 0 THEN CASE WHEN s.raw_item_cogs > 0 THEN s.raw_item_cogs ELSE (s.cogs - s.sum_raw_item_cogs) * (s.raw_item_revenue / s.zero_cost_item_revenue) END
      WHEN s.sum_raw_item_cogs > 0 THEN s.raw_item_cogs / s.sum_raw_item_cogs * s.cogs
      ELSE s.cogs * s.revenue_share
    END::numeric AS attributed_cogs,
    (s.variable_costs * s.revenue_share)::numeric AS attributed_variable_cost,
    ((s.allocated_operating_expense + s.allocated_finance_cost + s.allocated_tax) * s.revenue_share)::numeric AS attributed_overhead
  FROM shares s
),
product_rollup AS (
  SELECT
    product_id, product_name,
    COUNT(DISTINCT order_id)::bigint AS orders,
    COALESCE(SUM(quantity), 0)::bigint AS units_sold,
    COALESCE(SUM(attributed_revenue), 0)::numeric AS revenue,
    COALESCE(SUM(attributed_cogs), 0)::numeric AS cogs,
    COALESCE(SUM(attributed_variable_cost), 0)::numeric AS variable_costs,
    COALESCE(SUM(attributed_revenue - attributed_cogs - attributed_variable_cost), 0)::numeric AS contribution_profit,
    COALESCE(SUM(attributed_overhead), 0)::numeric AS allocated_operating_expense,
    COALESCE(SUM(attributed_revenue - attributed_cogs - attributed_variable_cost - attributed_overhead), 0)::numeric AS allocated_net_profit
  FROM allocated_items
  GROUP BY product_id, product_name
)
SELECT
  pr.product_id, pr.product_name, pr.orders, pr.units_sold, pr.revenue, pr.cogs, pr.variable_costs, pr.contribution_profit, pr.allocated_operating_expense, pr.allocated_net_profit,
  CASE WHEN pr.revenue <> 0 THEN ROUND(pr.contribution_profit / pr.revenue * 100, 2) ELSE 0 END::numeric AS margin_pct
FROM product_rollup pr
ORDER BY pr.revenue DESC, pr.product_name;
$$;

CREATE OR REPLACE FUNCTION public.get_finance_customer_profitability(
  p_start_date date,
  p_end_date date,
  p_store_id uuid DEFAULT NULL
)
RETURNS TABLE(
  customer_key text,
  customer_name text,
  orders bigint,
  units_sold bigint,
  revenue numeric,
  cogs numeric,
  variable_costs numeric,
  contribution_profit numeric,
  allocated_operating_expense numeric,
  allocated_net_profit numeric,
  margin_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH scoped_orders AS (
  SELECT * FROM public.get_finance_order_profitability(p_start_date, p_end_date, p_store_id)
),
order_units AS (
  SELECT oi.order_id, COALESCE(SUM(oi.quantity), 0)::bigint AS units_sold
  FROM public.order_items oi
  JOIN scoped_orders o ON o.order_id = oi.order_id
  GROUP BY oi.order_id
),
customer_rollup AS (
  SELECT
    COALESCE(o.customer_id::text, lower(NULLIF(trim(o.customer_email), '')), lower(NULLIF(trim(o.customer_name), '')), 'guest') AS customer_key,
    MAX(NULLIF(trim(o.customer_name), ''))::text AS customer_name,
    COUNT(*)::bigint AS orders,
    COALESCE(SUM(ou.units_sold), 0)::bigint AS units_sold,
    COALESCE(SUM(o.revenue), 0)::numeric AS revenue,
    COALESCE(SUM(o.cogs), 0)::numeric AS cogs,
    COALESCE(SUM(o.variable_costs), 0)::numeric AS variable_costs,
    COALESCE(SUM(o.contribution_profit), 0)::numeric AS contribution_profit,
    COALESCE(SUM(o.allocated_operating_expense + o.allocated_finance_cost + o.allocated_tax), 0)::numeric AS allocated_operating_expense,
    COALESCE(SUM(o.allocated_net_profit), 0)::numeric AS allocated_net_profit
  FROM scoped_orders o
  LEFT JOIN order_units ou ON ou.order_id = o.order_id
  GROUP BY COALESCE(o.customer_id::text, lower(NULLIF(trim(o.customer_email), '')), lower(NULLIF(trim(o.customer_name), '')), 'guest')
)
SELECT
  cr.customer_key, COALESCE(cr.customer_name, 'Guest')::text, cr.orders, cr.units_sold, cr.revenue, cr.cogs, cr.variable_costs, cr.contribution_profit, cr.allocated_operating_expense, cr.allocated_net_profit,
  CASE WHEN cr.revenue <> 0 THEN ROUND(cr.contribution_profit / cr.revenue * 100, 2) ELSE 0 END::numeric AS margin_pct
FROM customer_rollup cr
ORDER BY cr.revenue DESC, cr.customer_name;
$$;

CREATE OR REPLACE FUNCTION public.get_finance_monthly_pnl_range(
  p_start_date date,
  p_end_date date,
  p_store_id uuid DEFAULT NULL
)
RETURNS TABLE(
  period_month date,
  orders bigint,
  units_sold bigint,
  revenue numeric,
  cogs numeric,
  variable_costs numeric,
  operating_expenses numeric,
  finance_costs numeric,
  taxes numeric,
  gross_profit numeric,
  contribution_profit numeric,
  net_profit numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    date_trunc('month', d.business_date)::date AS period_month,
    COALESCE(SUM(d.orders), 0)::bigint,
    COALESCE(SUM(d.units_sold), 0)::bigint,
    COALESCE(SUM(d.revenue), 0)::numeric,
    COALESCE(SUM(d.cogs), 0)::numeric,
    COALESCE(SUM(d.variable_costs), 0)::numeric,
    COALESCE(SUM(d.operating_expenses), 0)::numeric,
    COALESCE(SUM(d.finance_costs), 0)::numeric,
    COALESCE(SUM(d.taxes), 0)::numeric,
    COALESCE(SUM(d.gross_profit), 0)::numeric,
    COALESCE(SUM(d.contribution_profit), 0)::numeric,
    COALESCE(SUM(d.net_profit), 0)::numeric
  FROM public.v_financial_daily_pnl d
  WHERE d.business_date BETWEEN p_start_date AND p_end_date
    AND (p_store_id IS NULL OR d.store_id = p_store_id)
    AND public.finance_can_manage()
  GROUP BY date_trunc('month', d.business_date)::date
  ORDER BY period_month DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_finance_supplier_performance(
  p_start_date date,
  p_end_date date
)
RETURNS TABLE(
  supplier_id uuid,
  supplier_name text,
  purchase_orders bigint,
  units_purchased bigint,
  purchase_value numeric,
  invoices bigint,
  invoiced_value numeric,
  outstanding_value numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH po AS (
  SELECT p.supplier_id, COUNT(DISTINCT p.id)::bigint AS purchase_orders, COALESCE(SUM(i.quantity_ordered), 0)::bigint AS units_purchased, COALESCE(SUM(i.quantity_ordered * COALESCE(i.unit_cost_ex_vat, i.unit_cost, 0)), 0)::numeric AS purchase_value
  FROM public.purchase_orders p
  LEFT JOIN public.purchase_order_items i ON i.purchase_order_id = p.id
  WHERE p.order_date BETWEEN p_start_date AND p_end_date AND public.finance_can_manage()
  GROUP BY p.supplier_id
),
inv AS (
  SELECT s.supplier_id, COUNT(*)::bigint AS invoices, COALESCE(SUM(s.total_amount), 0)::numeric AS invoiced_value, COALESCE(SUM(GREATEST(COALESCE(s.total_amount, 0) - COALESCE(s.amount_paid, 0), 0)), 0)::numeric AS outstanding_value
  FROM public.supplier_invoices s
  WHERE s.invoice_date BETWEEN p_start_date AND p_end_date AND public.finance_can_manage()
  GROUP BY s.supplier_id
)
SELECT sp.id, sp.name::text, COALESCE(po.purchase_orders, 0)::bigint, COALESCE(po.units_purchased, 0)::bigint, COALESCE(po.purchase_value, 0)::numeric, COALESCE(inv.invoices, 0)::bigint, COALESCE(inv.invoiced_value, 0)::numeric, COALESCE(inv.outstanding_value, 0)::numeric
FROM public.suppliers sp
LEFT JOIN po ON po.supplier_id = sp.id
LEFT JOIN inv ON inv.supplier_id = sp.id
WHERE COALESCE(sp.is_active, true) AND public.finance_can_manage()
ORDER BY COALESCE(po.purchase_value, 0) DESC, COALESCE(inv.invoiced_value, 0) DESC, sp.name;
$$;

REVOKE ALL ON FUNCTION public.get_finance_order_profitability(date,date,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_finance_product_profitability(date,date,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_finance_customer_profitability(date,date,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_finance_monthly_pnl_range(date,date,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_finance_supplier_performance(date,date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_finance_order_profitability(date,date,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_finance_product_profitability(date,date,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_finance_customer_profitability(date,date,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_finance_monthly_pnl_range(date,date,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_finance_supplier_performance(date,date) TO authenticated, service_role;

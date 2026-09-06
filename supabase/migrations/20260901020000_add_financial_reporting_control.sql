-- Financial Reporting Control Centre foundation
-- Keeps existing orders, expenses, bank transactions, supplier invoices and products as sources of truth.

CREATE OR REPLACE VIEW public.v_financial_bank_activity AS
SELECT bt.id AS bank_transaction_id, bt.bank_account_id, bt.store_id, bt.transaction_date, bt.description, bt.amount, bt.type, bt.balance, bt.reference, bt.merchant, bt.transaction_category, bt.accounting_category, bt.classification_status, bt.supplier_invoice_id, bt.expense_id, bt.customer_id, bt.reconciled_with_order_id,
CASE WHEN bt.type='credit' AND bt.accounting_category='revenue' THEN bt.amount ELSE 0 END AS classified_income,
CASE WHEN bt.type='debit' AND bt.accounting_category IN ('variable_cost','operating_expense','finance_cost','tax','other') THEN bt.amount ELSE 0 END AS classified_outflow,
(bt.type='credit' AND bt.accounting_category='revenue') OR (bt.type='debit' AND bt.accounting_category IN ('variable_cost','operating_expense','finance_cost','tax','other')) AS affects_pnl
FROM public.bank_transactions bt;

-- New reporting view; the existing v_financial_order_profitability is retained unchanged for compatibility.
CREATE OR REPLACE VIEW public.v_financial_order_profitability_detail AS
SELECT o.id AS order_id, o.order_number, o.created_at, o.store_id, o.user_id AS customer_id, o.customer_name, o.customer_email, o.customer_phone,
COALESCE(NULLIF(o.total_revenue,0),NULLIF(o.total_amount,0),o.total,0) AS revenue,
COALESCE(NULLIF(o.product_cost_net,0),NULLIF(o.order_cost,0),0) AS cogs,
COALESCE(o.packing_cost_net,o.packing_cost,0) AS packing_cost,
COALESCE(o.shipping_cost_net,o.shipping_cost,0) AS shipping_cost,
COALESCE(o.gateway_fee_net,o.gateway_fee_actual,o.payment_fee,0) AS payment_cost,
COALESCE(o.total_cost_net,0) AS stored_total_cost,
COALESCE(NULLIF(o.order_profit,0),COALESCE(NULLIF(o.total_revenue,0),NULLIF(o.total_amount,0),o.total,0)-COALESCE(NULLIF(o.product_cost_net,0),NULLIF(o.order_cost,0),0)-COALESCE(o.packing_cost_net,o.packing_cost,0)-COALESCE(o.shipping_cost_net,o.shipping_cost,0)-COALESCE(o.gateway_fee_net,o.gateway_fee_actual,o.payment_fee,0)) AS contribution_profit,
COALESCE(o.order_profit,0) AS recorded_order_profit,
CASE WHEN COALESCE(NULLIF(o.total_amount,0),o.total,0)<>0 THEN ROUND(COALESCE(o.order_profit,0)/COALESCE(NULLIF(o.total_amount,0),o.total,1)*100,2) ELSE 0 END AS recorded_margin_pct
FROM public.orders o
WHERE COALESCE(o.is_deleted,false)=false AND COALESCE(o.order_status,'') NOT IN ('cancelled','refunded');

CREATE OR REPLACE VIEW public.v_financial_product_profitability AS
SELECT oi.product_id, MAX(oi.product_name) AS product_name, COUNT(DISTINCT oi.order_id) AS order_count, COALESCE(SUM(oi.quantity),0)::bigint AS units_sold,
COALESCE(SUM(oi.total_price),0) AS revenue, COALESCE(SUM(oi.quantity*COALESCE(oi.cost_price,0)),0) AS cogs,
COALESCE(SUM(oi.total_price-oi.quantity*COALESCE(oi.cost_price,0)),0) AS gross_profit,
CASE WHEN COALESCE(SUM(oi.total_price),0)<>0 THEN ROUND(COALESCE(SUM(oi.total_price-oi.quantity*COALESCE(oi.cost_price,0)),0)/SUM(oi.total_price)*100,2) ELSE 0 END AS gross_margin_pct,
COALESCE(MAX(p.price),0) AS current_price, COALESCE(MAX(p.cost_price),0) AS current_cost_price, COALESCE(MAX(p.gtin),'') AS gtin
FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id LEFT JOIN public.products p ON p.id=oi.product_id
WHERE COALESCE(o.is_deleted,false)=false AND COALESCE(o.order_status,'') NOT IN ('cancelled','refunded') GROUP BY oi.product_id;

CREATE OR REPLACE VIEW public.v_financial_customer_profitability AS
SELECT COALESCE(o.user_id::text,NULLIF(o.customer_email,''),NULLIF(o.customer_phone,''),'guest:'||o.id::text) AS customer_key,
MAX(o.customer_name) AS customer_name, MAX(o.customer_email) AS customer_email, MAX(o.customer_phone) AS customer_phone, COUNT(*) AS order_count,
COALESCE(SUM(COALESCE(NULLIF(o.total_amount,0),o.total_revenue,o.total,0)),0) AS revenue,
COALESCE(SUM(COALESCE(NULLIF(o.product_cost_net,0),o.order_cost,0)),0) AS cogs, COALESCE(SUM(COALESCE(o.total_cost_net,0)),0) AS total_cost,
COALESCE(SUM(COALESCE(o.order_profit,0)),0) AS profit,
CASE WHEN COALESCE(SUM(COALESCE(NULLIF(o.total_amount,0),o.total_revenue,o.total,0)),0)<>0 THEN ROUND(SUM(COALESCE(o.order_profit,0))/SUM(COALESCE(NULLIF(o.total_amount,0),o.total_revenue,o.total,0))*100,2) ELSE 0 END AS margin_pct
FROM public.orders o WHERE COALESCE(o.is_deleted,false)=false AND COALESCE(o.order_status,'') NOT IN ('cancelled','refunded')
GROUP BY COALESCE(o.user_id::text,NULLIF(o.customer_email,''),NULLIF(o.customer_phone,''),'guest:'||o.id::text);

CREATE OR REPLACE VIEW public.v_financial_supplier_performance AS
WITH po AS (SELECT po.supplier_id,COUNT(DISTINCT po.id) purchase_order_count,COALESCE(SUM(poi.quantity_ordered),0)::bigint units_purchased,COALESCE(SUM(poi.quantity_ordered*COALESCE(poi.unit_cost_ex_vat,poi.unit_cost,0)),0) purchase_value FROM public.purchase_orders po LEFT JOIN public.purchase_order_items poi ON poi.purchase_order_id=po.id GROUP BY po.supplier_id),
inv AS (SELECT si.supplier_id,COUNT(*) invoice_count,COALESCE(SUM(si.total_amount),0) invoiced_value,COALESCE(SUM(GREATEST(COALESCE(si.total_amount,0)-COALESCE(si.amount_paid,0),0)),0) outstanding_value FROM public.supplier_invoices si GROUP BY si.supplier_id)
SELECT s.id supplier_id,s.name supplier_name,COALESCE(po.purchase_order_count,0) purchase_order_count,COALESCE(po.units_purchased,0) units_purchased,COALESCE(po.purchase_value,0) purchase_value,COALESCE(inv.invoice_count,0) invoice_count,COALESCE(inv.invoiced_value,0) invoiced_value,COALESCE(inv.outstanding_value,0) outstanding_value
FROM public.suppliers s LEFT JOIN po ON po.supplier_id=s.id LEFT JOIN inv ON inv.supplier_id=s.id;

CREATE OR REPLACE VIEW public.v_financial_daily_pnl AS
WITH days AS (SELECT d::date business_date FROM generate_series(COALESCE((SELECT MIN(created_at::date) FROM public.orders WHERE COALESCE(is_deleted,false)=false),CURRENT_DATE),CURRENT_DATE,interval '1 day') d),
orders_daily AS (SELECT o.created_at::date business_date,o.store_id,COUNT(*) orders,COALESCE(SUM(COALESCE(NULLIF(o.total_amount,0),o.total_revenue,o.total,0)),0) revenue,COALESCE(SUM(COALESCE(NULLIF(o.product_cost_net,0),o.order_cost,0)),0) cogs,COALESCE(SUM(COALESCE(o.packing_cost_net,o.packing_cost,0)+COALESCE(o.shipping_cost_net,o.shipping_cost,0)+COALESCE(o.gateway_fee_net,o.gateway_fee_actual,o.payment_fee,0)),0) order_variable_costs,COALESCE(SUM((SELECT COALESCE(SUM(oi.quantity),0) FROM public.order_items oi WHERE oi.order_id=o.id)),0) units_sold,COALESCE(SUM(COALESCE(o.order_profit,0)),0) recorded_profit FROM public.orders o WHERE COALESCE(o.is_deleted,false)=false AND COALESCE(o.order_status,'') NOT IN ('cancelled','refunded') GROUP BY o.created_at::date,o.store_id),
expenses_daily AS (SELECT e.invoice_date::date business_date,e.store_id,COALESCE(SUM(CASE WHEN COALESCE(e.is_variable_cost,false) THEN COALESCE(e.amount_net,e.amount_gross,0) ELSE 0 END),0) variable_expenses,COALESCE(SUM(CASE WHEN NOT COALESCE(e.is_variable_cost,false) AND COALESCE(e.expense_type,'operating')='operating' THEN COALESCE(e.amount_net,e.amount_gross,0) ELSE 0 END),0) operating_expenses,COALESCE(SUM(CASE WHEN COALESCE(e.expense_type,'')='finance' THEN COALESCE(e.amount_net,e.amount_gross,0) ELSE 0 END),0) finance_costs,COALESCE(SUM(CASE WHEN COALESCE(e.expense_type,'')='tax' THEN COALESCE(e.amount_net,e.amount_gross,0) ELSE 0 END),0) taxes FROM public.expenses e WHERE COALESCE(e.pricing_relevant,true)=true GROUP BY e.invoice_date::date,e.store_id)
SELECT d.business_date,od.store_id,COALESCE(od.orders,0) orders,COALESCE(od.units_sold,0) units_sold,COALESCE(od.revenue,0) revenue,COALESCE(od.cogs,0) cogs,COALESCE(od.order_variable_costs,0)+COALESCE(ed.variable_expenses,0) variable_costs,COALESCE(ed.operating_expenses,0) operating_expenses,COALESCE(ed.finance_costs,0) finance_costs,COALESCE(ed.taxes,0) taxes,COALESCE(od.revenue,0)-COALESCE(od.cogs,0) gross_profit,COALESCE(od.revenue,0)-COALESCE(od.cogs,0)-COALESCE(od.order_variable_costs,0)-COALESCE(ed.variable_expenses,0) contribution_profit,COALESCE(od.revenue,0)-COALESCE(od.cogs,0)-COALESCE(od.order_variable_costs,0)-COALESCE(ed.variable_expenses,0)-COALESCE(ed.operating_expenses,0)-COALESCE(ed.finance_costs,0)-COALESCE(ed.taxes,0) net_profit,COALESCE(od.recorded_profit,0) recorded_order_profit
FROM days d LEFT JOIN orders_daily od ON od.business_date=d.business_date LEFT JOIN expenses_daily ed ON ed.business_date=d.business_date AND ed.store_id IS NOT DISTINCT FROM od.store_id;

CREATE OR REPLACE FUNCTION public.get_financial_performance(p_start_date date,p_end_date date,p_store_id uuid DEFAULT NULL)
RETURNS TABLE(revenue numeric,cogs numeric,variable_costs numeric,operating_expenses numeric,finance_costs numeric,taxes numeric,gross_profit numeric,contribution_profit numeric,net_profit numeric,orders bigint,units_sold bigint,average_orders_per_day numeric,average_revenue_per_day numeric,average_profit_per_day numeric,average_profit_per_order numeric,cash_in numeric,cash_out numeric,closing_cash numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH pnl AS (SELECT * FROM public.v_financial_daily_pnl WHERE business_date BETWEEN p_start_date AND p_end_date AND (p_store_id IS NULL OR store_id=p_store_id)),cash AS (SELECT COALESCE(SUM(CASE WHEN bt.type='credit' THEN bt.amount ELSE 0 END),0) cash_in,COALESCE(SUM(CASE WHEN bt.type='debit' THEN bt.amount ELSE 0 END),0) cash_out,COALESCE((ARRAY_AGG(bt.balance ORDER BY bt.transaction_date DESC,bt.created_at DESC))[1],0) closing_cash FROM public.bank_transactions bt WHERE bt.transaction_date BETWEEN p_start_date AND p_end_date AND (p_store_id IS NULL OR bt.store_id=p_store_id))
SELECT COALESCE(SUM(revenue),0),COALESCE(SUM(cogs),0),COALESCE(SUM(variable_costs),0),COALESCE(SUM(operating_expenses),0),COALESCE(SUM(finance_costs),0),COALESCE(SUM(taxes),0),COALESCE(SUM(gross_profit),0),COALESCE(SUM(contribution_profit),0),COALESCE(SUM(net_profit),0),COALESCE(SUM(orders),0)::bigint,COALESCE(SUM(units_sold),0)::bigint,COALESCE(SUM(orders),0)/GREATEST((p_end_date-p_start_date)+1,1),COALESCE(SUM(revenue),0)/GREATEST((p_end_date-p_start_date)+1,1),COALESCE(SUM(net_profit),0)/GREATEST((p_end_date-p_start_date)+1,1),CASE WHEN COALESCE(SUM(orders),0)>0 THEN COALESCE(SUM(net_profit),0)/SUM(orders) ELSE 0 END,cash.cash_in,cash.cash_out,cash.closing_cash
FROM pnl CROSS JOIN cash;
$$;

COMMENT ON VIEW public.v_financial_daily_pnl IS 'Daily P&L foundation for Finance and Pricing using existing order and expense sources.';
COMMENT ON FUNCTION public.get_financial_performance(date,date,uuid) IS 'Period financial performance including P&L metrics and bank cash movement.';

-- Align bank reconciliation, P&L and profitability around one finance truth.
-- 1) Only payment-received orders contribute to profitability/P&L.
-- 2) Reconciled debit transactions assigned to genuine P&L ledger heads create/link an expense posting.
-- 3) Supplier payables, transfers, equity and other balance-sheet movements remain outside P&L.

CREATE OR REPLACE FUNCTION public.sync_bank_transaction_pnl_expense(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  bt public.bank_transactions%ROWTYPE;
  la public.finance_ledger_accounts%ROWTYPE;
  v_expense_id uuid;
  v_candidate_id uuid;
  v_candidate_count integer := 0;
  v_category text;
  v_expense_type text;
  v_is_variable boolean := false;
  v_pricing_relevant boolean := true;
  v_should_post boolean := false;
  v_amount numeric;
BEGIN
  SELECT * INTO bt FROM public.bank_transactions WHERE id=p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('posted',false,'reason','transaction_not_found'); END IF;
  IF bt.type <> 'debit' THEN RETURN jsonb_build_object('posted',false,'reason','not_debit'); END IF;
  IF NOT (coalesce(bt.is_reconciled,false) OR coalesce(bt.reconciliation_status,'')='reconciled') THEN
    RETURN jsonb_build_object('posted',false,'reason','not_reconciled');
  END IF;

  IF bt.ledger_account_id IS NOT NULL THEN
    SELECT * INTO la FROM public.finance_ledger_accounts WHERE id=bt.ledger_account_id AND is_active;
  END IF;

  IF la.id IS NOT NULL AND la.pnl_class IN ('variable_expense','operating_expense','finance_cost','tax','other_expense') THEN
    v_should_post := true;
    v_category := la.name;
    v_is_variable := la.pnl_class='variable_expense';
    v_expense_type := CASE la.pnl_class
      WHEN 'variable_expense' THEN 'variable'
      WHEN 'finance_cost' THEN 'finance'
      WHEN 'tax' THEN 'tax'
      ELSE 'operating' END;
    v_pricing_relevant := coalesce(la.pricing_relevant,true);
  ELSIF la.id IS NULL AND bt.transaction_category IN ('operating_expense','other_expense','tax') THEN
    v_should_post := true;
    v_category := coalesce(nullif(bt.merchant,''),nullif(bt.description,''),replace(bt.transaction_category,'_',' '));
    v_is_variable := bt.accounting_category='variable_cost';
    v_expense_type := CASE
      WHEN bt.transaction_category='tax' OR bt.accounting_category='tax' THEN 'tax'
      WHEN bt.accounting_category='finance_cost' THEN 'finance'
      WHEN bt.accounting_category='variable_cost' THEN 'variable'
      ELSE 'operating' END;
  END IF;

  IF NOT v_should_post THEN RETURN jsonb_build_object('posted',false,'reason','non_pnl_ledger_or_category'); END IF;

  v_amount := abs(coalesce(bt.amount,0));
  IF v_amount <= 0 THEN RETURN jsonb_build_object('posted',false,'reason','zero_amount'); END IF;

  v_expense_id := bt.expense_id;
  IF v_expense_id IS NULL THEN
    SELECT e.id INTO v_expense_id FROM public.expenses e WHERE e.bank_transaction_id=bt.id LIMIT 1;
  END IF;

  IF v_expense_id IS NULL THEN
    SELECT count(*), max(e.id::text)::uuid INTO v_candidate_count, v_candidate_id
    FROM public.expenses e
    WHERE e.bank_transaction_id IS NULL
      AND e.store_id IS NOT DISTINCT FROM bt.store_id
      AND e.invoice_date::date = bt.transaction_date
      AND abs(coalesce(e.amount_gross,e.amount_net,0)-v_amount) <= 0.01
      AND (
        public.normalize_bank_ledger_match_text(coalesce(e.description,'')) IN (
          public.normalize_bank_ledger_match_text(coalesce(bt.merchant,'')),
          public.normalize_bank_ledger_match_text(coalesce(bt.description,''))
        )
        OR public.normalize_bank_ledger_match_text(coalesce(e.category,'')) = public.normalize_bank_ledger_match_text(coalesce(v_category,''))
      );
    IF v_candidate_count=1 THEN v_expense_id:=v_candidate_id; END IF;
  END IF;

  IF v_expense_id IS NULL THEN
    INSERT INTO public.expenses(
      amount_gross,amount_net,vat_amount,invoice_date,payment_status,description,store_id,
      category,expense_type,is_variable_cost,pricing_relevant,paid_at,bank_transaction_id,creditor_id,notes
    ) VALUES (
      v_amount,v_amount,0,bt.transaction_date::timestamptz,'paid',
      coalesce(nullif(bt.merchant,''),nullif(bt.description,''),v_category),bt.store_id,
      v_category,v_expense_type,v_is_variable,v_pricing_relevant,bt.transaction_date::timestamptz,
      bt.id,bt.creditor_id,'Auto-posted to P&L from reconciled bank transaction / ledger head'
    ) RETURNING id INTO v_expense_id;
  ELSE
    UPDATE public.expenses
    SET bank_transaction_id=coalesce(bank_transaction_id,bt.id),
        payment_status='paid',
        paid_at=coalesce(paid_at,bt.transaction_date::timestamptz),
        category=coalesce(nullif(category,''),v_category),
        expense_type=coalesce(nullif(expense_type,''),v_expense_type),
        is_variable_cost=CASE WHEN expense_type IS NULL THEN v_is_variable ELSE is_variable_cost END,
        creditor_id=coalesce(creditor_id,bt.creditor_id),
        notes=coalesce(notes,'Linked to reconciled bank transaction / ledger head')
    WHERE id=v_expense_id;
  END IF;

  UPDATE public.bank_transactions SET expense_id=v_expense_id,updated_at=now()
  WHERE id=bt.id AND expense_id IS DISTINCT FROM v_expense_id;

  RETURN jsonb_build_object('posted',true,'expense_id',v_expense_id,'category',v_category,'expense_type',v_expense_type);
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_sync_bank_transaction_pnl_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF pg_trigger_depth()>1 THEN RETURN NEW; END IF;
  IF NEW.type='debit' AND (coalesce(NEW.is_reconciled,false) OR coalesce(NEW.reconciliation_status,'')='reconciled') THEN
    PERFORM public.sync_bank_transaction_pnl_expense(NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bank_transactions_sync_pnl_expense ON public.bank_transactions;
CREATE TRIGGER bank_transactions_sync_pnl_expense
AFTER INSERT OR UPDATE OF is_reconciled,reconciliation_status,ledger_account_id,transaction_category,accounting_category
ON public.bank_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_bank_transaction_pnl_expense();

CREATE OR REPLACE VIEW public.v_financial_order_profitability_detail AS
SELECT id AS order_id,order_number,created_at,store_id,user_id AS customer_id,customer_name,customer_email,customer_phone,
  COALESCE(NULLIF(total_revenue,0),NULLIF(total_amount,0),total,0) AS revenue,
  COALESCE(NULLIF(product_cost_net,0),NULLIF(order_cost,0),0) AS cogs,
  COALESCE(packing_cost_net,packing_cost,0) AS packing_cost,
  COALESCE(shipping_cost_net,shipping_cost,0) AS shipping_cost,
  COALESCE(gateway_fee_net,gateway_fee_actual,payment_fee,0) AS payment_cost,
  COALESCE(total_cost_net,0) AS stored_total_cost,
  COALESCE(NULLIF(order_profit,0),COALESCE(NULLIF(total_revenue,0),NULLIF(total_amount,0),total,0)-COALESCE(NULLIF(product_cost_net,0),NULLIF(order_cost,0),0)-COALESCE(packing_cost_net,packing_cost,0)-COALESCE(shipping_cost_net,shipping_cost,0)-COALESCE(gateway_fee_net,gateway_fee_actual,payment_fee,0)) AS contribution_profit,
  COALESCE(order_profit,0) AS recorded_order_profit,
  CASE WHEN COALESCE(NULLIF(total_amount,0),total,0)<>0 THEN round(COALESCE(order_profit,0)/COALESCE(NULLIF(total_amount,0),NULLIF(total,0),1)*100,2) ELSE 0 END AS recorded_margin_pct
FROM public.orders o
WHERE COALESCE(is_deleted,false)=false
  AND lower(COALESCE(payment_status,''))='paid'
  AND lower(COALESCE(order_status,status,'')) NOT IN ('cancelled','refunded','failed');

CREATE OR REPLACE VIEW public.v_financial_daily_pnl AS
WITH orders_daily AS (
  SELECT o.created_at::date AS business_date,o.store_id,count(*) AS orders,
    COALESCE(sum(COALESCE(NULLIF(o.total_amount,0),NULLIF(o.total_revenue,0),NULLIF(o.total,0),COALESCE(o.subtotal,0)+COALESCE(o.delivery_fee,0))),0) AS revenue,
    COALESCE(sum(COALESCE(NULLIF(o.product_cost_net,0),NULLIF(o.order_cost,0),0)),0) AS cogs,
    COALESCE(sum(COALESCE(o.packing_cost_net,o.packing_cost,0)+COALESCE(o.shipping_cost_net,o.shipping_cost,0)+COALESCE(o.gateway_fee_net,o.gateway_fee_actual,o.payment_fee,0)),0) AS order_variable_costs,
    COALESCE(sum((SELECT COALESCE(sum(oi.quantity),0) FROM public.order_items oi WHERE oi.order_id=o.id)),0) AS units_sold,
    COALESCE(sum(o.order_profit),0) AS recorded_profit
  FROM public.orders o
  WHERE COALESCE(o.is_deleted,false)=false
    AND lower(COALESCE(o.payment_status,''))='paid'
    AND lower(COALESCE(o.order_status,o.status,'')) NOT IN ('cancelled','refunded','failed')
  GROUP BY o.created_at::date,o.store_id
), expenses_daily AS (
  SELECT COALESCE(e.invoice_date::date,e.created_at::date) AS business_date,e.store_id,
    COALESCE(sum(CASE WHEN COALESCE(e.is_variable_cost,false) THEN COALESCE(e.amount_net,e.amount_gross,0) ELSE 0 END),0) AS variable_expenses,
    COALESCE(sum(CASE WHEN NOT COALESCE(e.is_variable_cost,false) AND COALESCE(e.expense_type,'operating')='operating' THEN COALESCE(e.amount_net,e.amount_gross,0) ELSE 0 END),0) AS operating_expenses,
    COALESCE(sum(CASE WHEN COALESCE(e.expense_type,'')='finance' THEN COALESCE(e.amount_net,e.amount_gross,0) ELSE 0 END),0) AS finance_costs,
    COALESCE(sum(CASE WHEN COALESCE(e.expense_type,'')='tax' THEN COALESCE(e.amount_net,e.amount_gross,0) ELSE 0 END),0) AS taxes
  FROM public.expenses e
  WHERE COALESCE(e.pricing_relevant,true)
  GROUP BY COALESCE(e.invoice_date::date,e.created_at::date),e.store_id
), keys AS (
  SELECT business_date,store_id FROM orders_daily
  UNION
  SELECT business_date,store_id FROM expenses_daily
)
SELECT k.business_date,k.store_id,
  COALESCE(od.orders,0)::bigint AS orders,COALESCE(od.units_sold,0) AS units_sold,
  COALESCE(od.revenue,0) AS revenue,COALESCE(od.cogs,0) AS cogs,
  COALESCE(od.order_variable_costs,0)+COALESCE(ed.variable_expenses,0) AS variable_costs,
  COALESCE(ed.operating_expenses,0) AS operating_expenses,COALESCE(ed.finance_costs,0) AS finance_costs,COALESCE(ed.taxes,0) AS taxes,
  COALESCE(od.revenue,0)-COALESCE(od.cogs,0) AS gross_profit,
  COALESCE(od.revenue,0)-COALESCE(od.cogs,0)-COALESCE(od.order_variable_costs,0)-COALESCE(ed.variable_expenses,0) AS contribution_profit,
  COALESCE(od.revenue,0)-COALESCE(od.cogs,0)-COALESCE(od.order_variable_costs,0)-COALESCE(ed.variable_expenses,0)-COALESCE(ed.operating_expenses,0)-COALESCE(ed.finance_costs,0)-COALESCE(ed.taxes,0) AS net_profit,
  COALESCE(od.recorded_profit,0) AS recorded_order_profit
FROM keys k
LEFT JOIN orders_daily od ON od.business_date=k.business_date AND od.store_id IS NOT DISTINCT FROM k.store_id
LEFT JOIN expenses_daily ed ON ed.business_date=k.business_date AND ed.store_id IS NOT DISTINCT FROM k.store_id;

DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT bt.id FROM public.bank_transactions bt
    LEFT JOIN public.finance_ledger_accounts la ON la.id=bt.ledger_account_id
    WHERE bt.type='debit'
      AND (coalesce(bt.is_reconciled,false) OR coalesce(bt.reconciliation_status,'')='reconciled')
      AND (la.pnl_class IN ('variable_expense','operating_expense','finance_cost','tax','other_expense')
           OR (la.id IS NULL AND bt.transaction_category IN ('operating_expense','other_expense','tax')))
  LOOP
    PERFORM public.sync_bank_transaction_pnl_expense(r.id);
  END LOOP;
END;
$do$;
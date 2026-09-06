-- Finance Stage 5: cashless financial integrity, bank/order reconciliation, own-account transfers and reporting.
-- No physical cash is modelled.

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS financial_treatment text NOT NULL DEFAULT 'unclassified',
  ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'unreconciled',
  ADD COLUMN IF NOT EXISTS transfer_group_id uuid,
  ADD COLUMN IF NOT EXISTS reconciliation_notes text;
CREATE INDEX IF NOT EXISTS idx_bank_tx_reconciliation_status ON public.bank_transactions(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_bank_tx_financial_treatment ON public.bank_transactions(financial_treatment);

CREATE TABLE IF NOT EXISTS public.bank_transaction_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bank_transaction_id uuid NOT NULL REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
 link_type text NOT NULL CHECK (link_type IN ('order_payment','gateway_payout','refund','own_account_transfer','expense','supplier_payment','other')),
 linked_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL, linked_expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
 linked_bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL, amount numeric NOT NULL CHECK (amount>0),
 status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('suggested','confirmed','rejected')), confidence numeric CHECK (confidence>=0 AND confidence<=1),
 notes text, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(bank_transaction_id,link_type,linked_order_id,linked_expense_id,linked_bank_transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_bank_tx_links_tx ON public.bank_transaction_links(bank_transaction_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_links_order ON public.bank_transaction_links(linked_order_id);
ALTER TABLE public.bank_transaction_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bank_transaction_links_admin_all ON public.bank_transaction_links;
CREATE POLICY bank_transaction_links_admin_all ON public.bank_transaction_links FOR ALL TO authenticated USING (public.finance_can_manage()) WITH CHECK (public.finance_can_manage());
UPDATE public.bank_transactions SET reconciliation_status=CASE WHEN COALESCE(is_reconciled,false) THEN 'reconciled' WHEN COALESCE(classification_status,'')='classified' THEN 'classified_unreconciled' ELSE 'unreconciled' END WHERE reconciliation_status='unreconciled';

CREATE OR REPLACE FUNCTION public.suggest_bank_order_matches(p_transaction_id uuid) RETURNS TABLE(order_id uuid,order_number text,customer_name text,order_date timestamptz,order_total numeric,actual_payout numeric,payout_status text,confidence numeric,reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
WITH t AS (SELECT * FROM public.bank_transactions WHERE id=p_transaction_id AND type='credit'), c AS (
 SELECT o.id,o.order_number,o.customer_name,o.created_at,o.total_amount,COALESCE(o.actual_payout,o.expected_payout,o.total_amount) payout,o.payout_status,
 CASE WHEN abs(COALESCE(o.actual_payout,o.expected_payout,o.total_amount)-abs(t.amount))<=0.01 THEN 1.0 WHEN COALESCE(o.payment_reference,'')<>'' AND lower(COALESCE(t.reference,'')) LIKE '%'||lower(o.payment_reference)||'%' THEN 0.98 WHEN COALESCE(o.mollie_payment_id,'')<>'' AND lower(COALESCE(t.reference,'')) LIKE '%'||lower(o.mollie_payment_id)||'%' THEN 0.98 WHEN COALESCE(o.order_number,'')<>'' AND lower(COALESCE(t.description,'')) LIKE '%'||lower(o.order_number)||'%' THEN 0.95 ELSE 0.30 END confidence,
 CASE WHEN abs(COALESCE(o.actual_payout,o.expected_payout,o.total_amount)-abs(t.amount))<=0.01 THEN 'Exact order/payout amount' WHEN COALESCE(o.payment_reference,'')<>'' AND lower(COALESCE(t.reference,'')) LIKE '%'||lower(o.payment_reference)||'%' THEN 'Payment reference found' WHEN COALESCE(o.mollie_payment_id,'')<>'' AND lower(COALESCE(t.reference,'')) LIKE '%'||lower(o.mollie_payment_id)||'%' THEN 'Gateway payment ID found' WHEN COALESCE(o.order_number,'')<>'' AND lower(COALESCE(t.description,'')) LIKE '%'||lower(o.order_number)||'%' THEN 'Order number found' ELSE 'Possible customer payment' END reason
 FROM t JOIN public.orders o ON COALESCE(o.is_deleted,false)=false AND COALESCE(o.payment_status,'')='paid' AND COALESCE(o.payout_status,'')<>'paid' WHERE o.created_at::date BETWEEN t.transaction_date-14 AND t.transaction_date+14)
SELECT id,order_number,customer_name,created_at,total_amount,payout,payout_status,confidence,reason FROM c WHERE confidence>=0.30 ORDER BY confidence DESC,abs(payout-(SELECT abs(amount) FROM t)) ASC LIMIT 20;
$$;
GRANT EXECUTE ON FUNCTION public.suggest_bank_order_matches(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_bank_order_match(p_bank_transaction_id uuid,p_order_id uuid,p_amount numeric DEFAULT NULL,p_link_type text DEFAULT 'order_payment',p_notes text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE bt public.bank_transactions%ROWTYPE; o public.orders%ROWTYPE; v_amount numeric;
BEGIN
 IF NOT public.finance_can_manage() THEN RAISE EXCEPTION 'Not authorised'; END IF;
 SELECT * INTO bt FROM public.bank_transactions WHERE id=p_bank_transaction_id FOR UPDATE; SELECT * INTO o FROM public.orders WHERE id=p_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF; IF p_link_type NOT IN ('order_payment','gateway_payout','refund') THEN RAISE EXCEPTION 'Invalid order link type'; END IF;
 v_amount:=COALESCE(p_amount,abs(COALESCE(bt.amount,0))); IF v_amount<=0 THEN RAISE EXCEPTION 'Invalid match amount'; END IF;
 INSERT INTO public.bank_transaction_links(bank_transaction_id,link_type,linked_order_id,amount,status,confidence,notes,created_by) VALUES(bt.id,p_link_type,o.id,v_amount,'confirmed',1,p_notes,auth.uid()) ON CONFLICT(bank_transaction_id,link_type,linked_order_id,linked_expense_id,linked_bank_transaction_id) DO UPDATE SET amount=EXCLUDED.amount,status='confirmed',confidence=1,notes=EXCLUDED.notes;
 UPDATE public.bank_transactions SET reconciled_with_order_id=o.id,is_reconciled=true,reconciliation_status='reconciled',financial_treatment=CASE WHEN p_link_type='refund' THEN 'customer_refund' WHEN p_link_type='gateway_payout' THEN 'gateway_payout' ELSE 'order_payment' END,transaction_category=CASE WHEN p_link_type='refund' THEN 'refund' ELSE COALESCE(transaction_category,'customer_payment') END,classification_status='classified',classified_at=COALESCE(classified_at,now()),notes=COALESCE(p_notes,notes),updated_at=now() WHERE id=bt.id;
 RETURN jsonb_build_object('bank_transaction_id',bt.id,'order_id',o.id,'amount',v_amount,'link_type',p_link_type);
END; $$;
GRANT EXECUTE ON FUNCTION public.confirm_bank_order_match(uuid,uuid,numeric,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_own_account_transfer(p_from_transaction_id uuid,p_to_transaction_id uuid,p_notes text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.bank_transactions%ROWTYPE; b public.bank_transactions%ROWTYPE; g uuid:=gen_random_uuid();
BEGIN
 IF NOT public.finance_can_manage() THEN RAISE EXCEPTION 'Not authorised'; END IF;
 SELECT * INTO a FROM public.bank_transactions WHERE id=p_from_transaction_id FOR UPDATE; SELECT * INTO b FROM public.bank_transactions WHERE id=p_to_transaction_id FOR UPDATE;
 IF a.id IS NULL OR b.id IS NULL THEN RAISE EXCEPTION 'Both bank transactions are required'; END IF; IF a.bank_account_id=b.bank_account_id THEN RAISE EXCEPTION 'Transfer must be between different bank accounts'; END IF; IF abs(abs(a.amount)-abs(b.amount))>0.01 THEN RAISE EXCEPTION 'Transfer amounts do not match'; END IF;
 UPDATE public.bank_transactions SET transfer_group_id=g,financial_treatment='own_account_transfer',reconciliation_status='reconciled',is_reconciled=true,transaction_category='internal_transfer',classification_status='classified',classified_at=COALESCE(classified_at,now()),notes=COALESCE(p_notes,notes),updated_at=now() WHERE id IN (a.id,b.id); RETURN g;
END; $$;
GRANT EXECUTE ON FUNCTION public.mark_own_account_transfer(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE VIEW public.v_finance_cashless_position AS
WITH bank AS (SELECT COALESCE(SUM(current_balance),0) bank_balance FROM public.store_bank_accounts WHERE COALESCE(is_active,true)),
pay AS (SELECT COALESCE(SUM(GREATEST(COALESCE(total_amount,0)-COALESCE(amount_paid,0),0)),0) payables,COALESCE(SUM(GREATEST(COALESCE(total_amount,0)-COALESCE(amount_paid,0),0)) FILTER(WHERE due_date<=CURRENT_DATE),0) due_now,COALESCE(SUM(GREATEST(COALESCE(total_amount,0)-COALESCE(amount_paid,0),0)) FILTER(WHERE due_date> CURRENT_DATE AND due_date<=CURRENT_DATE+7),0) due_7_days,COALESCE(SUM(GREATEST(COALESCE(total_amount,0)-COALESCE(amount_paid,0),0)) FILTER(WHERE due_date> CURRENT_DATE AND due_date<=CURRENT_DATE+30),0) due_30_days FROM public.supplier_invoices WHERE COALESCE(payment_status,'') NOT IN ('paid','cancelled'))
SELECT bank.bank_balance,pay.payables,pay.due_now,pay.due_7_days,pay.due_30_days,bank.bank_balance-pay.due_7_days projected_bank_after_7_day_payables,bank.bank_balance-pay.due_30_days projected_bank_after_30_day_payables FROM bank CROSS JOIN pay;
GRANT SELECT ON public.v_finance_cashless_position TO authenticated;

CREATE OR REPLACE VIEW public.v_finance_pnl_by_product AS SELECT oi.product_id,oi.product_name,SUM(COALESCE(oi.quantity,0)) units_sold,SUM(COALESCE(oi.total_price,COALESCE(oi.quantity,0)*COALESCE(oi.unit_price,0),0)) revenue,SUM(COALESCE(oi.quantity,0)*COALESCE(oi.cost_price,0)) cogs,SUM(COALESCE(oi.total_price,COALESCE(oi.quantity,0)*COALESCE(oi.unit_price,0),0)-COALESCE(oi.quantity,0)*COALESCE(oi.cost_price,0)) gross_profit FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id WHERE COALESCE(o.is_deleted,false)=false AND COALESCE(o.order_status,'') NOT IN ('cancelled','refunded','failed') GROUP BY oi.product_id,oi.product_name;
GRANT SELECT ON public.v_finance_pnl_by_product TO authenticated;
CREATE OR REPLACE VIEW public.v_finance_pnl_by_customer AS SELECT o.user_id,o.customer_email,o.customer_name,COUNT(*) orders,SUM(COALESCE(NULLIF(o.total_amount,0),NULLIF(o.total_revenue,0),NULLIF(o.total,0),COALESCE(o.subtotal,0)+COALESCE(o.delivery_fee,0))) revenue,SUM(COALESCE(o.product_cost_net,o.order_cost,0)) cogs,SUM(COALESCE(o.packing_cost_net,o.packing_cost,0)+COALESCE(o.shipping_cost_net,o.shipping_cost,0)+COALESCE(o.gateway_fee_net,o.gateway_fee_actual,o.payment_fee,0)) variable_costs,SUM(COALESCE(o.order_profit,0)) contribution_profit FROM public.orders o WHERE COALESCE(o.is_deleted,false)=false AND COALESCE(o.order_status,'') NOT IN ('cancelled','refunded','failed') GROUP BY o.user_id,o.customer_email,o.customer_name;
GRANT SELECT ON public.v_finance_pnl_by_customer TO authenticated;
CREATE OR REPLACE VIEW public.v_finance_pnl_by_supplier AS SELECT s.id supplier_id,s.name supplier_name,COUNT(si.id) invoices,COALESCE(SUM(si.total_amount),0) invoiced_value,COALESCE(SUM(GREATEST(COALESCE(si.total_amount,0)-COALESCE(si.amount_paid,0),0)),0) outstanding_value,COALESCE(SUM(si.amount_paid),0) paid_value FROM public.suppliers s LEFT JOIN public.supplier_invoices si ON si.supplier_id=s.id AND COALESCE(si.payment_status,'')<>'cancelled' GROUP BY s.id,s.name;
GRANT SELECT ON public.v_finance_pnl_by_supplier TO authenticated;
CREATE OR REPLACE VIEW public.v_finance_cashless_exceptions AS SELECT id,order_number,customer_name,created_at,total_amount,payment_method,payment_status FROM public.orders WHERE lower(COALESCE(payment_method,'')) IN ('cod','cash','cash_on_delivery');
GRANT SELECT ON public.v_finance_cashless_exceptions TO authenticated;
NOTIFY pgrst,'reload schema';
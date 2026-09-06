CREATE OR REPLACE FUNCTION public.finance_can_manage()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id=auth.uid() AND up.profile_role='admin' AND COALESCE(up.is_active,true))
    OR EXISTS (SELECT 1 FROM public.store_staff ss WHERE ss.user_id=auth.uid() AND ss.role IN ('admin','staff'))
  );
$$;

CREATE OR REPLACE FUNCTION public.classify_financial_transaction(
  p_transaction_id uuid,
  p_transaction_category text,
  p_accounting_category text,
  p_notes text DEFAULT NULL,
  p_supplier_invoice_id uuid DEFAULT NULL,
  p_expense_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_order_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_now timestamptz:=now();
BEGIN
  IF NOT public.finance_can_manage() THEN RAISE EXCEPTION 'Not authorised to classify financial transactions'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bank_transactions WHERE id=p_transaction_id) THEN RAISE EXCEPTION 'Bank transaction not found'; END IF;
  UPDATE public.bank_transactions
  SET transaction_category=p_transaction_category,
      transaction_type=CASE p_transaction_category WHEN 'sales_income' THEN 'revenue' WHEN 'supplier_payment' THEN 'supplier_payment' WHEN 'operating_expense' THEN 'operating_expense' WHEN 'other_income' THEN 'other_income' WHEN 'other_expense' THEN 'other_expense' WHEN 'tax' THEN 'tax' WHEN 'refund' THEN 'refund' WHEN 'transfer' THEN 'transfer' WHEN 'financing' THEN 'financing' ELSE 'other_expense' END,
      accounting_category=p_accounting_category,
      notes=p_notes,
      supplier_invoice_id=COALESCE(p_supplier_invoice_id,supplier_invoice_id),
      expense_id=COALESCE(p_expense_id,expense_id),
      customer_id=COALESCE(p_customer_id,customer_id),
      reconciled_with_order_id=COALESCE(p_order_id,reconciled_with_order_id),
      classification_status=CASE WHEN p_transaction_category='unknown' THEN 'needs_review' ELSE 'classified' END,
      classified_at=v_now, classified_by=auth.uid(), updated_at=v_now
  WHERE id=p_transaction_id;
  RETURN jsonb_build_object('success',true,'transaction_id',p_transaction_id);
END; $$;

CREATE OR REPLACE VIEW public.v_finance_cashflow_summary AS
SELECT COALESCE(SUM(CASE WHEN bt.type='credit' THEN bt.amount ELSE 0 END),0) AS total_inflow,
       COALESCE(SUM(CASE WHEN bt.type='debit' THEN bt.amount ELSE 0 END),0) AS total_outflow,
       COALESCE(SUM(CASE WHEN bt.type='credit' THEN bt.amount ELSE -bt.amount END),0) AS net_cashflow,
       COUNT(*) FILTER (WHERE COALESCE(bt.transaction_category,'unknown')='unknown' OR bt.classification_status='needs_review') AS needs_review_count
FROM public.bank_transactions bt
WHERE bt.transaction_date>=CURRENT_DATE-29;

GRANT EXECUTE ON FUNCTION public.finance_can_manage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.classify_financial_transaction(uuid,text,text,text,uuid,uuid,uuid,uuid) TO authenticated;
GRANT SELECT ON public.v_finance_cashflow_summary TO authenticated;

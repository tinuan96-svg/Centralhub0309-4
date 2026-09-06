-- Finance: savings / earmarked-funds treatment.
-- Growing Pot is an internal savings allocation, not business income or an expense.
-- It must affect the bank balance but must NOT affect P&L, profitability or pricing costs.

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
      transaction_type=CASE
        WHEN p_transaction_category IN ('transfer','internal_transfer','savings_allocation') THEN 'transfer'
        WHEN p_transaction_category='sales_income' THEN 'revenue'
        WHEN p_transaction_category='supplier_payment' THEN 'supplier_payment'
        WHEN p_transaction_category='operating_expense' THEN 'operating_expense'
        WHEN p_transaction_category='other_income' THEN 'other_income'
        WHEN p_transaction_category='other_expense' THEN 'other_expense'
        WHEN p_transaction_category='tax' THEN 'tax'
        WHEN p_transaction_category='refund' THEN 'refund'
        WHEN p_transaction_category='financing' THEN 'financing'
        ELSE 'other_expense'
      END,
      accounting_category=CASE
        WHEN p_transaction_category='savings_allocation' THEN 'transfer'
        ELSE p_accounting_category
      END,
      financial_treatment=CASE
        WHEN p_transaction_category='savings_allocation' THEN 'internal_savings_allocation'
        ELSE COALESCE(financial_treatment,'unclassified')
      END,
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

GRANT EXECUTE ON FUNCTION public.classify_financial_transaction(uuid,text,text,text,uuid,uuid,uuid,uuid) TO authenticated;

-- Existing Growing Pot movements are internal earmarked savings movements.
UPDATE public.bank_transactions
SET transaction_category='savings_allocation',
    transaction_type='transfer',
    accounting_category='transfer',
    financial_treatment='internal_savings_allocation',
    classification_status='classified',
    classified_at=COALESCE(classified_at,now()),
    updated_at=now()
WHERE lower(trim(COALESCE(description,'')))='growing pot'
   OR lower(trim(COALESCE(merchant,'')))='growing pot';

NOTIFY pgrst,'reload schema';

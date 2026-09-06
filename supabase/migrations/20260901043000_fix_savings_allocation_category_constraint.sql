-- Savings allocations are an internal cash movement. The bank_transactions
-- constraint intentionally stores these as the existing valid `transfer`
-- category while the UI may use the clearer `savings_allocation` action label.
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
DECLARE
  v_now timestamptz := now();
  v_category text := CASE
    WHEN p_transaction_category = 'savings_allocation' THEN 'transfer'
    ELSE p_transaction_category
  END;
  v_accounting text := CASE
    WHEN p_transaction_category = 'savings_allocation' THEN 'transfer'
    ELSE p_accounting_category
  END;
BEGIN
  IF NOT public.finance_can_manage() THEN
    RAISE EXCEPTION 'Not authorised to classify financial transactions';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.bank_transactions WHERE id = p_transaction_id) THEN
    RAISE EXCEPTION 'Bank transaction not found';
  END IF;

  UPDATE public.bank_transactions
  SET transaction_category = v_category,
      transaction_type = CASE v_category
        WHEN 'sales_income' THEN 'revenue'
        WHEN 'supplier_payment' THEN 'supplier_payment'
        WHEN 'operating_expense' THEN 'operating_expense'
        WHEN 'other_income' THEN 'other_income'
        WHEN 'other_expense' THEN 'other_expense'
        WHEN 'tax' THEN 'tax'
        WHEN 'refund' THEN 'refund'
        WHEN 'transfer' THEN 'transfer'
        WHEN 'financing' THEN 'financing'
        ELSE 'other_expense'
      END,
      accounting_category = v_accounting,
      notes = p_notes,
      supplier_invoice_id = COALESCE(p_supplier_invoice_id, supplier_invoice_id),
      expense_id = COALESCE(p_expense_id, expense_id),
      customer_id = COALESCE(p_customer_id, customer_id),
      reconciled_with_order_id = COALESCE(p_order_id, reconciled_with_order_id),
      classification_status = CASE WHEN v_category = 'unknown' THEN 'needs_review' ELSE 'classified' END,
      classified_at = v_now,
      classified_by = auth.uid(),
      updated_at = v_now
  WHERE id = p_transaction_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', p_transaction_id, 'stored_category', v_category);
END;
$$;

GRANT EXECUTE ON FUNCTION public.classify_financial_transaction(uuid,text,text,text,uuid,uuid,uuid,uuid) TO authenticated;

-- Existing Growing Pot movements are internal transfers, never P&L expenses.
UPDATE public.bank_transactions
SET transaction_category = 'transfer',
    transaction_type = 'transfer',
    accounting_category = 'transfer',
    classification_status = 'classified',
    classified_at = COALESCE(classified_at, now()),
    notes = CASE
      WHEN notes IS NULL OR notes = '' THEN 'Growing Pot — internal savings allocation; excluded from P&L and pricing costs.'
      ELSE notes
    END,
    updated_at = now()
WHERE lower(COALESCE(description,'')) LIKE '%growing pot%'
   OR lower(COALESCE(merchant,'')) LIKE '%growing pot%';

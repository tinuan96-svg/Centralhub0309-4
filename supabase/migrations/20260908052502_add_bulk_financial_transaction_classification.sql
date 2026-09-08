-- Bulk classification for repeated bank transactions.
-- The UI uses this RPC after the administrator confirms the matched rows.
-- Reconciled rows remain protected from bulk reclassification.

CREATE OR REPLACE FUNCTION public.classify_financial_transactions(
  p_transaction_ids uuid[],
  p_transaction_category text,
  p_accounting_category text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  v_requested_count integer := (
    SELECT count(*)
    FROM (SELECT DISTINCT id FROM unnest(COALESCE(p_transaction_ids, ARRAY[]::uuid[])) AS id) requested
  );
  v_updated_count integer;
BEGIN
  IF NOT public.finance_can_manage() THEN
    RAISE EXCEPTION 'Not authorised to classify financial transactions';
  END IF;

  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'At least one bank transaction is required';
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
      classification_status = CASE WHEN v_category = 'unknown' THEN 'needs_review' ELSE 'classified' END,
      classified_at = v_now,
      classified_by = auth.uid(),
      updated_at = v_now
  WHERE id = ANY(COALESCE(p_transaction_ids, ARRAY[]::uuid[]))
    AND COALESCE(is_reconciled, false) = false
    AND COALESCE(reconciliation_status, '') <> 'reconciled';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'requested_count', v_requested_count,
    'updated_count', v_updated_count,
    'stored_category', v_category
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.classify_financial_transactions(uuid[],text,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.classify_financial_transactions(uuid[],text,text,text) TO authenticated;

-- Apply a selected Chart of Accounts head and reconcile the matched bank transactions atomically.
-- Classification-only reconciliation remains available through the existing RPC.

CREATE OR REPLACE FUNCTION public.classify_assign_and_reconcile_financial_transactions(
  p_transaction_ids uuid[],
  p_transaction_category text,
  p_accounting_category text,
  p_ledger_account_id uuid,
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
  v_reconciliation_notes text := NULLIF(btrim(p_notes), '');
  v_requested_count integer := (
    SELECT count(*)
    FROM (
      SELECT DISTINCT id
      FROM unnest(COALESCE(p_transaction_ids, ARRAY[]::uuid[])) AS id
    ) requested
  );
  v_updated_count integer;
  v_ledger_id uuid;
BEGIN
  IF NOT public.finance_can_manage() THEN
    RAISE EXCEPTION 'Not authorised to classify, assign and reconcile financial transactions';
  END IF;

  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'At least one bank transaction is required';
  END IF;

  SELECT id
    INTO v_ledger_id
  FROM public.finance_ledger_accounts
  WHERE id = p_ledger_account_id
    AND is_active = true;

  IF v_ledger_id IS NULL THEN
    RAISE EXCEPTION 'Ledger account not found or inactive';
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
      ledger_account_id = v_ledger_id,
      ledger_assigned_at = v_now,
      ledger_assigned_by = auth.uid(),
      notes = COALESCE(p_notes, notes),
      classification_status = CASE WHEN v_category = 'unknown' THEN 'needs_review' ELSE 'classified' END,
      classified_at = v_now,
      classified_by = auth.uid(),
      is_reconciled = true,
      reconciliation_status = 'reconciled',
      reconciliation_notes = COALESCE(v_reconciliation_notes, reconciliation_notes),
      updated_at = v_now
  WHERE id = ANY(COALESCE(p_transaction_ids, ARRAY[]::uuid[]))
    AND COALESCE(is_reconciled, false) = false
    AND COALESCE(reconciliation_status, '') <> 'reconciled';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'requested_count', v_requested_count,
    'updated_count', v_updated_count,
    'stored_category', v_category,
    'ledger_account_id', v_ledger_id,
    'reconciled', true
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.classify_assign_and_reconcile_financial_transactions(uuid[],text,text,uuid,text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.classify_assign_and_reconcile_financial_transactions(uuid[],text,text,uuid,text) TO authenticated;

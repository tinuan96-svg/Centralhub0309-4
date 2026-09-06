-- Finance reconciliation control: explicit reconciliation workflow for cashless bank movements.
-- Classification and reconciliation are intentionally separate concepts.

CREATE OR REPLACE FUNCTION public.reconcile_bank_transaction(
  p_transaction_id uuid,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  bt public.bank_transactions%ROWTYPE;
BEGIN
  IF NOT public.finance_can_manage() THEN RAISE EXCEPTION 'Not authorised'; END IF;

  SELECT * INTO bt
  FROM public.bank_transactions
  WHERE id=p_transaction_id
  FOR UPDATE;

  IF bt.id IS NULL THEN RAISE EXCEPTION 'Bank transaction not found'; END IF;

  UPDATE public.bank_transactions
  SET is_reconciled=true,
      reconciliation_status='reconciled',
      reconciliation_notes=COALESCE(p_notes,reconciliation_notes),
      updated_at=now()
  WHERE id=bt.id;

  RETURN jsonb_build_object(
    'bank_transaction_id', bt.id,
    'reconciliation_status', 'reconciled'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_bank_transaction(uuid,text) TO authenticated;

CREATE OR REPLACE VIEW public.v_bank_reconciliation_summary AS
SELECT
  COUNT(*)::int AS total_transactions,
  COUNT(*) FILTER (WHERE COALESCE(is_reconciled,false)=false)::int AS unreconciled_transactions,
  COUNT(*) FILTER (WHERE COALESCE(is_reconciled,false)=true)::int AS reconciled_transactions,
  COUNT(*) FILTER (WHERE COALESCE(is_reconciled,false)=false AND transaction_date < CURRENT_DATE)::int AS overdue_reconciliation_transactions,
  COALESCE(SUM(ABS(COALESCE(amount,0))) FILTER (WHERE COALESCE(is_reconciled,false)=false),0) AS unreconciled_value
FROM public.bank_transactions;

GRANT SELECT ON public.v_bank_reconciliation_summary TO authenticated;
NOTIFY pgrst,'reload schema';

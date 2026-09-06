BEGIN;

CREATE OR REPLACE FUNCTION public.reconcile_bank_transaction(
  p_transaction_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
BEGIN
  UPDATE public.bank_transactions
  SET is_reconciled = true,
      reconciliation_status = 'reconciled',
      reconciliation_notes = COALESCE(NULLIF(btrim(p_notes),''), reconciliation_notes),
      updated_at = now()
  WHERE id = p_transaction_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_transaction(
  p_bank_transaction_id uuid,
  p_gateway_transaction_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
BEGIN
  UPDATE public.bank_transactions
  SET is_reconciled = true,
      reconciliation_status = 'reconciled',
      reconciliation_notes = COALESCE(reconciliation_notes, CASE WHEN p_gateway_transaction_id IS NULL THEN NULL ELSE 'Reconciled with gateway transaction ' || p_gateway_transaction_id::text END),
      updated_at = now()
  WHERE id = p_bank_transaction_id;
  RETURN FOUND;
END;
$$;

DROP TRIGGER IF EXISTS trg_bank_transaction_reserve_allocation ON public.bank_transactions;
CREATE TRIGGER trg_bank_transaction_reserve_allocation
AFTER UPDATE OF is_reconciled ON public.bank_transactions
FOR EACH ROW
WHEN (NEW.is_reconciled = true AND COALESCE(OLD.is_reconciled,false) = false)
EXECUTE FUNCTION public.trg_bank_transaction_reserve_allocation();

CREATE OR REPLACE VIEW public.v_reserve_allocation_integrity AS
SELECT
  a.id AS allocation_id,
  a.bank_transaction_id,
  bt.transaction_date,
  bt.amount AS bank_amount,
  bt.is_reconciled,
  bt.reconciliation_status,
  bt.reserve_allocation_enabled,
  a.reserve_type_id,
  rt.name AS reserve_name,
  a.amount AS allocated_amount,
  a.status,
  CASE
    WHEN a.bank_transaction_id IS NULL THEN 'missing_bank_transaction'
    WHEN bt.id IS NULL THEN 'orphaned_bank_transaction'
    WHEN a.status <> 'reversed' AND COALESCE(bt.reserve_allocation_enabled,true) = false THEN 'excluded_payment_has_active_allocation'
    ELSE 'ok'
  END AS integrity_status
FROM public.finance_reserve_allocations a
LEFT JOIN public.bank_transactions bt ON bt.id = a.bank_transaction_id
LEFT JOIN public.finance_reserve_types rt ON rt.id = a.reserve_type_id;

COMMIT;

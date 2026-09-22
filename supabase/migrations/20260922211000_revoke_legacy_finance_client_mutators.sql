-- Issue #4 privileged finance surface hardening.
-- Trigger functions are invoked by PostgreSQL internally and do not need direct
-- authenticated EXECUTE. Legacy maintenance/reconciliation helpers must not be
-- callable by a staff/client JWT; vetted staff workflows use service-role-only
-- ch_staff_* RPCs with live identity, permission and store checks.
do $$
declare v_sig regprocedure;
begin
 foreach v_sig in array array[
  'public.allocate_reserves_for_reconciled_sale(uuid,uuid)'::regprocedure,
  'public.apply_bank_ledger_auto_rule_to_transaction(uuid)'::regprocedure,
  'public.apply_bank_transaction_classification_rules(uuid)'::regprocedure,
  'public.finance_sync_posted_input_vat(uuid)'::regprocedure,
  'public.reconcile_bank_transaction(uuid,text)'::regprocedure,
  'public.reconcile_stored_mollie_fee_for_order(uuid)'::regprocedure,
  'public.reconcile_webhook_logs_from_net(integer)'::regprocedure,
  'public.record_supplier_invoice_payment(uuid,numeric,uuid,date,text,text)'::regprocedure,
  'public.refresh_bank_transaction_reconciliation(uuid,text)'::regprocedure,
  'public.refresh_supplier_invoice_profitability(uuid)'::regprocedure,
  'public.set_bank_transaction_reserve_allocation(uuid,boolean,text)'::regprocedure,
  'public.sync_bank_transaction_pnl_expense(uuid)'::regprocedure,
  'public.trigger_gmail_finance_reconcile(boolean)'::regprocedure
 ] loop
  execute format('revoke execute on function %s from public, anon, authenticated',v_sig);
 end loop;
end $$;

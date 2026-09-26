-- Cache row-independent RLS authorization checks for bank transactions only.
-- Preserves the existing eight policy roles, commands, predicates, and store-scoped checks.
-- Existing row-dependent staff_has_store_access(store_id) remains per row.
ALTER POLICY "centralhub_admin_only" ON public.bank_transactions
  USING ((select public.is_admin()))
  WITH CHECK ((select public.is_admin()));

ALTER POLICY "ch_staff_direct_access_block" ON public.bank_transactions
  USING (((NOT (select public.ch_is_staff_identity())) OR (select public.is_active_staff())))
  WITH CHECK (((NOT (select public.ch_is_staff_identity())) OR (select public.is_active_staff())));

ALTER POLICY "ch_staff_strict_delete" ON public.bank_transactions
  USING ((NOT (select public.ch_is_staff_identity())));

ALTER POLICY "ch_staff_strict_insert" ON public.bank_transactions
  WITH CHECK ((NOT (select public.ch_is_staff_identity())));

ALTER POLICY "ch_staff_strict_select" ON public.bank_transactions
  USING (((NOT (select public.ch_is_staff_identity())) OR ((select public.is_active_staff()) AND ((select public.staff_has_permission('finance.view'::text)) AND staff_has_store_access(store_id)))));

ALTER POLICY "ch_staff_strict_update" ON public.bank_transactions
  USING ((NOT (select public.ch_is_staff_identity())))
  WITH CHECK ((NOT (select public.ch_is_staff_identity())));

ALTER POLICY "staff_bank_transactions_select" ON public.bank_transactions
  USING (((select public.staff_has_permission('finance.view'::text)) AND staff_has_store_access(store_id)));

ALTER POLICY "staff_bank_transactions_update" ON public.bank_transactions
  USING ((((select public.staff_has_permission('finance.edit'::text)) OR (select public.staff_has_permission('finance.reconcile'::text))) AND staff_has_store_access(store_id)))
  WITH CHECK ((((select public.staff_has_permission('finance.edit'::text)) OR (select public.staff_has_permission('finance.reconcile'::text))) AND staff_has_store_access(store_id)));

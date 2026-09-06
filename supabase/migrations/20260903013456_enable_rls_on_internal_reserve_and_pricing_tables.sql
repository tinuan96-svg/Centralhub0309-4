-- Restore RLS protection for internal reserve and pricing tables.
-- CentralHub is an authenticated single-admin control plane; service-role
-- Edge Functions continue to bypass RLS where backend jobs require it.

ALTER TABLE public.finance_reserve_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_reserve_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_reserve_spendings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_reserve_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_reserve_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_experiment_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_optimization_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reserve_purchase_cost_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "centralhub_admin_full_access_finance_reserve_allocations"
  ON public.finance_reserve_allocations
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "centralhub_admin_full_access_finance_reserve_settings"
  ON public.finance_reserve_settings
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "centralhub_admin_full_access_finance_reserve_spendings"
  ON public.finance_reserve_spendings
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "centralhub_admin_full_access_finance_reserve_transfers"
  ON public.finance_reserve_transfers
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "centralhub_admin_full_access_finance_reserve_types"
  ON public.finance_reserve_types
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "centralhub_admin_full_access_pricing_experiment_results"
  ON public.pricing_experiment_results
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "centralhub_admin_full_access_pricing_optimization_runs"
  ON public.pricing_optimization_runs
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "centralhub_admin_full_access_reserve_purchase_cost_allocations"
  ON public.reserve_purchase_cost_allocations
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Restore admin visibility for the existing Mollie accounting tables used by the audit page.

alter table public.mollie_balance_transactions enable row level security;

drop policy if exists "Admin can read Mollie balance transactions"
  on public.mollie_balance_transactions;

create policy "Admin can read Mollie balance transactions"
  on public.mollie_balance_transactions
  for select
  to authenticated
  using (public.is_admin());

grant select on public.mollie_balance_transactions to authenticated;

alter table public.mollie_accounting_sync_state enable row level security;

drop policy if exists "Admin can read Mollie accounting sync state"
  on public.mollie_accounting_sync_state;

create policy "Admin can read Mollie accounting sync state"
  on public.mollie_accounting_sync_state
  for select
  to authenticated
  using (public.is_admin());

grant select on public.mollie_accounting_sync_state to authenticated;

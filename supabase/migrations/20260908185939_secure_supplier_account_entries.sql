alter table public.supplier_account_entries enable row level security;

revoke all privileges on table public.supplier_account_entries from anon;
revoke truncate, references, trigger on table public.supplier_account_entries from authenticated;

drop policy if exists centralhub_admin_only on public.supplier_account_entries;
create policy centralhub_admin_only
on public.supplier_account_entries
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

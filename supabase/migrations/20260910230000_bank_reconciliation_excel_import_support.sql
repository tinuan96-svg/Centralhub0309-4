-- Generic support for attaching reviewed spreadsheet evidence to bank transactions.
-- Raw/private bank data is intentionally not committed to GitHub.

create table if not exists public.bank_reconciliation_import_batches (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete set null,
  source_name text not null default 'excel_reconciliation',
  source_file_name text not null,
  file_sha256 text not null,
  period_start date,
  period_end date,
  status text not null default 'imported' check (status in ('imported','matched','review_required','completed')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_bank_reconciliation_import_batch_file
  on public.bank_reconciliation_import_batches(store_id, file_sha256);

create table if not exists public.bank_reconciliation_import_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.bank_reconciliation_import_batches(id) on delete cascade,
  record_kind text not null default 'bank_transaction' check (record_kind in ('bank_transaction','supplier_evidence','reimbursement_evidence','control')),
  source_sheet text not null,
  source_row integer not null,
  bank_name text,
  bank_account_label text,
  transaction_date date,
  external_reference text,
  description text,
  merchant text,
  amount_signed numeric(14,2),
  direction text check (direction is null or direction in ('credit','debit')),
  suggested_legacy_account_code text,
  suggested_account_name text,
  suggested_tax_rate text,
  review_status text,
  evidence_note text,
  canonical_ledger_account_id uuid references public.finance_ledger_accounts(id) on delete set null,
  matched_bank_transaction_id uuid references public.bank_transactions(id) on delete set null,
  match_status text not null default 'pending' check (match_status in ('pending','matched','ambiguous','unmatched','not_applicable')),
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_id, source_sheet, source_row)
);

create index if not exists idx_bank_recon_import_items_batch_status
  on public.bank_reconciliation_import_items(batch_id, match_status, transaction_date);
create index if not exists idx_bank_recon_import_items_matched_tx
  on public.bank_reconciliation_import_items(matched_bank_transaction_id)
  where matched_bank_transaction_id is not null;
create index if not exists idx_bank_recon_import_items_lookup
  on public.bank_reconciliation_import_items(bank_name, transaction_date, direction, amount_signed);

alter table public.bank_reconciliation_import_batches enable row level security;
alter table public.bank_reconciliation_import_items enable row level security;

drop policy if exists centralhub_admin_only on public.bank_reconciliation_import_batches;
create policy centralhub_admin_only on public.bank_reconciliation_import_batches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists centralhub_admin_only on public.bank_reconciliation_import_items;
create policy centralhub_admin_only on public.bank_reconciliation_import_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.bank_reconciliation_import_batches to authenticated;
grant select, insert, update, delete on public.bank_reconciliation_import_items to authenticated;

-- Processor settlements are not sales by themselves. Keep them off the P&L until
-- the settlement is allocated to underlying sales, refunds and processor fees.
insert into public.finance_ledger_accounts
  (code,name,ledger_type,pnl_class,pricing_relevant,description,is_system,is_active)
select
  '1210',
  'Payment processor clearing',
  'asset',
  'none',
  false,
  'Clearing account for Stripe, Mollie, SumUp, EVO and similar processor settlements pending allocation to sales, fees and refunds.',
  true,
  true
where not exists (select 1 from public.finance_ledger_accounts where code='1210');

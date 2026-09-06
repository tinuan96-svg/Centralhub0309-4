alter table public.supplier_invoices add column if not exists file_url text;
comment on column public.supplier_invoices.file_url is 'Private storage object path for supplier invoice evidence; resolve to a signed URL for viewing.';

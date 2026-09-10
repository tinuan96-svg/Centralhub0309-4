-- Repair schema drift in the CentralHub product soft-delete contract.
-- The UI and bulk_soft_delete_products() both record products.deleted_at,
-- but the live products table had lost that column even though the original
-- soft-delete migration remained in migration history.

alter table public.products
  add column if not exists deleted_at timestamptz;

comment on column public.products.deleted_at is
  'Timestamp recorded when a product is soft-deleted in CentralHub.';

-- Ensure the Data API immediately sees the repaired column.
notify pgrst, 'reload schema';

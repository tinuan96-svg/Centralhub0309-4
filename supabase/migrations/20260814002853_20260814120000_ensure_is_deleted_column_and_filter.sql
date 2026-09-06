/*
# Ensure is_deleted column exists on products and add index

## Summary
Ensures the `is_deleted` column exists on the `products` table (added by an earlier
migration but re-checked here for safety) and creates an index on it so the inventory
page can efficiently filter out soft-deleted products.

## Changes
1. `products.is_deleted` -- boolean, default false (idempotent check)
2. Index on `is_deleted` for faster filtering
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'is_deleted') THEN
    ALTER TABLE public.products ADD COLUMN is_deleted boolean DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_is_deleted ON public.products (is_deleted);

NOTIFY pgrst, 'reload schema';

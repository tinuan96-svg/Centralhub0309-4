/*
# Add Purchase Days to Suppliers

1. Changes
  - Add `purchase_days` column to `suppliers` table.
  - Column type is `text[]` (array of strings like 'Monday', 'Tuesday').
  - Default value is an empty array `{}`.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'purchase_days') THEN
    ALTER TABLE public.suppliers ADD COLUMN purchase_days text[] DEFAULT '{}'::text[];
  END IF;
END $$;

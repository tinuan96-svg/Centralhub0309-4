/*
  # Add missing product_display_name column to keralagroceries and pocketgrocery tables

  The trigger functions fn_keralagroceries_apply_rules and fn_pocketgrocery_apply_rules
  both set NEW.product_display_name, but this column was never added to the tables.
  Every product UPDATE was failing with "column product_display_name does not exist".
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'keralagroceries' AND column_name = 'product_display_name'
  ) THEN
    ALTER TABLE public.keralagroceries ADD COLUMN product_display_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pocketgrocery' AND column_name = 'product_display_name'
  ) THEN
    ALTER TABLE public.pocketgrocery ADD COLUMN product_display_name text;
  END IF;
END $$;

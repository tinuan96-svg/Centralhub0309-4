/*
# Add Missing Inventory Columns to Products Table

## Purpose
Several Inventory Management tabs reference columns that do not exist in the
products table, causing SQL errors and blank/broken pages. This migration adds
those columns so the frontend queries succeed.

## Changes to `products` table:
1. `expiry_date` (date, nullable) — used by Expiry Management tabs to track
   product expiration dates. Defaults to NULL (no expiry).
2. `reorder_level` (integer, default 10) — used by Stock List tab to show
   "REORDER" status badge when stock falls below this threshold.
3. `is_active` (boolean, default true) — used by Reports tab to filter
   active products. Defaults to true so existing rows are treated as active.

## Security
No RLS changes. Existing policies on products remain unchanged.

## Notes
- All three columns use IF NOT EXISTS checks to be idempotent.
- Existing rows get sensible defaults (NULL expiry, 10 reorder, true active).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'expiry_date'
  ) THEN
    ALTER TABLE products ADD COLUMN expiry_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'reorder_level'
  ) THEN
    ALTER TABLE products ADD COLUMN reorder_level integer DEFAULT 10;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE products ADD COLUMN is_active boolean DEFAULT true;
  END IF;
END $$;

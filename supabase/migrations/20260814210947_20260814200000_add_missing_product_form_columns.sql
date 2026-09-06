/*
# Add Missing Product Form Columns

## Purpose
The ComprehensiveProductForm tries to write several fields that do not exist
in the products table, causing "Could not find the 'X' column of 'products'
in the schema cache" errors when saving. This migration adds all missing
columns so the form can save successfully.

## Changes to `products` table
1. `enable_stock_tracking` (boolean, default true) — controls whether stock
   levels are tracked for this product
2. `storage_type` (text, default 'ambient') — ambient, refrigerated, or frozen
3. `vat_rate` (numeric, default 0) — tax rate percentage
4. `seo_meta_title` (text) — SEO title override
5. `admin_notes` (text) — internal admin notes
6. `rich_description` (text) — extended HTML/markdown description
7. `length_cm` (numeric) — package length
8. `width_cm` (numeric) — package width
9. `height_cm` (numeric) — package height

All additions use IF NOT EXISTS so the migration is safe to re-run.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'enable_stock_tracking') THEN
    ALTER TABLE products ADD COLUMN enable_stock_tracking boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'storage_type') THEN
    ALTER TABLE products ADD COLUMN storage_type text DEFAULT 'ambient';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'vat_rate') THEN
    ALTER TABLE products ADD COLUMN vat_rate numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'seo_meta_title') THEN
    ALTER TABLE products ADD COLUMN seo_meta_title text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'admin_notes') THEN
    ALTER TABLE products ADD COLUMN admin_notes text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'rich_description') THEN
    ALTER TABLE products ADD COLUMN rich_description text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'length_cm') THEN
    ALTER TABLE products ADD COLUMN length_cm numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'width_cm') THEN
    ALTER TABLE products ADD COLUMN width_cm numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'height_cm') THEN
    ALTER TABLE products ADD COLUMN height_cm numeric;
  END IF;
END $$;

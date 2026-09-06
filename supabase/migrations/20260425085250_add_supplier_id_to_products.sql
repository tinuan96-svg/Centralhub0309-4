/*
  # Add supplier_id to products table

  1. Changes
    - Adds `supplier_id` (uuid, nullable, FK → suppliers.id) to `products`
    - Adds index for fast supplier lookups

  2. Notes
    - Nullable so existing products are unaffected
    - FK uses ON DELETE SET NULL so deleting a supplier doesn't break products
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'supplier_id'
  ) THEN
    ALTER TABLE products
      ADD COLUMN supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products(supplier_id);

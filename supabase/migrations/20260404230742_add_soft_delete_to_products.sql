/*
  # Add Soft Delete to Products

  1. Changes
    - Add is_deleted column to products table
    - Add deleted_at timestamp for audit trail
    - Update RLS policies to exclude deleted products
    - Add index for performance

  2. Purpose
    - Enable soft delete instead of hard delete
    - Maintain data integrity and audit trail
    - Allow product recovery if needed

  3. Security
    - RLS policies updated to filter deleted products
*/

-- Add is_deleted column to products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'is_deleted'
  ) THEN
    ALTER TABLE products ADD COLUMN is_deleted boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE products ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

-- Create index for soft delete filtering
CREATE INDEX IF NOT EXISTS idx_products_is_deleted ON products(is_deleted) WHERE is_deleted = false;

-- Update RLS policies to exclude deleted products
DROP POLICY IF EXISTS "Users can view products" ON products;
CREATE POLICY "Users can view products"
  ON products FOR SELECT
  TO authenticated
  USING (is_deleted = false);

DROP POLICY IF EXISTS "Users can manage products" ON products;
CREATE POLICY "Users can insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (is_deleted = false);

CREATE POLICY "Users can update products"
  ON products FOR UPDATE
  TO authenticated
  USING (is_deleted = false)
  WITH CHECK (true);

CREATE POLICY "Users can soft delete products"
  ON products FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON COLUMN products.is_deleted IS 'Soft delete flag - products are never hard deleted';
COMMENT ON COLUMN products.deleted_at IS 'Timestamp when product was soft deleted';

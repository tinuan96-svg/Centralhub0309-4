/*
  # Add Store Reference to Orders

  1. Changes
    - Add `store_id` column to orders table
    - Add foreign key constraint to stores table
    - Add index for performance

  2. Notes
    - Existing orders will have NULL store_id (acceptable for historical data)
    - New orders should always include store_id
*/

-- Add store_id column to orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN store_id uuid REFERENCES stores(id);
  END IF;
END $$;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON orders(store_id);

-- Add comment
COMMENT ON COLUMN orders.store_id IS 'Reference to the store where this order was placed';
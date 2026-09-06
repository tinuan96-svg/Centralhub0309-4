/*
  # Add Warehouse Location to Products

  1. Changes
    - Add `warehouse_location` column to `products` table
      - Type: text
      - Nullable: true
      - Used for order picking and packing location tracking
  
  2. Notes
    - Warehouse location will store uppercase alphanumeric codes (e.g., "RACK A, SHELF 3")
    - Essential for efficient order fulfillment workflow
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'warehouse_location'
  ) THEN
    ALTER TABLE products ADD COLUMN warehouse_location text;
  END IF;
END $$;
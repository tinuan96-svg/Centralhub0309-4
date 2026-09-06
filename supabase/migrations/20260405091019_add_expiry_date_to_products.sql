/*
  # Add Expiry Date to Products

  1. Changes
    - Add `expiry_date` column to `products` table (optional field)
    - Add index for querying products by expiry date
  
  2. Notes
    - This is an optional field for products that have expiration dates
    - Used for expiry management and tracking
    - Format: date (YYYY-MM-DD)
*/

-- Add expiry_date to products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'expiry_date'
  ) THEN
    ALTER TABLE products ADD COLUMN expiry_date date;
  END IF;
END $$;

-- Create index for performance when querying expiring products
CREATE INDEX IF NOT EXISTS idx_products_expiry_date ON products(expiry_date) WHERE expiry_date IS NOT NULL;
/*
  # Add Cost Price to Products Table
  
  1. New Columns
    - `products.cost_price` (numeric(10,2), nullable)
      - Represents the cost/wholesale price of the product
      - Used to calculate profit margins
      - Nullable to allow gradual data entry
      - Default: NULL
  
  2. Important Notes
    - This field is private business data and should not be exposed to public
    - Used only in admin dashboard for profit analysis
    - Profit calculation: total_revenue - (cost_price * quantity_sold)
*/

-- Add cost_price column to products table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'cost_price'
  ) THEN
    ALTER TABLE products ADD COLUMN cost_price numeric(10,2) DEFAULT NULL;
  END IF;
END $$;

-- Add comment explaining the column
COMMENT ON COLUMN products.cost_price IS 'Wholesale/cost price of the product. Used for profit margin calculations. Private data - not exposed to customers.';
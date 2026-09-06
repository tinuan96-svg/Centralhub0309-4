/*
  # Add company name to orders

  1. Changes
    - Add `company_name` column to orders table for customer/recipient company information
    - This field will be used for DHL API integration and shipping label generation
  
  2. Notes
    - Column is optional (nullable) as not all customers may have a company
    - Existing orders will have NULL company_name
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'company_name'
  ) THEN
    ALTER TABLE orders ADD COLUMN company_name text;
  END IF;
END $$;

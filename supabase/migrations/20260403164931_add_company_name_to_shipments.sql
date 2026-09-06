/*
  # Add company name to shipments

  1. Changes
    - Add `recipient_company_name` column to shipments table for storing recipient company information
    - This field will be populated from order data when creating shipments via DHL API
  
  2. Notes
    - Column is optional (nullable) as not all recipients may have a company
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shipments' AND column_name = 'recipient_company_name'
  ) THEN
    ALTER TABLE shipments ADD COLUMN recipient_company_name text;
  END IF;
END $$;

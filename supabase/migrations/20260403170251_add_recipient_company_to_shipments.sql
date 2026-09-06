/*
  # Add Recipient Company Name to Shipments

  ## Overview
  Adds recipient_company_name field to shipments table to support B2B shipping
  where company name is different from recipient contact name.

  ## Changes
  - Add recipient_company_name column (nullable text)

  ## Security
  - No RLS changes needed
  - Maintains existing policies

  ## Performance
  - No new indexes needed
  - Minimal impact on queries
*/

-- Add recipient_company_name column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shipments' AND column_name = 'recipient_company_name'
  ) THEN
    ALTER TABLE shipments ADD COLUMN recipient_company_name text;
  END IF;
END $$;

-- Add comment
COMMENT ON COLUMN shipments.recipient_company_name IS 'Company name for B2B shipments (different from recipient contact name)';

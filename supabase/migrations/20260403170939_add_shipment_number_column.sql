/*
  # Add Shipment Number Column

  1. Changes
    - Add `shipment_number` column to shipments table
    - Unique shipment identifier for tracking and reference
    - Format: SHIP-{timestamp}-{random}
    - Generate shipment numbers for existing shipments
  
  2. Notes
    - Backfills existing shipments with generated numbers
    - Future shipments will have numbers auto-generated in application code
*/

-- Add shipment_number column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shipments' AND column_name = 'shipment_number'
  ) THEN
    ALTER TABLE shipments ADD COLUMN shipment_number text UNIQUE;
  END IF;
END $$;

-- Backfill shipment numbers for existing records
UPDATE shipments
SET shipment_number = 'SHIP-' || EXTRACT(EPOCH FROM created_at)::bigint || '-' || LPAD(FLOOR(RANDOM() * 1000)::text, 3, '0')
WHERE shipment_number IS NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_shipments_shipment_number ON shipments(shipment_number);
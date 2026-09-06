/*
  # Add Ready to Ship Status

  ## Overview
  Adds 'ready_to_ship' status to shipments table to indicate when a shipment
  has been created with tracking number and label, and is ready for pickup/dispatch.

  ## Status Flow
  - not_shipped → ready_to_ship (shipment created with label)
  - ready_to_ship → in_transit (picked up by carrier)
  - in_transit → out_for_delivery → delivered
  - Any status → cancelled/returned/failed

  ## Changes
  1. Update shipments status constraint to include 'ready_to_ship'
  2. This status will be set automatically when shipment is created successfully

  ## Security
  - No RLS changes needed
  - Maintains existing policies

  ## Performance
  - No impact on existing queries
  - Uses existing indexes
*/

-- Update shipments status constraint to include 'ready_to_ship'
DO $$
BEGIN
  -- Drop the old constraint
  ALTER TABLE shipments 
    DROP CONSTRAINT IF EXISTS shipments_status_check;
  
  -- Add new constraint with 'ready_to_ship' status
  ALTER TABLE shipments 
    ADD CONSTRAINT shipments_status_check 
    CHECK (status IN ('not_shipped', 'ready_to_ship', 'label_created', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'cancelled', 'returned'));
END $$;

-- Add comment about status flow
COMMENT ON COLUMN shipments.status IS 'Shipment status: not_shipped → ready_to_ship (created with label) → in_transit → out_for_delivery → delivered. Can be cancelled/returned/failed at any stage.';

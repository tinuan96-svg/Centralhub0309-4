/*
  # Add 'confirmed' Status to Order Status

  ## Overview
  Adds 'confirmed' as a valid order_status value to support the automatic
  payment confirmation workflow. This status represents orders that have
  been paid and confirmed but not yet started processing.

  ## Status Flow
  - pending → confirmed (payment successful, inventory reserved)
  - confirmed → processing (order being prepared)
  - processing → shipped → delivered
  - Any status → cancelled

  ## Changes
  1. Update order_status_history constraint to include 'confirmed'
  2. Update any documentation comments

  ## Security
  - No RLS changes needed
  - Maintains existing policies

  ## Performance
  - No impact on existing queries
  - No new indexes needed
*/

-- Update order_status_history constraint to include 'confirmed'
DO $$
BEGIN
  -- Drop the old constraint
  ALTER TABLE order_status_history 
    DROP CONSTRAINT IF EXISTS order_status_history_new_status_check;
  
  -- Add new constraint with 'confirmed' status
  ALTER TABLE order_status_history 
    ADD CONSTRAINT order_status_history_new_status_check 
    CHECK (new_status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'));
  
  -- Also update old_status check if it exists
  ALTER TABLE order_status_history 
    DROP CONSTRAINT IF EXISTS order_status_history_old_status_check;
  
  ALTER TABLE order_status_history 
    ADD CONSTRAINT order_status_history_old_status_check 
    CHECK (old_status IS NULL OR old_status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'));
END $$;

-- Add comment about status flow
COMMENT ON COLUMN order_status_history.new_status IS 'Order status: pending (created) → confirmed (paid) → processing (preparing) → shipped → delivered. Can be cancelled at any stage.';

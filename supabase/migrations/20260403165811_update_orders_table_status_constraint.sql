/*
  # Update Orders Table Status Constraint

  ## Overview
  Updates the order_status constraint on the orders table to include 'confirmed'
  status, enabling the automatic payment confirmation workflow.

  ## Changes
  - Drop existing order_status_check constraint
  - Add new constraint with 'confirmed' status included

  ## Status Flow
  - pending → confirmed (automatic on payment)
  - confirmed → processing (manual warehouse start)
  - processing → shipped → delivered
  - Any status → cancelled

  ## Security
  - No RLS changes
  - Maintains data integrity

  ## Performance
  - No performance impact
  - Constraint validation is instant
*/

-- Update orders table constraint to include 'confirmed'
DO $$
BEGIN
  -- Drop the old constraint
  ALTER TABLE orders 
    DROP CONSTRAINT IF EXISTS orders_order_status_check;
  
  -- Add new constraint with 'confirmed' status
  ALTER TABLE orders 
    ADD CONSTRAINT orders_order_status_check 
    CHECK (order_status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'));
END $$;

-- Add helpful comment
COMMENT ON COLUMN orders.order_status IS 'Order processing status: pending → confirmed (auto on payment) → processing → shipped → delivered. Can be cancelled at any stage.';

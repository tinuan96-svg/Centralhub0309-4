/*
  # Add Order Fulfillment Workflow System

  1. Schema Changes
    - Add `fulfillment_status` enum to orders table
    - Add `packed_at` timestamp for tracking when order was packed
    - Add `ready_to_ship_at` timestamp for tracking when order is ready
    - Add `fulfillment_notes` for warehouse notes
    - Add indexes for filtering by fulfillment status

  2. Fulfillment Status Flow
    - pending: Order placed, not yet confirmed
    - confirmed: Order confirmed, awaiting packing
    - packed: Order packed, awaiting final check
    - ready_to_ship: Order ready for shipment creation
    - shipped: Shipment created and label generated
    - delivered: Order delivered to customer

  3. Security
    - Update RLS policies to allow order status updates
    - Add policies for fulfillment workflow operations

  4. Performance
    - Add indexes for common fulfillment queries
*/

-- Create fulfillment status enum
DO $$ BEGIN
  CREATE TYPE fulfillment_status AS ENUM (
    'pending',
    'confirmed',
    'packed',
    'ready_to_ship',
    'shipped',
    'delivered'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add fulfillment columns to orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'fulfillment_status'
  ) THEN
    ALTER TABLE orders ADD COLUMN fulfillment_status fulfillment_status DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'packed_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN packed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'ready_to_ship_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN ready_to_ship_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'fulfillment_notes'
  ) THEN
    ALTER TABLE orders ADD COLUMN fulfillment_notes text;
  END IF;
END $$;

-- Create indexes for fulfillment queries
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status ON orders(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_orders_ready_to_ship ON orders(fulfillment_status) WHERE fulfillment_status IN ('ready_to_ship', 'shipped');
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_created ON orders(fulfillment_status, created_at DESC);

-- Update existing orders to have confirmed status if they have order_status = 'completed'
UPDATE orders 
SET fulfillment_status = 'confirmed'
WHERE fulfillment_status = 'pending' 
  AND order_status IN ('completed', 'processing');

-- Update existing shipped orders
UPDATE orders o
SET fulfillment_status = 'shipped'
FROM shipments s
WHERE o.id = s.order_id 
  AND s.status IN ('in_transit', 'out_for_delivery', 'delivered')
  AND o.fulfillment_status != 'shipped';

-- Update delivered orders
UPDATE orders o
SET fulfillment_status = 'delivered'
FROM shipments s
WHERE o.id = s.order_id 
  AND s.status = 'delivered'
  AND o.fulfillment_status != 'delivered';

-- Create function to update fulfillment status
CREATE OR REPLACE FUNCTION update_order_fulfillment_status(
  p_order_id uuid,
  p_status fulfillment_status,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE orders
  SET 
    fulfillment_status = p_status,
    fulfillment_notes = COALESCE(p_notes, fulfillment_notes),
    packed_at = CASE WHEN p_status = 'packed' THEN now() ELSE packed_at END,
    ready_to_ship_at = CASE WHEN p_status = 'ready_to_ship' THEN now() ELSE ready_to_ship_at END,
    updated_at = now()
  WHERE id = p_order_id;
END;
$$;

-- Create function for bulk fulfillment status update
CREATE OR REPLACE FUNCTION bulk_update_fulfillment_status(
  p_order_ids uuid[],
  p_status fulfillment_status,
  p_notes text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE orders
  SET 
    fulfillment_status = p_status,
    fulfillment_notes = COALESCE(p_notes, fulfillment_notes),
    packed_at = CASE WHEN p_status = 'packed' THEN now() ELSE packed_at END,
    ready_to_ship_at = CASE WHEN p_status = 'ready_to_ship' THEN now() ELSE ready_to_ship_at END,
    updated_at = now()
  WHERE id = ANY(p_order_ids);
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Add RLS policy for fulfillment operations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Authenticated users can update order fulfillment' 
    AND tablename = 'orders'
  ) THEN
    CREATE POLICY "Authenticated users can update order fulfillment"
      ON orders
      FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

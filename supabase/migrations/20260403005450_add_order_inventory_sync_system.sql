/*
  # Order-Inventory Synchronization System

  1. New Tables
    - `order_status_history`
      - Tracks all order status changes with timestamps
      - Prevents duplicate inventory operations
      - Provides audit trail for order lifecycle
  
  2. New Columns
    - `orders.inventory_synced_at` - Timestamp of last successful inventory sync
    - `orders.inventory_sync_status` - Current sync status (pending, synced, failed)
  
  3. Security
    - Enable RLS on order_status_history
    - Add policies for authenticated users
  
  4. Indexes
    - order_status_history(order_id) for quick lookups
    - orders(inventory_sync_status) for monitoring
*/

-- Add inventory sync tracking to orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'inventory_synced_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN inventory_synced_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'inventory_sync_status'
  ) THEN
    ALTER TABLE orders ADD COLUMN inventory_sync_status text DEFAULT 'pending' CHECK (inventory_sync_status IN ('pending', 'synced', 'failed', 'partial'));
  END IF;
END $$;

-- Create order status history table
CREATE TABLE IF NOT EXISTS order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL CHECK (new_status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  inventory_action text CHECK (inventory_action IN ('reserve', 'commit', 'release', 'return', 'none')),
  inventory_action_completed boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_created_at ON order_status_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_inventory_sync_status ON orders(inventory_sync_status);

-- Enable RLS
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for order_status_history
CREATE POLICY "Authenticated users can view order status history"
  ON order_status_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service can insert order status history"
  ON order_status_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add comment
COMMENT ON TABLE order_status_history IS 'Audit trail for order status changes and inventory sync actions. Prevents duplicate inventory operations.';
COMMENT ON COLUMN order_status_history.inventory_action IS 'The inventory action taken: reserve (pending), commit (shipped/delivered), release (cancelled), return (refunded), none (no action needed)';
COMMENT ON COLUMN order_status_history.inventory_action_completed IS 'Whether the inventory action was successfully completed';

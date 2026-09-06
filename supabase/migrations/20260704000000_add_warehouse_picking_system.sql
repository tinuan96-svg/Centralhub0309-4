/*
  # Add Warehouse Picking System

  1. New Columns
    - `products`: `gtin` (text), `picking_notes` (text)
    - `orders`: `warehouse_status` (text), `picking_started_at` (timestamptz), `picking_completed_at` (timestamptz), `picked_by_user` (uuid), `picking_duration` (integer), `locked_by` (uuid), `locked_at` (timestamptz)
    - `order_items`: `picked_quantity` (integer), `required_quantity` (integer), `last_scanned_gtin` (text), `picked_at` (timestamptz), `picked_by` (uuid), `skip_reason` (text)

  2. Status Flow
    - `warehouse_status`: 'pending', 'picking', 'ready_for_packing', 'packing', 'ready_to_ship', 'dispatched'

  3. Constraints & Indexes
    - `warehouse_status` check constraint
    - Indexes for picking performance
*/

-- Update products table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'gtin') THEN
    ALTER TABLE products ADD COLUMN gtin text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'picking_notes') THEN
    ALTER TABLE products ADD COLUMN picking_notes text;
  END IF;
END $$;

-- Update orders table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'warehouse_status') THEN
    ALTER TABLE orders ADD COLUMN warehouse_status text DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'picking_started_at') THEN
    ALTER TABLE orders ADD COLUMN picking_started_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'picking_completed_at') THEN
    ALTER TABLE orders ADD COLUMN picking_completed_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'picked_by_user') THEN
    ALTER TABLE orders ADD COLUMN picked_by_user uuid REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'picking_duration') THEN
    ALTER TABLE orders ADD COLUMN picking_duration integer; -- in seconds
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'locked_by') THEN
    ALTER TABLE orders ADD COLUMN locked_by uuid REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'locked_at') THEN
    ALTER TABLE orders ADD COLUMN locked_at timestamptz;
  END IF;
END $$;

-- Add warehouse_status constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_warehouse_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_warehouse_status_check
  CHECK (warehouse_status IN ('pending', 'picking', 'ready_for_packing', 'packing', 'ready_to_ship', 'dispatched'));

-- Update order_items table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'picked_quantity') THEN
    ALTER TABLE order_items ADD COLUMN picked_quantity integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'required_quantity') THEN
    ALTER TABLE order_items ADD COLUMN required_quantity integer;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'last_scanned_gtin') THEN
    ALTER TABLE order_items ADD COLUMN last_scanned_gtin text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'picked_at') THEN
    ALTER TABLE order_items ADD COLUMN picked_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'picked_by') THEN
    ALTER TABLE order_items ADD COLUMN picked_by uuid REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'skip_reason') THEN
    ALTER TABLE order_items ADD COLUMN skip_reason text;
  END IF;
END $$;

-- Populate required_quantity from quantity if null
UPDATE order_items SET required_quantity = quantity WHERE required_quantity IS NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_orders_warehouse_status ON orders(warehouse_status);
CREATE INDEX IF NOT EXISTS idx_orders_locked_by ON orders(locked_by);
CREATE INDEX IF NOT EXISTS idx_products_gtin ON products(gtin);
CREATE INDEX IF NOT EXISTS idx_order_items_picked_by ON order_items(picked_by);

-- Enable realtime for these tables (if not already enabled)
-- Note: supabase_realtime is managed via the dashboard usually, but we can add to publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
    ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
    ALTER PUBLICATION supabase_realtime ADD TABLE products;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

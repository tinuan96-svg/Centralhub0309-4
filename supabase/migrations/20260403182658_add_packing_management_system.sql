/*
  # Packing Management System

  Complete packing materials inventory, order packing tracking, and purchase order management system.

  ## New Tables

  ### 1. packing_materials
  Tracks all packing materials inventory
  - `id` (uuid, primary key)
  - `name` (text) - Material name (e.g., Small Box, Tape, Bubble Wrap)
  - `category` (text) - box, filler, tape, label, other
  - `size` (text) - S, M, L, XL, or custom dimensions
  - `supplier_name` (text) - Supplier information
  - `purchase_cost_per_unit` (decimal) - Cost per unit when purchasing
  - `selling_cost_per_unit` (decimal) - Internal costing for profit calculation
  - `opening_stock` (integer) - Initial stock quantity
  - `current_stock` (integer) - Current available stock
  - `minimum_stock_alert` (integer) - Threshold for low stock alerts
  - `unit` (text) - pcs, rolls, kg, meters, etc.
  - `is_active` (boolean) - Material status
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 2. packing_material_transactions
  Records all stock movements (IN/OUT/ADJUSTMENT)
  - `id` (uuid, primary key)
  - `material_id` (uuid, FK to packing_materials)
  - `type` (text) - IN, OUT, ADJUSTMENT
  - `quantity` (integer) - Positive for IN, negative for OUT
  - `reference_type` (text) - order, purchase_order, manual
  - `reference_id` (uuid) - Related order or PO ID
  - `notes` (text) - Additional information
  - `created_by` (uuid) - User who created transaction
  - `created_at` (timestamptz)

  ### 3. order_packing
  Tracks packing information per order
  - `id` (uuid, primary key)
  - `order_id` (uuid, FK to orders) - UNIQUE
  - `total_packing_cost` (decimal) - Calculated total cost
  - `packed_by` (uuid) - User who packed the order
  - `packed_at` (timestamptz)
  - `status` (text) - pending, packed, completed
  - `notes` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 4. order_packing_items
  Individual materials used per order
  - `id` (uuid, primary key)
  - `order_packing_id` (uuid, FK to order_packing)
  - `material_id` (uuid, FK to packing_materials)
  - `quantity_used` (integer)
  - `cost_per_unit` (decimal) - Cost at time of use
  - `total_cost` (decimal) - quantity * cost_per_unit
  - `created_at` (timestamptz)

  ### 5. purchase_orders
  Purchase orders for packing materials
  - `id` (uuid, primary key)
  - `po_number` (text, unique) - Auto-generated PO number
  - `supplier_name` (text)
  - `status` (text) - draft, ordered, received, cancelled
  - `total_cost` (decimal)
  - `order_date` (date)
  - `expected_delivery_date` (date)
  - `received_date` (date)
  - `notes` (text)
  - `created_by` (uuid)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 6. purchase_order_items
  Line items in purchase orders
  - `id` (uuid, primary key)
  - `purchase_order_id` (uuid, FK to purchase_orders)
  - `material_id` (uuid, FK to packing_materials)
  - `quantity` (integer)
  - `cost_per_unit` (decimal)
  - `total` (decimal) - quantity * cost_per_unit
  - `received_quantity` (integer) - Default 0
  - `created_at` (timestamptz)

  ## Schema Updates

  ### orders table additions
  - `packing_cost` (decimal) - Total packing cost from order_packing
  - `packing_status` (text) - pending, packed, completed

  ## Security
  - Enable RLS on all tables
  - Authenticated users can read all packing data
  - Only authenticated users can create/update packing records
  - Proper foreign key constraints and cascades

  ## Indexes
  - Performance indexes on frequently queried columns
  - Foreign key indexes for joins
*/

-- Create packing_materials table
CREATE TABLE IF NOT EXISTS packing_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('box', 'filler', 'tape', 'label', 'other')),
  size text,
  supplier_name text,
  purchase_cost_per_unit decimal(10, 2) NOT NULL DEFAULT 0,
  selling_cost_per_unit decimal(10, 2),
  opening_stock integer NOT NULL DEFAULT 0,
  current_stock integer NOT NULL DEFAULT 0,
  minimum_stock_alert integer NOT NULL DEFAULT 10,
  unit text NOT NULL DEFAULT 'pcs',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create packing_material_transactions table
CREATE TABLE IF NOT EXISTS packing_material_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES packing_materials(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('IN', 'OUT', 'ADJUSTMENT')),
  quantity integer NOT NULL,
  reference_type text CHECK (reference_type IN ('order', 'purchase_order', 'manual')),
  reference_id uuid,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Create order_packing table
CREATE TABLE IF NOT EXISTS order_packing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  total_packing_cost decimal(10, 2) NOT NULL DEFAULT 0,
  packed_by uuid REFERENCES auth.users(id),
  packed_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'packed', 'completed')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create order_packing_items table
CREATE TABLE IF NOT EXISTS order_packing_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_packing_id uuid NOT NULL REFERENCES order_packing(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES packing_materials(id) ON DELETE RESTRICT,
  quantity_used integer NOT NULL CHECK (quantity_used > 0),
  cost_per_unit decimal(10, 2) NOT NULL,
  total_cost decimal(10, 2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create purchase_orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL UNIQUE,
  supplier_name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'received', 'cancelled')),
  total_cost decimal(10, 2) NOT NULL DEFAULT 0,
  order_date date,
  expected_delivery_date date,
  received_date date,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create purchase_order_items table
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES packing_materials(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  cost_per_unit decimal(10, 2) NOT NULL,
  total decimal(10, 2) NOT NULL,
  received_quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Add packing columns to orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'packing_cost'
  ) THEN
    ALTER TABLE orders ADD COLUMN packing_cost decimal(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'packing_status'
  ) THEN
    ALTER TABLE orders ADD COLUMN packing_status text DEFAULT 'pending' CHECK (packing_status IN ('pending', 'packed', 'completed'));
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_packing_materials_category ON packing_materials(category);
CREATE INDEX IF NOT EXISTS idx_packing_materials_stock ON packing_materials(current_stock);
CREATE INDEX IF NOT EXISTS idx_packing_materials_active ON packing_materials(is_active);
CREATE INDEX IF NOT EXISTS idx_packing_material_transactions_material ON packing_material_transactions(material_id);
CREATE INDEX IF NOT EXISTS idx_packing_material_transactions_type ON packing_material_transactions(type);
CREATE INDEX IF NOT EXISTS idx_packing_material_transactions_created ON packing_material_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_packing_order ON order_packing(order_id);
CREATE INDEX IF NOT EXISTS idx_order_packing_status ON order_packing(status);
CREATE INDEX IF NOT EXISTS idx_order_packing_items_packing ON order_packing_items(order_packing_id);
CREATE INDEX IF NOT EXISTS idx_order_packing_items_material ON order_packing_items(material_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_name);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_material ON purchase_order_items(material_id);

-- Enable Row Level Security
ALTER TABLE packing_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE packing_material_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_packing ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_packing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for packing_materials
CREATE POLICY "Authenticated users can view packing materials"
  ON packing_materials FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert packing materials"
  ON packing_materials FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update packing materials"
  ON packing_materials FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete packing materials"
  ON packing_materials FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for packing_material_transactions
CREATE POLICY "Authenticated users can view transactions"
  ON packing_material_transactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create transactions"
  ON packing_material_transactions FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for order_packing
CREATE POLICY "Authenticated users can view order packing"
  ON order_packing FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create order packing"
  ON order_packing FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update order packing"
  ON order_packing FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete order packing"
  ON order_packing FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for order_packing_items
CREATE POLICY "Authenticated users can view packing items"
  ON order_packing_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create packing items"
  ON order_packing_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update packing items"
  ON order_packing_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete packing items"
  ON order_packing_items FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for purchase_orders
CREATE POLICY "Authenticated users can view purchase orders"
  ON purchase_orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create purchase orders"
  ON purchase_orders FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update purchase orders"
  ON purchase_orders FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete purchase orders"
  ON purchase_orders FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for purchase_order_items
CREATE POLICY "Authenticated users can view PO items"
  ON purchase_order_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create PO items"
  ON purchase_order_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update PO items"
  ON purchase_order_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete PO items"
  ON purchase_order_items FOR DELETE
  TO authenticated
  USING (true);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_packing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_packing_materials_updated_at
  BEFORE UPDATE ON packing_materials
  FOR EACH ROW
  EXECUTE FUNCTION update_packing_updated_at();

CREATE TRIGGER update_order_packing_updated_at
  BEFORE UPDATE ON order_packing
  FOR EACH ROW
  EXECUTE FUNCTION update_packing_updated_at();

CREATE TRIGGER update_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_packing_updated_at();

-- Function to generate PO number
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS text AS $$
DECLARE
  po_count integer;
  new_po_number text;
BEGIN
  SELECT COUNT(*) INTO po_count FROM purchase_orders;
  new_po_number := 'PO-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD((po_count + 1)::text, 4, '0');
  RETURN new_po_number;
END;
$$ LANGUAGE plpgsql;

-- Function to update material stock after transaction
CREATE OR REPLACE FUNCTION update_material_stock_after_transaction()
RETURNS TRIGGER AS $$
BEGIN
  -- Update current_stock based on transaction type and quantity
  UPDATE packing_materials
  SET current_stock = current_stock + NEW.quantity
  WHERE id = NEW.material_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update stock when transaction is created
CREATE TRIGGER update_stock_on_transaction
  AFTER INSERT ON packing_material_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_material_stock_after_transaction();

-- Function to sync packing cost to orders table
CREATE OR REPLACE FUNCTION sync_packing_cost_to_order()
RETURNS TRIGGER AS $$
BEGIN
  -- Update orders table with packing cost and status
  UPDATE orders
  SET 
    packing_cost = NEW.total_packing_cost,
    packing_status = NEW.status
  WHERE id = NEW.order_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to sync packing data to orders
CREATE TRIGGER sync_order_packing_to_orders
  AFTER INSERT OR UPDATE ON order_packing
  FOR EACH ROW
  EXECUTE FUNCTION sync_packing_cost_to_order();

-- Function to recalculate order packing total
CREATE OR REPLACE FUNCTION recalculate_order_packing_total()
RETURNS TRIGGER AS $$
DECLARE
  packing_total decimal(10, 2);
BEGIN
  -- Calculate total from all packing items
  SELECT COALESCE(SUM(total_cost), 0)
  INTO packing_total
  FROM order_packing_items
  WHERE order_packing_id = COALESCE(NEW.order_packing_id, OLD.order_packing_id);
  
  -- Update order_packing total
  UPDATE order_packing
  SET total_packing_cost = packing_total
  WHERE id = COALESCE(NEW.order_packing_id, OLD.order_packing_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to recalculate packing total when items change
CREATE TRIGGER recalc_packing_total_on_items
  AFTER INSERT OR UPDATE OR DELETE ON order_packing_items
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_order_packing_total();

-- Function to recalculate purchase order total
CREATE OR REPLACE FUNCTION recalculate_purchase_order_total()
RETURNS TRIGGER AS $$
DECLARE
  po_total decimal(10, 2);
BEGIN
  -- Calculate total from all PO items
  SELECT COALESCE(SUM(total), 0)
  INTO po_total
  FROM purchase_order_items
  WHERE purchase_order_id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
  
  -- Update purchase_orders total
  UPDATE purchase_orders
  SET total_cost = po_total
  WHERE id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to recalculate PO total when items change
CREATE TRIGGER recalc_po_total_on_items
  AFTER INSERT OR UPDATE OR DELETE ON purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_purchase_order_total();

/*
# Backorder Planning System

## Purpose
Enables purchasing products in supplier packs (e.g. 6 or 12 units per box) only when
customer orders arrive. The system scans all unfulfilled paid orders, subtracts current
stock, calculates how many packs to buy from each supplier, and generates purchase
order drafts grouped by supplier.

## Changes

### 1. Products table - new columns
- `pack_size` (integer, default 1): Number of units in one supplier pack. E.g. 6 means
  the product is sold as a 6-pack. Used to calculate ceil(units_needed / pack_size) = packs_to_order.
- `pack_unit` (text, nullable): Label for the pack type, e.g. "box", "carton", "case".
- `reorder_frequency` (text, default 'regular'): Tag indicating how fast the product sells.
  Values: 'fast-moving', 'regular', 'slow-moving'. Fast-moving products trigger POs even
  when current stock covers unfulfilled orders, to prevent stockouts.
- `low_stock_threshold` (integer, default 0): Stock level below which a fast-moving product
  should be included in backorder planning even if no unfulfilled orders exist.

### 2. New table: backorder_plans
Stores generated backorder plan snapshots so the user can review and track them.
- `id` (uuid PK)
- `plan_date` (date): The date the plan was generated.
- `total_estimated_spend` (numeric): Sum of all purchase costs across all suppliers.
- `total_products` (integer): Number of distinct products needing purchase.
- `total_packs` (integer): Total packs across all products.
- `surplus_units` (integer): Extra units that will be added to stock after fulfilling orders.
- `status` (text, default 'open'): 'open', 'ordered', 'fulfilled'.
- `created_at` (timestamptz)

### 3. New table: backorder_plan_items
Individual product lines within a backorder plan.
- `id` (uuid PK)
- `plan_id` (uuid FK -> backorder_plans.id ON DELETE CASCADE)
- `product_id` (uuid FK -> products.id)
- `supplier_id` (uuid FK -> suppliers.id)
- `supplier_name` (text): Denormalized for display.
- `product_name` (text): Denormalized for display.
- `units_needed` (integer): Total units across all unfulfilled orders minus current stock.
- `pack_size` (integer): Packs size at time of plan.
- `packs_to_order` (integer): ceil(units_needed / pack_size).
- `surplus_units` (integer): Extra units from full packs.
- `cost_per_pack` (numeric): Supplier's price per pack.
- `total_cost` (numeric): packs_to_order * cost_per_pack.
- `triggered_by_orders` (text[]): List of order numbers that triggered this line.
- `created_at` (timestamptz)

### 4. RLS Policies
- backorder_plans: authenticated admin-only CRUD (matching existing supplier/PO patterns).
- backorder_plan_items: authenticated admin-only CRUD.
- product_suppliers: already has admin-only policy; no changes needed.
- supplier_price_lists: already has admin-only policies; no changes needed.
- po_drafts: already has admin-only policies; no changes needed.
- Products new columns: covered by existing product policies.
*/

-- 1. Add columns to products
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'pack_size') THEN
    ALTER TABLE products ADD COLUMN pack_size integer NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'pack_unit') THEN
    ALTER TABLE products ADD COLUMN pack_unit text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'reorder_frequency') THEN
    ALTER TABLE products ADD COLUMN reorder_frequency text NOT NULL DEFAULT 'regular';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'low_stock_threshold') THEN
    ALTER TABLE products ADD COLUMN low_stock_threshold integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 2. Create backorder_plans table
CREATE TABLE IF NOT EXISTS backorder_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_date date NOT NULL DEFAULT CURRENT_DATE,
  total_estimated_spend numeric NOT NULL DEFAULT 0,
  total_products integer NOT NULL DEFAULT 0,
  total_packs integer NOT NULL DEFAULT 0,
  surplus_units integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE backorder_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view backorder plans" ON backorder_plans;
CREATE POLICY "Authenticated users can view backorder plans"
ON backorder_plans FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert backorder plans" ON backorder_plans;
CREATE POLICY "Authenticated users can insert backorder plans"
ON backorder_plans FOR INSERT
TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Authenticated users can update backorder plans" ON backorder_plans;
CREATE POLICY "Authenticated users can update backorder plans"
ON backorder_plans FOR UPDATE
TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Authenticated users can delete backorder plans" ON backorder_plans;
CREATE POLICY "Authenticated users can delete backorder plans"
ON backorder_plans FOR DELETE
TO authenticated USING (is_admin());

-- 3. Create backorder_plan_items table
CREATE TABLE IF NOT EXISTS backorder_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES backorder_plans(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  supplier_name text NOT NULL,
  product_name text NOT NULL,
  units_needed integer NOT NULL DEFAULT 0,
  pack_size integer NOT NULL DEFAULT 1,
  packs_to_order integer NOT NULL DEFAULT 1,
  surplus_units integer NOT NULL DEFAULT 0,
  cost_per_pack numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  triggered_by_orders text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE backorder_plan_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view backorder plan items" ON backorder_plan_items;
CREATE POLICY "Authenticated users can view backorder plan items"
ON backorder_plan_items FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert backorder plan items" ON backorder_plan_items;
CREATE POLICY "Authenticated users can insert backorder plan items"
ON backorder_plan_items FOR INSERT
TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Authenticated users can update backorder plan items" ON backorder_plan_items;
CREATE POLICY "Authenticated users can update backorder plan items"
ON backorder_plan_items FOR UPDATE
TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Authenticated users can delete backorder plan items" ON backorder_plan_items;
CREATE POLICY "Authenticated users can delete backorder plan items"
ON backorder_plan_items FOR DELETE
TO authenticated USING (is_admin());

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_backorder_plans_status ON backorder_plans(status);
CREATE INDEX IF NOT EXISTS idx_backorder_plans_date ON backorder_plans(plan_date DESC);
CREATE INDEX IF NOT EXISTS idx_backorder_plan_items_plan ON backorder_plan_items(plan_id);
CREATE INDEX IF NOT EXISTS idx_backorder_plan_items_supplier ON backorder_plan_items(supplier_id);

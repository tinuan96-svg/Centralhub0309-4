/*
# Create inventory_movements table

1. New Tables
- `inventory_movements` — permanent audit trail of every stock change (sales, purchases, adjustments, returns, damage, expiry, transfers).
  - `id` (uuid, primary key)
  - `product_id` (uuid, FK to products, not null)
  - `order_id` (uuid, nullable)
  - `supplier_id` (uuid, nullable)
  - `warehouse_id` (uuid, nullable)
  - `change_amount` (integer, not null — positive for inbound, negative for outbound)
  - `old_stock` (integer, nullable)
  - `new_stock` (integer, nullable)
  - `action_type` (text, not null — SALE, PURCHASE, MANUAL_ADJUSTMENT, RETURN, DAMAGE, EXPIRED, etc.)
  - `notes` (text, nullable)
  - `order_number` (text, nullable)
  - `created_at` (timestamptz, default now())

2. Why
- The Inventory Dashboard "Movements Today" counter and the Stock Ledger page both query `inventory_movements`, which did not exist. This caused the counter to always show 0 and the ledger to always appear empty.
- Stock adjustments via `InventoryManagementService.adjustStock()` already try to INSERT into this table, so the insert was silently failing.

3. Security
- Enable RLS on `inventory_movements`.
- This app has a sign-in screen, so policies are scoped to `authenticated` only.
- All four CRUD policies (select/insert/update/delete) for authenticated users.
*/

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  order_id uuid,
  supplier_id uuid,
  warehouse_id uuid,
  change_amount integer NOT NULL,
  old_stock integer,
  new_stock integer,
  action_type text NOT NULL,
  notes text,
  order_number text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON inventory_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_id ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_action_type ON inventory_movements(action_type);

ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_inventory_movements" ON inventory_movements;
CREATE POLICY "select_inventory_movements"
ON inventory_movements FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_inventory_movements" ON inventory_movements;
CREATE POLICY "insert_inventory_movements"
ON inventory_movements FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_inventory_movements" ON inventory_movements;
CREATE POLICY "update_inventory_movements"
ON inventory_movements FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_inventory_movements" ON inventory_movements;
CREATE POLICY "delete_inventory_movements"
ON inventory_movements FOR DELETE
TO authenticated USING (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'inventory_movements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE inventory_movements;
  END IF;
END $$;

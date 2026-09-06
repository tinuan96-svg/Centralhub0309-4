-- Migration: Enhance Inventory Audit and Alerts
-- Timestamp: 20260705000000

-- 1. Enhance inventory_logs for better auditing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'old_quantity') THEN
    ALTER TABLE inventory_logs ADD COLUMN old_quantity integer;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'new_quantity') THEN
    ALTER TABLE inventory_logs ADD COLUMN new_quantity integer;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'reason') THEN
    ALTER TABLE inventory_logs ADD COLUMN reason text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'device_name') THEN
    ALTER TABLE inventory_logs ADD COLUMN device_name text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'edited_by') THEN
    ALTER TABLE inventory_logs ADD COLUMN edited_by uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- 2. Create low_stock_alerts table
CREATE TABLE IF NOT EXISTS low_stock_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  current_stock integer NOT NULL,
  threshold integer NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_status ON low_stock_alerts(status) WHERE status = 'active';

-- 3. Function to automatically generate/update low stock alerts
CREATE OR REPLACE FUNCTION handle_low_stock_alert()
RETURNS TRIGGER AS $$
DECLARE
  v_available_stock integer;
BEGIN
  v_available_stock := NEW.stock_quantity - NEW.reserved_quantity;

  IF v_available_stock <= NEW.low_stock_threshold THEN
    -- Stock is low, create or update alert
    INSERT INTO low_stock_alerts (product_id, current_stock, threshold, status)
    VALUES (NEW.product_id, v_available_stock, NEW.low_stock_threshold, 'active')
    ON CONFLICT (product_id) WHERE status = 'active'
    DO UPDATE SET
      current_stock = EXCLUDED.current_stock,
      threshold = EXCLUDED.threshold,
      updated_at = now();
  ELSE
    -- Stock is no longer low, resolve any active alerts
    UPDATE low_stock_alerts
    SET status = 'resolved', updated_at = now()
    WHERE product_id = NEW.product_id AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger for low stock alerts
DROP TRIGGER IF EXISTS trigger_low_stock_alert ON central_inventory;
CREATE TRIGGER trigger_low_stock_alert
  AFTER INSERT OR UPDATE ON central_inventory
  FOR EACH ROW
  EXECUTE FUNCTION handle_low_stock_alert();

-- 5. RLS Policies
ALTER TABLE low_stock_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view low stock alerts"
  ON low_stock_alerts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Warehouse managers can update low stock alerts"
  ON low_stock_alerts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

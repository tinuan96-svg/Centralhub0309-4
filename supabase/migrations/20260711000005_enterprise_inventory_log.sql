-- Enterprise Inventory Activity Log Migration
-- Objective: Standardize inventory auditing with detailed movement tracking

-- 1. Extend inventory_logs table with enterprise-grade columns
DO $$
BEGIN
  -- Add product info for permanent audit trail
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'product_name') THEN
    ALTER TABLE inventory_logs ADD COLUMN product_name text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'sku') THEN
    ALTER TABLE inventory_logs ADD COLUMN sku text;
  END IF;

  -- Add granular movement and reference info
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'movement_type') THEN
    ALTER TABLE inventory_logs ADD COLUMN movement_type text; -- IN, OUT, ADJUSTMENT, TRANSFER
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'reference_type') THEN
    ALTER TABLE inventory_logs ADD COLUMN reference_type text; -- Customer Order, Purchase Order, etc.
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'reference_number') THEN
    ALTER TABLE inventory_logs ADD COLUMN reference_number text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'warehouse_id') THEN
    ALTER TABLE inventory_logs ADD COLUMN warehouse_id uuid;
  END IF;

  -- Ensure columns exist for before/after quantities (already added in previous migration but good to be sure)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'old_quantity') THEN
    ALTER TABLE inventory_logs ADD COLUMN old_quantity integer;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_logs' AND column_name = 'new_quantity') THEN
    ALTER TABLE inventory_logs ADD COLUMN new_quantity integer;
  END IF;
END $$;

-- 2. Create useful indexes for the log
CREATE INDEX IF NOT EXISTS idx_inventory_logs_created_at ON inventory_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_product_id ON inventory_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_movement_type ON inventory_logs(movement_type);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_reference_number ON inventory_logs(reference_number);

-- 3. Update existing handle_order_inventory_movement trigger to log to inventory_logs as well
-- (or instead of inventory_movements to consolidate)
CREATE OR REPLACE FUNCTION public.handle_order_inventory_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item record;
  v_old_stock integer;
  v_new_stock integer;
  v_order_number text;
  v_sku text;
BEGIN
  -- GET ORDER NUMBER
  SELECT order_number INTO v_order_number FROM public.orders WHERE id = NEW.id;

  -- CASE 1: ORDER PAID (Deduct Stock)
  IF (NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') AND (NEW.stock_deducted = false OR NEW.stock_deducted IS NULL)) THEN

    FOR v_item IN
      SELECT oi.product_id, oi.quantity, oi.product_name, p.sku
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = NEW.id
    LOOP
      IF v_item.product_id IS NOT NULL THEN

        -- ATOMIC DEDUCTION
        UPDATE public.products
        SET stock = COALESCE(stock, 0) - v_item.quantity,
            updated_at = now()
        WHERE id = v_item.product_id
        RETURNING stock + v_item.quantity, stock INTO v_old_stock, v_new_stock;

        -- CONSOLIDATED ENTERPRISE LOG
        INSERT INTO public.inventory_logs (
          product_id, product_name, sku, store_id, order_id,
          reference_id, reference_number, reference_type,
          change, old_quantity, new_quantity,
          type, movement_type, reason, notes,
          device_name
        ) VALUES (
          v_item.product_id, v_item.product_name, v_item.sku, NEW.store_id, NEW.id,
          NEW.id::text, v_order_number, 'Customer Order',
          -v_item.quantity, v_old_stock, v_new_stock,
          'ORDER', 'OUT', 'Order Paid', 'Automated deduction on payment',
          'System'
        );

        -- Keep inventory_movements for backward compatibility if needed,
        -- but enterprise log is the new source of truth
        INSERT INTO public.inventory_movements (
          product_id, order_id, order_number, change_amount, old_stock, new_stock,
          action_type, notes
        ) VALUES (
          v_item.product_id, NEW.id, v_order_number, -v_item.quantity, v_old_stock, v_new_stock,
          'DEDUCT', 'Order Paid'
        );

      END IF;
    END LOOP;

    NEW.stock_deducted := true;

  -- CASE 2: ORDER CANCELLED/REFUNDED (Restore Stock)
  ELSIF (NEW.order_status IN ('cancelled', 'refunded') AND (OLD.order_status NOT IN ('cancelled', 'refunded')) AND NEW.stock_deducted = true) THEN

    FOR v_item IN
      SELECT oi.product_id, oi.quantity, oi.product_name, p.sku
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = NEW.id
    LOOP
      IF v_item.product_id IS NOT NULL THEN

        UPDATE public.products
        SET stock = COALESCE(stock, 0) + v_item.quantity,
            updated_at = now()
        WHERE id = v_item.product_id
        RETURNING stock - v_item.quantity, stock INTO v_old_stock, v_new_stock;

        -- CONSOLIDATED ENTERPRISE LOG
        INSERT INTO public.inventory_logs (
          product_id, product_name, sku, store_id, order_id,
          reference_id, reference_number, reference_type,
          change, old_quantity, new_quantity,
          type, movement_type, reason, notes,
          device_name
        ) VALUES (
          v_item.product_id, v_item.product_name, v_item.sku, NEW.store_id, NEW.id,
          NEW.id::text, v_order_number, 'Customer Order',
          v_item.quantity, v_old_stock, v_new_stock,
          'RETURN', 'IN', 'Order ' || NEW.order_status, 'Automated restoration on ' || NEW.order_status,
          'System'
        );

        INSERT INTO public.inventory_movements (
          product_id, order_id, order_number, change_amount, old_stock, new_stock,
          action_type, notes
        ) VALUES (
          v_item.product_id, NEW.id, v_order_number, v_item.quantity, v_old_stock, v_new_stock,
          'RESTORE', 'Order ' || NEW.order_status
        );

      END IF;
    END LOOP;

    NEW.stock_deducted := false;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. View for Log with Product info (if we don't want to rely on denormalized columns alone)
CREATE OR REPLACE VIEW view_inventory_activity_log AS
SELECT
  il.*,
  p.name as live_product_name,
  p.sku as live_sku,
  u.email as user_email,
  s.name as store_name
FROM inventory_logs il
LEFT JOIN products p ON p.id = il.product_id
LEFT JOIN auth.users u ON u.id = il.edited_by
LEFT JOIN stores s ON s.id = il.store_id;

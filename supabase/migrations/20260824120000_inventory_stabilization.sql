-- ============================================================
-- INVENTORY STABILIZATION & IDEMPOTENCY
-- Objective: Ensure central_inventory is the single source of truth and deduction is idempotent.
-- ============================================================

-- 1. Ensure central_inventory has all products
INSERT INTO public.central_inventory (product_id, stock_quantity, updated_at)
SELECT p.id, COALESCE(p.stock, 0), now()
FROM public.products p
LEFT JOIN public.central_inventory ci ON ci.product_id = p.id
WHERE ci.product_id IS NULL AND p.is_deleted = false
ON CONFLICT (product_id) DO NOTHING;

-- 2. Enhance inventory_movements table for better auditing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_movements' AND column_name = 'sku') THEN
        ALTER TABLE public.inventory_movements ADD COLUMN sku text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_movements' AND column_name = 'reason') THEN
        ALTER TABLE public.inventory_movements ADD COLUMN reason text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_movements' AND column_name = 'source_store_id') THEN
        ALTER TABLE public.inventory_movements ADD COLUMN source_store_id uuid REFERENCES public.stores(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_movements' AND column_name = 'user_id') THEN
        ALTER TABLE public.inventory_movements ADD COLUMN user_id uuid REFERENCES auth.users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_movements' AND column_name = 'event_id') THEN
        ALTER TABLE public.inventory_movements ADD COLUMN event_id text;
    END IF;
END $$;

-- 3. Standardize handle_order_inventory_movement to use central_inventory as source of truth
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
  v_deducted_count integer := 0;
BEGIN
  -- Get order details
  SELECT order_number INTO v_order_number FROM public.orders WHERE id = NEW.id;

  -- CASE 1: ORDER PAID (Deduct Stock)
  -- Idempotency check: only if payment_status changed to paid and stock_deducted is false
  IF (NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') AND (NEW.stock_deducted = false OR NEW.stock_deducted IS NULL)) THEN

    FOR v_item IN
      SELECT oi.product_id, oi.quantity, p.sku, p.name
      FROM public.order_items oi
      JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL
    LOOP
      -- Atomic deduction from central_inventory (Source of Truth)
      INSERT INTO public.central_inventory (product_id, stock_quantity, updated_at)
      VALUES (v_item.product_id, -v_item.quantity, now())
      ON CONFLICT (product_id) DO UPDATE
      SET stock_quantity = public.central_inventory.stock_quantity - v_item.quantity,
          updated_at = now()
      RETURNING (public.central_inventory.stock_quantity + v_item.quantity), public.central_inventory.stock_quantity
      INTO v_old_stock, v_new_stock;

      -- Sync back to legacy products.stock for backward compatibility
      UPDATE public.products
      SET stock = v_new_stock,
          updated_at = now()
      WHERE id = v_item.product_id;

      -- Audit log in inventory_movements
      INSERT INTO public.inventory_movements (
        product_id, sku, order_id, order_number, change_amount, old_stock, new_stock,
        action_type, reason, notes, source_store_id, created_at
      ) VALUES (
        v_item.product_id, v_item.sku, NEW.id, v_order_number, -v_item.quantity, v_old_stock, v_new_stock,
        'DEDUCT', 'Order Paid', 'Automated deduction on payment', NEW.store_id, now()
      );

      v_deducted_count := v_deducted_count + 1;
    END LOOP;

    -- Mark as deducted if we processed at least one item
    IF v_deducted_count > 0 THEN
      NEW.stock_deducted := true;
    END IF;

  -- CASE 2: ORDER CANCELLED/REFUNDED (Restore Stock)
  -- Idempotency check: only if status changed and stock was previously deducted
  ELSIF (NEW.order_status IN ('cancelled', 'refunded') AND (OLD.order_status NOT IN ('cancelled', 'refunded')) AND NEW.stock_deducted = true) THEN

    FOR v_item IN
      SELECT oi.product_id, oi.quantity, p.sku, p.name
      FROM public.order_items oi
      JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL
    LOOP
      -- Atomic restore to central_inventory
      UPDATE public.central_inventory
      SET stock_quantity = COALESCE(stock_quantity, 0) + v_item.quantity,
          updated_at = now()
      WHERE product_id = v_item.product_id
      RETURNING (stock_quantity - v_item.quantity), stock_quantity INTO v_old_stock, v_new_stock;

      -- Sync back to legacy products.stock
      UPDATE public.products
      SET stock = v_new_stock,
          updated_at = now()
      WHERE id = v_item.product_id;

      -- Audit log
      INSERT INTO public.inventory_movements (
        product_id, sku, order_id, order_number, change_amount, old_stock, new_stock,
        action_type, reason, notes, source_store_id, created_at
      ) VALUES (
        v_item.product_id, v_item.sku, NEW.id, v_order_number, v_item.quantity, v_old_stock, v_new_stock,
        'RESTORE', 'Order ' || NEW.order_status, 'Automated restore on cancellation', NEW.store_id, now()
      );
    END LOOP;

    NEW.stock_deducted := false;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure trigger is correctly attached
DROP TRIGGER IF EXISTS trg_order_inventory_movement ON public.orders;
CREATE TRIGGER trg_order_inventory_movement
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_inventory_movement();

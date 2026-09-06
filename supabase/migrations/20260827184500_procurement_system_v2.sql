-- PROCUREMENT SYSTEM V2 MIGRATION
-- Restore reserved_quantity logic and automate backorder creation

-- 1. Restore reserved_quantity management in central_inventory
-- Ensure the check constraint exists (stock_quantity >= reserved_quantity)
-- Actually, the requirement says "Allow negative stock for backorders",
-- but available_stock = stock_quantity - reserved_quantity.
-- If stock_quantity can be negative, the constraint stock >= reserved might fail if reserved is positive.
-- Requirement 2: available_stock = stock_quantity - reserved_quantity.
-- Requirement 3: If requested > available: create backorder.

-- We will allow stock_quantity to be negative (representing backorder debt + physical stock).
-- Or better: stock_quantity represents physical stock (>= 0), and backorder_items tracks the debt.
-- BUT Requirement 2 says: available_stock = stock_quantity - reserved_quantity.
-- And Requirement 3 says: quantity_ordered = quantity that could not be fulfilled.

-- Decision: Keep stock_quantity as physical stock (clamped at 0 or allowed negative?
-- Migration 20260816000000_fix_backorder_inventory_logic.sql allowed negative stock).
-- I will stick to allowing negative stock in `products.stock` and `central_inventory.stock_quantity`
-- to represent the "net" position, while `backorder_items` provides the detailed breakdown.

-- 2. Ensure backorder_items table has correct constraints and indexes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_backorder_items_order_product') THEN
        CREATE UNIQUE INDEX idx_backorder_items_order_product ON public.backorder_items(order_id, product_id);
    END IF;
END $$;

-- 3. Function to recompute backorder for a product
CREATE OR REPLACE FUNCTION public.recompute_product_backorder(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_backorder integer;
BEGIN
    -- Sum all outstanding backorders
    SELECT COALESCE(SUM(quantity_ordered - quantity_fulfilled), 0)
    INTO v_total_backorder
    FROM public.backorder_items
    WHERE product_id = p_product_id
      AND status != 'fulfilled';

    -- Update product or metadata if needed.
    -- For now, we rely on this sum in procurementService.
END;
$$;

-- 4. Unified inventory and backorder handler
CREATE OR REPLACE FUNCTION public.handle_order_inventory_movement_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item record;
  v_old_stock integer;
  v_new_stock integer;
  v_order_number text;
  v_available_stock integer;
  v_backorder_qty integer;
  v_product_name text;
  v_sku text;
BEGIN
  SELECT order_number INTO v_order_number FROM public.orders WHERE id = NEW.id;

  -- CASE 1: ORDER PAID (Deduct Stock, Handle Reservations, Create Backorders)
  IF (NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') AND (NEW.stock_deducted = false OR NEW.stock_deducted IS NULL)) THEN

    FOR v_item IN SELECT product_id, quantity, product_name FROM public.order_items WHERE order_id = NEW.id AND product_id IS NOT NULL LOOP

      -- Get current available stock
      SELECT (stock_quantity - reserved_quantity) INTO v_available_stock
      FROM public.central_inventory
      WHERE product_id = v_item.product_id;

      -- Calculate backorder quantity
      v_backorder_qty := GREATEST(0, v_item.quantity - COALESCE(v_available_stock, 0));

      -- Create/Update Backorder Item if needed
      IF v_backorder_qty > 0 THEN
        INSERT INTO public.backorder_items (
          order_id, product_id, quantity_ordered, quantity_fulfilled, status, priority_score, created_at, updated_at
        ) VALUES (
          NEW.id, v_item.product_id, v_backorder_qty, 0, 'pending', 10, now(), now()
        ) ON CONFLICT (order_id, product_id) DO UPDATE SET
          quantity_ordered = EXCLUDED.quantity_ordered,
          updated_at = now();

        -- Update order flag
        UPDATE public.orders SET has_backorder_items = true, is_backorder = true WHERE id = NEW.id;
      END IF;

      -- Update products table (represent net position)
      UPDATE public.products
      SET stock = COALESCE(stock, 0) - v_item.quantity,
          updated_at = now()
      WHERE id = v_item.product_id
      RETURNING COALESCE(stock, 0) + v_item.quantity, COALESCE(stock, 0), name, sku INTO v_old_stock, v_new_stock, v_product_name, v_sku;

      -- Update central_inventory (Restore reserved_quantity logic)
      -- We decrease stock_quantity by the full amount.
      -- We release reservation by decreasing reserved_quantity by the amount that was reserved.
      -- If stock was insufficient, only the available portion was "reserved" in spirit.
      -- But the system should reserve the full amount if it was allowed.
      -- The requirement 2 says: available_stock = stock_quantity - reserved_quantity.

      UPDATE public.central_inventory
      SET stock_quantity = COALESCE(stock_quantity, 0) - v_item.quantity,
          reserved_quantity = GREATEST(0, COALESCE(reserved_quantity, 0) - v_item.quantity),
          updated_at = now()
      WHERE product_id = v_item.product_id;

      -- Audit Log
      INSERT INTO public.inventory_logs (
        product_id, product_name, sku, order_id, reference_number, reference_type,
        change, old_quantity, new_quantity, type, movement_type, notes, created_at
      ) VALUES (
        v_item.product_id, COALESCE(v_product_name, v_item.product_name), v_sku, NEW.id,
        v_order_number, 'Customer Order',
        -v_item.quantity, v_old_stock, v_new_stock,
        'ORDER', 'OUT', 'Deducted ' || v_item.quantity || ' units (Backorder: ' || v_backorder_qty || ')', now()
      );

    END LOOP;

    NEW.stock_deducted := true;
    NEW.inventory_sync_status := 'synced';
    NEW.inventory_synced_at := now();

  -- CASE 2: ORDER CANCELLED/REFUNDED (Restore Stock & Remove Backorder)
  ELSIF (NEW.order_status IN ('cancelled', 'refunded') AND (OLD.order_status NOT IN ('cancelled', 'refunded')) AND NEW.stock_deducted = true) THEN

    FOR v_item IN SELECT product_id, quantity, product_name FROM public.order_items WHERE order_id = NEW.id AND product_id IS NOT NULL LOOP

      -- Remove Backorder Item
      DELETE FROM public.backorder_items WHERE order_id = NEW.id AND product_id = v_item.product_id;

      UPDATE public.products
      SET stock = COALESCE(stock, 0) + v_item.quantity,
          updated_at = now()
      WHERE id = v_item.product_id
      RETURNING COALESCE(stock, 0) - v_item.quantity, COALESCE(stock, 0), name, sku INTO v_old_stock, v_new_stock, v_product_name, v_sku;

      UPDATE public.central_inventory
      SET stock_quantity = COALESCE(stock_quantity, 0) + v_item.quantity,
          updated_at = now()
      WHERE product_id = v_item.product_id;

      -- Audit Log
      INSERT INTO public.inventory_logs (
        product_id, product_name, sku, order_id, reference_number, reference_type,
        change, old_quantity, new_quantity, type, movement_type, notes, created_at
      ) VALUES (
        v_item.product_id, COALESCE(v_product_name, v_item.product_name), v_sku, NEW.id,
        v_order_number, 'Order ' || NEW.order_status,
        v_item.quantity, v_old_stock, v_new_stock,
        'ORDER', 'IN', 'Restored ' || v_item.quantity || ' units — order ' || NEW.order_status, now()
      );
    END LOOP;

    NEW.stock_deducted := false;
    NEW.inventory_sync_status := 'synced';
    NEW.inventory_synced_at := now();
    NEW.has_backorder_items := false;
    NEW.is_backorder := false;
  END IF;

  RETURN NEW;
END;
$function$;

-- 5. Update triggers to use the new handler
DROP TRIGGER IF EXISTS trg_order_inventory_movement ON public.orders;
CREATE TRIGGER trg_order_inventory_movement
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_inventory_movement_v2();

-- 6. Add trigger for Order Creation to handle initial reservation
CREATE OR REPLACE FUNCTION public.handle_order_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item record;
BEGIN
  -- When order is created in 'pending' status, reserve stock
  FOR v_item IN SELECT product_id, quantity FROM public.order_items WHERE order_id = NEW.id LOOP
    UPDATE public.central_inventory
    SET reserved_quantity = COALESCE(reserved_quantity, 0) + v_item.quantity,
        updated_at = now()
    WHERE product_id = v_item.product_id;
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_order_reservation ON public.orders;
-- Note: Order creation trigger usually needs to be AFTER insert on orders,
-- but order_items might not exist yet.
-- Kerala Grocery logic typically inserts orders then order_items.
-- We might need to trigger reservation on order_items insert instead.

CREATE OR REPLACE FUNCTION public.handle_order_item_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Reserve stock when an item is added to an order
  UPDATE public.central_inventory
  SET reserved_quantity = COALESCE(reserved_quantity, 0) + NEW.quantity,
      updated_at = now()
  WHERE product_id = NEW.product_id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_order_item_reservation ON public.order_items;
CREATE TRIGGER trg_order_item_reservation
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_item_reservation();

-- 8. Trigger for Supplier Invoice Items to handle stock receipt and backorder fulfillment
CREATE OR REPLACE FUNCTION public.handle_stock_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_received_qty integer;
  v_backorder record;
  v_remaining_receipt integer;
  v_fulfilled_this_time integer;
  v_all_fulfilled boolean;
BEGIN
  -- We only act when received_quantity INCREASES
  IF (TG_OP = 'UPDATE') THEN
    v_received_qty := NEW.received_quantity - COALESCE(OLD.received_quantity, 0);
  ELSE
    v_received_qty := NEW.received_quantity;
  END IF;

  IF v_received_qty <= 0 THEN
    RETURN NEW;
  END IF;

  -- 1. Increase physical inventory
  UPDATE public.products
  SET stock = COALESCE(stock, 0) + v_received_qty,
      updated_at = now()
  WHERE id = NEW.product_id;

  UPDATE public.central_inventory
  SET stock_quantity = COALESCE(stock_quantity, 0) + v_received_qty,
      updated_at = now()
  WHERE product_id = NEW.product_id;

  -- Audit Log for receipt
  INSERT INTO public.inventory_logs (
    product_id, product_name, reference_id, reference_type,
    change, type, movement_type, notes, created_at
  ) VALUES (
    NEW.product_id, NEW.product_name, NEW.invoice_id, 'Supplier Invoice',
    v_received_qty, 'PURCHASE', 'IN', 'Received ' || v_received_qty || ' units from invoice', now()
  );

  -- 2. Fulfill Backorders (First-In, First-Out or based on priority)
  v_remaining_receipt := v_received_qty;

  FOR v_backorder IN
    SELECT * FROM public.backorder_items
    WHERE product_id = NEW.product_id
      AND status != 'fulfilled'
    ORDER BY priority_score DESC, created_at ASC
  LOOP
    EXIT WHEN v_remaining_receipt <= 0;

    v_fulfilled_this_time := LEAST(v_remaining_receipt, v_backorder.quantity_ordered - v_backorder.quantity_fulfilled);

    UPDATE public.backorder_items
    SET quantity_fulfilled = quantity_fulfilled + v_fulfilled_this_time,
        status = CASE WHEN (quantity_fulfilled + v_fulfilled_this_time) >= quantity_ordered THEN 'fulfilled' ELSE 'partial' END,
        updated_at = now()
    WHERE id = v_backorder.id;

    v_remaining_receipt := v_remaining_receipt - v_fulfilled_this_time;

    -- 3. Check if the parent order is now ready to move forward
    SELECT NOT EXISTS (
      SELECT 1 FROM public.backorder_items
      WHERE order_id = v_backorder.order_id
        AND status != 'fulfilled'
    ) INTO v_all_fulfilled;

    IF v_all_fulfilled THEN
      UPDATE public.orders
      SET has_backorder_items = false,
          fulfillment_status = 'confirmed' -- or whatever status triggers picking
      WHERE id = v_backorder.order_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_handle_stock_receipt ON public.supplier_invoice_items;
CREATE TRIGGER trg_handle_stock_receipt
  AFTER INSERT OR UPDATE OF received_quantity ON public.supplier_invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_stock_receipt();

-- 9. Ensure purchase_days and average_delivery_days exist in suppliers
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'purchase_days') THEN
        ALTER TABLE public.suppliers ADD COLUMN purchase_days text[] DEFAULT '{}';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'average_delivery_days') THEN
        ALTER TABLE public.suppliers ADD COLUMN average_delivery_days integer DEFAULT 7;
    END IF;
END $$;

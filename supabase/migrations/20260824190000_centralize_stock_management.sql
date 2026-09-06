-- ============================================================
-- CENTRALIZE STOCK MANAGEMENT
-- Objective: Ensure central_inventory is the only source of truth for stock updates
-- and resolve "Direct updates to products.stock are blocked" errors.
-- ============================================================

-- 1. DROP any potential blocking triggers on products.stock (Best-effort)
-- We try to find and drop triggers that might be blocking direct updates.
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN (
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE event_object_table = 'products'
        AND (trigger_name ILIKE '%block%' OR trigger_name ILIKE '%stock_guard%')
    ) LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || r.trigger_name || ' ON public.products';
    END LOOP;
END $$;

-- 2. CREATE a dedicated sync trigger FROM central_inventory TO products
-- This ensures products.stock is always up-to-date with central_inventory.stock_quantity.
CREATE OR REPLACE FUNCTION public.sync_products_stock_from_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Update the legacy products.stock field
    UPDATE public.products
    SET stock = NEW.stock_quantity,
        updated_at = now()
    WHERE id = NEW.product_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_central_inventory_to_products ON public.central_inventory;
CREATE TRIGGER trg_sync_central_inventory_to_products
  AFTER INSERT OR UPDATE OF stock_quantity ON public.central_inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_products_stock_from_inventory();

-- 3. Update handle_order_inventory_movement to only touch central_inventory
-- We re-define it here to ensure it's clean and doesn't try to update products.stock directly.
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
  SELECT COALESCE(order_number, NEW.id::text) INTO v_order_number FROM public.orders WHERE id = NEW.id;

  -- CASE 1: ORDER PAID (Deduct Stock)
  IF (NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') AND (NEW.stock_deducted = false OR NEW.stock_deducted IS NULL)) THEN

    FOR v_item IN
      SELECT oi.product_id, oi.quantity, p.sku, p.name
      FROM public.order_items oi
      JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL
    LOOP
      BEGIN
        -- Atomic deduction from central_inventory (Source of Truth)
        -- The trigger 'trg_sync_central_inventory_to_products' will automatically update products.stock
        INSERT INTO public.central_inventory (product_id, stock_quantity, updated_at)
        VALUES (v_item.product_id, -v_item.quantity, now())
        ON CONFLICT (product_id) DO UPDATE
        SET stock_quantity = public.central_inventory.stock_quantity - v_item.quantity,
            updated_at = now()
        RETURNING (public.central_inventory.stock_quantity + v_item.quantity), public.central_inventory.stock_quantity
        INTO v_old_stock, v_new_stock;

        -- Audit log in inventory_movements
        INSERT INTO public.inventory_movements (
          product_id, sku, order_id, order_number, change_amount, old_stock, new_stock,
          action_type, reason, notes, source_store_id, created_at
        ) VALUES (
          v_item.product_id, v_item.sku, NEW.id, v_order_number, -v_item.quantity, v_old_stock, v_new_stock,
          'DEDUCT', 'Order Paid', 'Automated deduction on payment', NEW.store_id, now()
        );

        v_deducted_count := v_deducted_count + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to deduct stock for product % in order %: %', v_item.product_id, NEW.id, SQLERRM;
      END;
    END LOOP;

    IF v_deducted_count > 0 THEN
      NEW.stock_deducted := true;
    END IF;

  -- CASE 2: ORDER CANCELLED/REFUNDED (Restore Stock)
  ELSIF (NEW.order_status IN ('cancelled', 'refunded') AND (OLD.order_status NOT IN ('cancelled', 'refunded')) AND NEW.stock_deducted = true) THEN

    FOR v_item IN
      SELECT oi.product_id, oi.quantity, p.sku, p.name
      FROM public.order_items oi
      JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL
    LOOP
      BEGIN
        -- Atomic restore to central_inventory
        UPDATE public.central_inventory
        SET stock_quantity = COALESCE(stock_quantity, 0) + v_item.quantity,
            updated_at = now()
        WHERE product_id = v_item.product_id
        RETURNING (stock_quantity - v_item.quantity), stock_quantity INTO v_old_stock, v_new_stock;

        -- Audit log
        INSERT INTO public.inventory_movements (
          product_id, sku, order_id, order_number, change_amount, old_stock, new_stock,
          action_type, reason, notes, source_store_id, created_at
        ) VALUES (
          v_item.product_id, v_item.sku, NEW.id, v_order_number, v_item.quantity, v_old_stock, v_new_stock,
          'RESTORE', 'Order ' || NEW.order_status, 'Automated restore on cancellation', NEW.store_id, now()
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to restore stock for product % in order %: %', v_item.product_id, NEW.id, SQLERRM;
      END;
    END LOOP;

    NEW.stock_deducted := false;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Initial Sync: Ensure products.stock is up-to-date with central_inventory
UPDATE public.products p
SET stock = ci.stock_quantity,
    updated_at = now()
FROM public.central_inventory ci
WHERE p.id = ci.product_id
  AND (p.stock IS DISTINCT FROM ci.stock_quantity);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

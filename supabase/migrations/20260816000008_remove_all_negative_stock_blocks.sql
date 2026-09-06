-- ============================================================
-- REMOVE ALL REMAINING NEGATIVE STOCK BLOCKS
-- Purpose: Completely remove any physical database constraints or triggers
-- that prevent stock or available stock from going negative.
-- This is essential for the Backorder System to function correctly.
-- ============================================================

DO $$
BEGIN
    -- 1. Drop constraints on products table
    ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_stock_non_negative;
    ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_stock_check;

    -- 2. Drop constraints on central_inventory table
    -- Especially the one that says reserved_quantity <= stock_quantity
    ALTER TABLE public.central_inventory DROP CONSTRAINT IF EXISTS central_inventory_reserved_valid;
    ALTER TABLE public.central_inventory DROP CONSTRAINT IF EXISTS central_inventory_stock_quantity_check;

    -- 3. Drop the trigger that raises exceptions on negative available stock
    DROP TRIGGER IF EXISTS check_available_stock ON public.central_inventory;

    -- 4. Drop the function associated with the trigger
    DROP FUNCTION IF EXISTS public.validate_available_stock();

    -- 5. Clear all reserved stock since the system is being removed
    UPDATE public.central_inventory SET reserved_quantity = 0;
END $$;

-- Update the handle_order_inventory_movement trigger one more time to be 100% clean
-- ensuring NO reserved_quantity management is happening anymore.
CREATE OR REPLACE FUNCTION public.handle_order_inventory_movement()
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
  v_deducted_count integer := 0;
  v_product_name text;
  v_sku text;
  v_is_backorder_enabled boolean;
BEGIN
  -- Get order number for logging
  SELECT order_number INTO v_order_number FROM public.orders WHERE id = NEW.id;

  -- CASE 1: ORDER PAID (Deduct Stock)
  -- Fires when payment_status changes to 'paid' and hasn't been deducted yet
  IF (NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') AND (NEW.stock_deducted = false OR NEW.stock_deducted IS NULL)) THEN

    FOR v_item IN SELECT product_id, quantity, product_name FROM public.order_items WHERE order_id = NEW.id AND product_id IS NOT NULL LOOP

      -- Check if backorder is enabled for this product
      SELECT backorder INTO v_is_backorder_enabled FROM public.products WHERE id = v_item.product_id;

      -- Update products table (Allow negative stock to track backorder debt)
      UPDATE public.products
      SET stock = COALESCE(stock, 0) - v_item.quantity,
          updated_at = now()
      WHERE id = v_item.product_id
      RETURNING COALESCE(stock, 0) + v_item.quantity, COALESCE(stock, 0), name, sku INTO v_old_stock, v_new_stock, v_product_name, v_sku;

      -- Update central_inventory (Allow negative stock_quantity)
      -- We no longer touch reserved_quantity as that system is removed.
      UPDATE public.central_inventory
      SET stock_quantity = COALESCE(stock_quantity, 0) - v_item.quantity,
          reserved_quantity = 0,
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
        'ORDER', 'OUT',
        CASE WHEN v_is_backorder_enabled THEN 'Deducted ' || v_item.quantity || ' units — backorder debt recorded'
             ELSE 'Deducted ' || v_item.quantity || ' units — payment confirmed'
        END,
        now()
      );

      v_deducted_count := v_deducted_count + 1;
    END LOOP;

    IF v_deducted_count > 0 THEN
      NEW.stock_deducted := true;
      NEW.inventory_sync_status := 'synced';
      NEW.inventory_synced_at := now();
    END IF;

  -- CASE 2: ORDER CANCELLED/REFUNDED (Restore Stock)
  ELSIF (NEW.order_status IN ('cancelled', 'refunded') AND (OLD.order_status NOT IN ('cancelled', 'refunded')) AND NEW.stock_deducted = true) THEN

    FOR v_item IN SELECT product_id, quantity, product_name FROM public.order_items WHERE order_id = NEW.id AND product_id IS NOT NULL LOOP
      UPDATE public.products
      SET stock = COALESCE(stock, 0) + v_item.quantity,
          updated_at = now()
      WHERE id = v_item.product_id
      RETURNING COALESCE(stock, 0) - v_item.quantity, COALESCE(stock, 0), name, sku INTO v_old_stock, v_new_stock, v_product_name, v_sku;

      UPDATE public.central_inventory
      SET stock_quantity = COALESCE(stock_quantity, 0) + v_item.quantity,
          reserved_quantity = 0,
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
  END IF;

  RETURN NEW;
END;
$function$;

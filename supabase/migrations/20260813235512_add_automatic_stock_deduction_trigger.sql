/*
# Automatic Stock Deduction on Confirmed Orders

## Purpose
When any order's payment_status changes to 'paid' (or order_status changes to 'confirmed'),
automatically deduct the ordered quantity from products.stock for each order item
that has a valid product_id. This trigger was defined in a previous migration
(20260711000004_automated_inventory_deduction.sql) but was never actually created
in the database. This migration creates the function and trigger for real.

## Changes
1. Creates `handle_order_inventory_movement()` function (SECURITY DEFINER)
   - Fires BEFORE UPDATE on orders table
   - Case 1: Order becomes paid → deduct stock from products.stock for each order item with product_id
   - Case 2: Order cancelled/refunded → restore stock to products.stock
   - Sets stock_deducted flag to prevent double-deduction
   - Logs each movement in inventory_movements for audit trail
2. Creates `trg_order_inventory_movement` trigger on orders table
3. The existing `products_product_sync_webhook` AFTER UPDATE trigger on products
   will automatically fire when stock changes, pushing updated stock to all remote stores
   (MalluSpices via centralhub-realtime, KeralaGrocery/PocketGrocery via centralhub-product-sync)

## Important Notes
- The trigger only deducts for order items that have a non-null product_id
- Items without product_id are skipped (no stock deduction possible)
- Stock is deducted from products.stock column (the canonical stock field)
- The products_product_sync_webhook trigger handles pushing the update to remote stores
- The trigger is idempotent: stock_deducted flag prevents double-deduction
*/

-- Create the inventory movement function
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
  v_total_items integer := 0;
BEGIN
  -- Get order number for audit trail
  SELECT order_number INTO v_order_number FROM public.orders WHERE id = NEW.id;

  -- CASE 1: ORDER PAID (Deduct Stock)
  IF (NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') AND (NEW.stock_deducted = false OR NEW.stock_deducted IS NULL)) THEN

    FOR v_item IN SELECT product_id, quantity, product_name FROM public.order_items WHERE order_id = NEW.id AND product_id IS NOT NULL LOOP
      v_total_items := v_total_items + 1;

      -- Atomic deduction from products.stock
      UPDATE public.products
      SET stock = GREATEST(0, COALESCE(stock, 0) - v_item.quantity),
          updated_at = now()
      WHERE id = v_item.product_id
      RETURNING COALESCE(stock, 0) + v_item.quantity, COALESCE(stock, 0) INTO v_old_stock, v_new_stock;

      -- Also update central_inventory if a row exists
      UPDATE public.central_inventory
      SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - v_item.quantity),
          updated_at = now()
      WHERE product_id = v_item.product_id;

      -- Audit log
      INSERT INTO public.inventory_movements (
        product_id, order_id, order_number, change_amount, old_stock, new_stock,
        action_type, notes
      ) VALUES (
        v_item.product_id, NEW.id, v_order_number, -v_item.quantity, v_old_stock, v_new_stock,
        'DEDUCT', 'Order Paid (auto-trigger)'
      );

      v_deducted_count := v_deducted_count + 1;
    END LOOP;

    -- Mark as deducted if at least one item was deducted
    IF v_deducted_count > 0 THEN
      NEW.stock_deducted := true;
    END IF;

  -- CASE 2: ORDER CANCELLED/REFUNDED (Restore Stock)
  ELSIF (NEW.order_status IN ('cancelled', 'refunded') AND (OLD.order_status NOT IN ('cancelled', 'refunded')) AND NEW.stock_deducted = true) THEN

    FOR v_item IN SELECT product_id, quantity, product_name FROM public.order_items WHERE order_id = NEW.id AND product_id IS NOT NULL LOOP
      -- Restore stock to products.stock
      UPDATE public.products
      SET stock = COALESCE(stock, 0) + v_item.quantity,
          updated_at = now()
      WHERE id = v_item.product_id
      RETURNING COALESCE(stock, 0) - v_item.quantity, COALESCE(stock, 0) INTO v_old_stock, v_new_stock;

      -- Also restore central_inventory if a row exists
      UPDATE public.central_inventory
      SET stock_quantity = COALESCE(stock_quantity, 0) + v_item.quantity,
          updated_at = now()
      WHERE product_id = v_item.product_id;

      INSERT INTO public.inventory_movements (
        product_id, order_id, order_number, change_amount, old_stock, new_stock,
        action_type, notes
      ) VALUES (
        v_item.product_id, NEW.id, v_order_number, v_item.quantity, v_old_stock, v_new_stock,
        'RESTORE', 'Order ' || NEW.order_status || ' (auto-trigger)'
      );
    END LOOP;

    NEW.stock_deducted := false;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any (idempotent)
DROP TRIGGER IF EXISTS trg_order_inventory_movement ON public.orders;

-- Create the trigger
CREATE TRIGGER trg_order_inventory_movement
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_inventory_movement();

/*
# Fix Double Stock Deduction: Trigger Must Mark Orders as Synced

## Problem
When a paid order is synced from MalluSpices, the database trigger
`handle_order_inventory_movement` fires and deducts stock correctly. However,
it only sets `stock_deducted = true` without setting `inventory_sync_status = 'synced'`.
The sync-orders edge function then re-reads the order, sees
`inventory_sync_status != 'synced'`, and deducts stock AGAIN via
`deductStockForOrder`. This causes double-deduction.

## Fix
1. Update `handle_order_inventory_movement()` to also set
   `inventory_sync_status = 'synced'` and `inventory_synced_at = now()`
   when it deducts stock. This way the sync-orders function's filter
   (`inventory_sync_status !== 'synced'`) will correctly skip these orders.

2. Correct the Prawn Mango Curry stock that was double-deducted:
   - central_inventory.stock_quantity: 0 -> 1 (started at 2, ordered 1)
   - products.stock: 1 -> 1 (already correct from trigger, but ensure consistency)

3. Remove the duplicate inventory_logs entry for the same order.

## Important Notes
- The trigger fires BEFORE UPDATE on orders, so it sets these fields on NEW
  before the row is written. The sync-orders function's post-upsert query
  will then see `inventory_sync_status = 'synced'` and skip manual deduction.
- This is the root cause of stock discrepancies between CentralHub and remote stores.
*/

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
  SELECT order_number INTO v_order_number FROM public.orders WHERE id = NEW.id;

  -- CASE 1: ORDER PAID (Deduct Stock)
  IF (NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') AND (NEW.stock_deducted = false OR NEW.stock_deducted IS NULL)) THEN

    FOR v_item IN SELECT product_id, quantity, product_name FROM public.order_items WHERE order_id = NEW.id AND product_id IS NOT NULL LOOP
      v_total_items := v_total_items + 1;

      UPDATE public.products
      SET stock = GREATEST(0, COALESCE(stock, 0) - v_item.quantity),
          updated_at = now()
      WHERE id = v_item.product_id
      RETURNING COALESCE(stock, 0) + v_item.quantity, COALESCE(stock, 0) INTO v_old_stock, v_new_stock;

      UPDATE public.central_inventory
      SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - v_item.quantity),
          updated_at = now()
      WHERE product_id = v_item.product_id;

      INSERT INTO public.inventory_movements (
        product_id, order_id, order_number, change_amount, old_stock, new_stock,
        action_type, notes
      ) VALUES (
        v_item.product_id, NEW.id, v_order_number, -v_item.quantity, v_old_stock, v_new_stock,
        'DEDUCT', 'Order Paid (auto-trigger)'
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
      RETURNING COALESCE(stock, 0) - v_item.quantity, COALESCE(stock, 0) INTO v_old_stock, v_new_stock;

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
    NEW.inventory_sync_status := 'synced';
    NEW.inventory_synced_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- Drop and recreate the trigger
DROP TRIGGER IF EXISTS trg_order_inventory_movement ON public.orders;
CREATE TRIGGER trg_order_inventory_movement
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_inventory_movement();

-- Correct the Prawn Mango Curry stock (was double-deducted from 2 to 0, should be 1)
UPDATE public.central_inventory
SET stock_quantity = 1, updated_at = now()
WHERE product_id = 'd12d38e1-0ce5-44fa-b24a-41fdb82d486b';

UPDATE public.products
SET stock = 1, updated_at = now()
WHERE id = 'd12d38e1-0ce5-44fa-b24a-41fdb82d486b';

-- Remove the duplicate inventory_logs entry (two entries for same order, should be one)
DELETE FROM public.inventory_logs
WHERE id = 'ae78428d-d0a6-424d-8dec-10369e4dc516';

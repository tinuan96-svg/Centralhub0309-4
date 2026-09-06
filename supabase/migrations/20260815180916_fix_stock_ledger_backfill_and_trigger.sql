/*
  # Backfill missing product_name and sku in inventory_logs
  Also update the handle_order_inventory_movement trigger to also write to inventory_logs
  so all stock movements are in one audit table.
*/

-- Backfill product_name and sku from products table
UPDATE public.inventory_logs il
SET 
  product_name = p.name,
  sku = p.sku
FROM public.products p
WHERE il.product_id = p.id
  AND (il.product_name IS NULL OR il.sku IS NULL);

-- Backfill reference_type for ORDER type entries that have reference_number but no reference_type
UPDATE public.inventory_logs
SET reference_type = 'Customer Order'
WHERE type = 'ORDER' 
  AND reference_number IS NOT NULL 
  AND reference_type IS NULL;

-- Update the handle_order_inventory_movement function to also insert into inventory_logs
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
  v_total_items integer := 0;
  v_product_name text;
  v_sku text;
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
      RETURNING COALESCE(stock, 0) + v_item.quantity, COALESCE(stock, 0), name, sku INTO v_old_stock, v_new_stock, v_product_name, v_sku;

      UPDATE public.central_inventory
      SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - v_item.quantity),
          updated_at = now()
      WHERE product_id = v_item.product_id;

      -- Insert into inventory_movements (for backward compatibility)
      INSERT INTO public.inventory_movements (
        product_id, order_id, order_number, change_amount, old_stock, new_stock,
        action_type, notes
      ) VALUES (
        v_item.product_id, NEW.id, v_order_number, -v_item.quantity, v_old_stock, v_new_stock,
        'DEDUCT', 'Order Paid (auto-trigger)'
      );

      -- Also insert into inventory_logs (the main audit trail table)
      INSERT INTO public.inventory_logs (
        product_id, product_name, sku, order_id, reference_number, reference_type,
        change, old_quantity, new_quantity, type, movement_type, notes, created_at
      ) VALUES (
        v_item.product_id, COALESCE(v_product_name, v_item.product_name), v_sku, NEW.id,
        v_order_number, 'Customer Order',
        -v_item.quantity, v_old_stock, v_new_stock,
        'ORDER', 'OUT', 'Deducted ' || v_item.quantity || ' units — payment confirmed', now()
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
          updated_at = now()
      WHERE product_id = v_item.product_id;

      -- Insert into inventory_movements (for backward compatibility)
      INSERT INTO public.inventory_movements (
        product_id, order_id, order_number, change_amount, old_stock, new_stock,
        action_type, notes
      ) VALUES (
        v_item.product_id, NEW.id, v_order_number, v_item.quantity, v_old_stock, v_new_stock,
        'RESTORE', 'Order ' || NEW.order_status || ' (auto-trigger)'
      );

      -- Also insert into inventory_logs (the main audit trail table)
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

NOTIFY pgrst, 'reload schema';

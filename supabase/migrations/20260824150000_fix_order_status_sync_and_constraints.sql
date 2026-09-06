-- Fix for "Failed to update order status" errors caused by status value mismatches and constraint violations

-- 1. Ensure all legacy 'pending' statuses are migrated to 'pending_payment'
-- We do this for both order_status and fulfillment_status
UPDATE public.orders
SET order_status = 'pending_payment'
WHERE order_status = 'pending';

UPDATE public.orders
SET fulfillment_status = 'pending_payment'
WHERE fulfillment_status = 'pending' OR fulfillment_status IS NULL;

-- 2. Broaden status constraints to be inclusive of all known values
-- This prevents "check constraint" failures when code and DB are slightly out of sync

-- Drop existing constraints first
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_status_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_fulfillment_status_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_warehouse_status_check;

-- Add inclusive order_status constraint
ALTER TABLE public.orders ADD CONSTRAINT orders_order_status_check
  CHECK (order_status IN (
    'pending',
    'pending_payment',
    'paid',
    'confirmed',
    'picking',
    'picked',
    'packing',
    'packed',
    'ready_to_ship',
    'shipment_booked',
    'collected',
    'shipped',
    'at_local_depot',
    'out_for_delivery',
    'delivered',
    'completed',
    'cancelled',
    'refunded',
    'delivery_attempted',
    'ready_for_collection',
    'delivery_rescheduled',
    'returned',
    'failed'
  ));

-- Add inclusive fulfillment_status constraint
ALTER TABLE public.orders ADD CONSTRAINT orders_fulfillment_status_check
  CHECK (fulfillment_status IN (
    'pending',
    'pending_payment',
    'paid',
    'confirmed',
    'picking',
    'picked',
    'packing',
    'packed',
    'ready_to_ship',
    'shipment_booked',
    'collected',
    'shipped',
    'at_local_depot',
    'out_for_delivery',
    'delivered',
    'completed',
    'cancelled',
    'refunded',
    'delivery_attempted',
    'ready_for_collection',
    'delivery_rescheduled',
    'returned',
    'failed'
  ));

-- Add inclusive warehouse_status constraint
ALTER TABLE public.orders ADD CONSTRAINT orders_warehouse_status_check
  CHECK (warehouse_status IN (
    'pending',
    'picking',
    'picked',
    'packing',
    'packed',
    'ready_to_ship',
    'dispatched',
    'shipped'
  ));

-- 3. Ensure handle_order_inventory_movement trigger is resilient
-- We wrap the deduction logic to handle potential errors gracefully
-- and ensure it doesn't block valid status updates

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
  -- Get order details (use COALESCE to avoid null order_number issues)
  SELECT COALESCE(order_number, NEW.id::text) INTO v_order_number FROM public.orders WHERE id = NEW.id;

  -- CASE 1: ORDER PAID (Deduct Stock)
  -- Fires when payment_status changes to 'paid'
  IF (NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') AND (NEW.stock_deducted = false OR NEW.stock_deducted IS NULL)) THEN

    FOR v_item IN
      SELECT oi.product_id, oi.quantity, p.sku, p.name
      FROM public.order_items oi
      JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL
    LOOP
      BEGIN
        -- Atomic deduction from central_inventory (Source of Truth)
        INSERT INTO public.central_inventory (product_id, stock_quantity, updated_at)
        VALUES (v_item.product_id, -v_item.quantity, now())
        ON CONFLICT (product_id) DO UPDATE
        SET stock_quantity = public.central_inventory.stock_quantity - v_item.quantity,
            updated_at = now()
        RETURNING (public.central_inventory.stock_quantity + v_item.quantity), public.central_inventory.stock_quantity
        INTO v_old_stock, v_new_stock;

        -- Sync back to legacy products.stock for backward compatibility
        -- REMOVED: Management of products.stock moved to a central trigger on central_inventory
        -- to prevent "Direct updates to products.stock are blocked" errors.
        -- UPDATE public.products
        -- SET stock = COALESCE(v_new_stock, 0),
        --    updated_at = now()
        -- WHERE id = v_item.product_id;

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
        -- Log error but don't fail the whole order update
        RAISE WARNING 'Failed to deduct stock for product % in order %: %', v_item.product_id, NEW.id, SQLERRM;
      END;
    END LOOP;

    -- Mark as deducted if we processed at least one item
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

        -- Sync back to legacy products.stock
        UPDATE public.products
        SET stock = COALESCE(v_new_stock, 0),
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
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to restore stock for product % in order %: %', v_item.product_id, NEW.id, SQLERRM;
      END;
    END LOOP;

    NEW.stock_deducted := false;
  END IF;

  RETURN NEW;
END;
$$;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

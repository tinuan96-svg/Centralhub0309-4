/*
# Backfill Stock Deduction for Failed/Pending Orders

## Purpose
One-time migration to deduct stock for all paid orders that were never properly
deducted (inventory_sync_status = 'failed' or 'pending'). These orders failed
because the deductStockForOrder function only looked at central_inventory
and returned false when no row existed, even though the products have stock
in the products.stock column.

## Changes
1. For each order with payment_status = 'paid' AND inventory_sync_status IN ('failed', 'pending'):
   - For each order_item with a valid product_id:
     - Deduct the quantity from products.stock
     - Also update central_inventory if a row exists
     - Log the deduction in inventory_movements
2. Mark all such orders as inventory_sync_status = 'synced' and stock_deducted = true

## Important Notes
- This is a one-time backfill. Future orders will be handled by the
  trg_order_inventory_movement trigger created in the previous migration.
- The products_product_sync_webhook trigger will fire on each products.stock update,
  automatically pushing the new stock levels to all remote stores.
- Items without product_id are skipped (no stock to deduct).
*/

DO $$
DECLARE
  v_order_record record;
  v_item_record record;
  v_old_stock integer;
  v_new_stock integer;
  v_order_number text;
  v_deducted_count integer;
  v_total_processed integer := 0;
BEGIN
  FOR v_order_record IN
    SELECT id, order_number
    FROM public.orders
    WHERE payment_status = 'paid'
      AND inventory_sync_status IN ('failed', 'pending')
  LOOP
    v_deducted_count := 0;

    FOR v_item_record IN
      SELECT product_id, quantity, product_name
      FROM public.order_items
      WHERE order_id = v_order_record.id
        AND product_id IS NOT NULL
    LOOP
      -- Deduct from products.stock
      UPDATE public.products
      SET stock = GREATEST(0, COALESCE(stock, 0) - v_item_record.quantity),
          updated_at = now()
      WHERE id = v_item_record.product_id
      RETURNING COALESCE(stock, 0) + v_item_record.quantity, COALESCE(stock, 0)
        INTO v_old_stock, v_new_stock;

      -- Also update central_inventory if a row exists
      UPDATE public.central_inventory
      SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - v_item_record.quantity),
          updated_at = now()
      WHERE product_id = v_item_record.product_id;

      -- Log the deduction
      INSERT INTO public.inventory_movements (
        product_id, order_id, order_number, change_amount, old_stock, new_stock,
        action_type, notes
      ) VALUES (
        v_item_record.product_id, v_order_record.id, v_order_record.order_number,
        -v_item_record.quantity, v_old_stock, v_new_stock,
        'DEDUCT', 'Backfill: Order Paid (batch correction)'
      );

      v_deducted_count := v_deducted_count + 1;
    END LOOP;

    -- Mark order as synced
    UPDATE public.orders
    SET inventory_sync_status = 'synced',
        stock_deducted = true,
        inventory_synced_at = now()
    WHERE id = v_order_record.id;

    v_total_processed := v_total_processed + 1;
  END LOOP;

  RAISE NOTICE 'Backfill complete: processed % orders', v_total_processed;
END $$;

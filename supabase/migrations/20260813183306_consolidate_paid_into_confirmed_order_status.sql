/*
# Consolidate "paid" and "confirmed" order statuses

## Purpose
The "paid" and "confirmed" order statuses mean the same thing: the customer has paid and the order is ready for fulfillment. Having both creates confusion in the UI (two tabs, two filter options, two badge colors for the same meaning). This migration consolidates them into a single "confirmed" status.

## Changes

1. Data Migration
   - Update all orders with `order_status = 'paid'` to `order_status = 'confirmed'`
   - The `payment_status` field (which also uses 'paid') is SEPARATE and stays unchanged

2. Constraint Update
   - Drop the existing CHECK constraint on `orders.order_status`
   - Recreate it WITHOUT the 'paid' value, keeping all other statuses including 'confirmed'

3. Status History
   - Update `order_status_history` table entries that reference 'paid' as old_status or new_status to 'confirmed'

## Important Notes
- `payment_status = 'paid'` is NOT touched — that field tracks the payment itself, not the fulfillment stage
- The migration is idempotent: re-running it is safe because there will be no rows with 'paid' after the first run
- No data is lost: orders are simply moved from one valid status to another
*/

-- Step 1: Update existing orders with order_status = 'paid' to 'confirmed'
UPDATE orders SET order_status = 'confirmed' WHERE order_status = 'paid';

-- Step 2: Update order_status_history entries that reference 'paid'
UPDATE order_status_history SET old_status = 'confirmed' WHERE old_status = 'paid';
UPDATE order_status_history SET new_status = 'confirmed' WHERE new_status = 'paid';

-- Step 3: Drop and recreate the CHECK constraint without 'paid'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_status_check;

ALTER TABLE orders ADD CONSTRAINT orders_order_status_check
  CHECK (order_status IN (
    'pending_payment', 'confirmed', 'picking', 'packing', 'packed',
    'ready_to_ship', 'shipment_booked', 'shipped', 'out_for_delivery',
    'delivered', 'completed', 'cancelled', 'refunded'
  ));

-- Phase 5: Standardise order statuses to match the CentralHub fulfilment spec.
-- Permitted: pending_payment, paid, confirmed, picking, packing, packed, ready_to_ship,
-- shipment_booked, shipped, out_for_delivery, delivered, completed, cancelled, refunded

-- 1. Drop existing constraints FIRST (before data migration)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_status_check;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_warehouse_status_check;

-- 2. Migrate legacy order_status values
UPDATE orders SET order_status = 'pending_payment' WHERE order_status = 'pending';
UPDATE orders SET order_status = 'packing' WHERE order_status IN ('processing', 'ready_for_packing');

-- 3. Migrate warehouse_status values
UPDATE orders SET warehouse_status = 'packing' WHERE warehouse_status IN ('ready_for_packing', 'completed');

-- 4. Migrate legacy `status` column values
UPDATE orders SET status = 'pending_payment' WHERE status = 'pending';
UPDATE orders SET status = 'confirmed' WHERE status = 'not_shipped';

-- 5. Add new constraints
ALTER TABLE orders ADD CONSTRAINT orders_order_status_check
  CHECK (order_status IN (
    'pending_payment', 'paid', 'confirmed', 'picking', 'packing', 'packed',
    'ready_to_ship', 'shipment_booked', 'shipped', 'out_for_delivery',
    'delivered', 'completed', 'cancelled', 'refunded'
  ));

ALTER TABLE orders ADD CONSTRAINT orders_warehouse_status_check
  CHECK (warehouse_status IN (
    'pending', 'picking', 'packing', 'packed', 'ready_to_ship', 'dispatched'
  ));

-- 6. Add indexes for faster status queries
CREATE INDEX IF NOT EXISTS idx_orders_order_status ON orders (order_status);
CREATE INDEX IF NOT EXISTS idx_orders_warehouse_status ON orders (warehouse_status);

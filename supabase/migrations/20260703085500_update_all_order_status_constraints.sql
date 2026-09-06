-- 1. Update orders table status check
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_status_check
  CHECK (order_status IN ('pending', 'confirmed', 'processing', 'packing', 'shipped', 'delivered', 'cancelled', 'refunded'));

-- 2. Update order_status_history table status check
ALTER TABLE order_status_history DROP CONSTRAINT IF EXISTS order_status_history_new_status_check;
ALTER TABLE order_status_history ADD CONSTRAINT order_status_history_new_status_check
  CHECK (new_status IN ('pending', 'confirmed', 'processing', 'packing', 'shipped', 'delivered', 'cancelled', 'refunded'));

-- 3. Update order_status_history inventory_action check (add 'return' just in case)
ALTER TABLE order_status_history DROP CONSTRAINT IF EXISTS order_status_history_inventory_action_check;
ALTER TABLE order_status_history ADD CONSTRAINT order_status_history_inventory_action_check
  CHECK (inventory_action IN ('reserve', 'commit', 'release', 'return', 'none'));

COMMENT ON COLUMN orders.order_status IS 'Comprehensive order status tracking.';

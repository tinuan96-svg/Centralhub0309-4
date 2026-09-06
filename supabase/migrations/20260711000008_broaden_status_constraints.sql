-- Broaden status constraints for orders and shipments to ensure compatibility with WMS workflow

-- 1. Update orders table status check (include ready_to_ship if used as order_status)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_order_status_check
  CHECK (order_status IN ('pending', 'confirmed', 'processing', 'picking', 'ready_for_packing', 'packing', 'ready_to_ship', 'shipped', 'delivered', 'cancelled', 'refunded'));

-- 2. Update order_status_history table status check
ALTER TABLE public.order_status_history DROP CONSTRAINT IF EXISTS order_status_history_new_status_check;
ALTER TABLE public.order_status_history ADD CONSTRAINT order_status_history_new_status_check
  CHECK (new_status IN ('pending', 'confirmed', 'processing', 'picking', 'ready_for_packing', 'packing', 'ready_to_ship', 'shipped', 'delivered', 'cancelled', 'refunded'));

-- 3. Update shipments table status check
ALTER TABLE public.shipments DROP CONSTRAINT IF EXISTS shipments_status_check;
ALTER TABLE public.shipments ADD CONSTRAINT shipments_status_check
  CHECK (status IN ('not_shipped', 'ready_to_ship', 'label_created', 'collected', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'cancelled', 'returned'));

-- 4. Ensure fulfillment_status enum is comprehensive (if it was created as an enum)
-- PostgreSQL doesn't support easy ALTER TYPE ADD VALUE in a transaction with other commands
-- but we can try if it's not already there.
-- Note: 'ready_to_ship' and 'shipped' were already in the enum from previous migrations.

COMMENT ON TABLE public.shipments IS 'Table storing all carrier shipment details and tracking info.';

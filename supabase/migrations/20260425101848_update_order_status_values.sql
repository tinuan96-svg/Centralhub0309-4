/*
  # Update order_status allowed values

  New set: pending, confirmed, cancelled, refunded, packing, shipped
  Removes: processing, delivered (replaced by confirmed/packing/shipped flow)
  Adds: refunded (was only a payment_status before)
*/

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_status_check;

ALTER TABLE orders ADD CONSTRAINT orders_order_status_check
  CHECK (order_status = ANY (ARRAY[
    'pending'::text,
    'confirmed'::text,
    'packing'::text,
    'shipped'::text,
    'cancelled'::text,
    'refunded'::text,
    'processing'::text,
    'delivered'::text
  ]));

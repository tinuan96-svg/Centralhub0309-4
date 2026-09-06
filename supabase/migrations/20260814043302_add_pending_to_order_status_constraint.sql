-- Add 'pending' as a valid order_status to match the fallback used by the sync function.
-- The sync edge function maps unknown remote statuses to "pending_payment" now,
-- but some older code paths may still use "pending" so we add it to the constraint.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_order_status_check
CHECK (order_status = ANY (ARRAY[
  'pending'::character varying,
  'pending_payment'::character varying,
  'confirmed'::character varying,
  'picking'::character varying,
  'packing'::character varying,
  'packed'::character varying,
  'ready_to_ship'::character varying,
  'shipment_booked'::character varying,
  'shipped'::character varying,
  'out_for_delivery'::character varying,
  'delivered'::character varying,
  'completed'::character varying,
  'cancelled'::character varying,
  'refunded'::character varying
]));

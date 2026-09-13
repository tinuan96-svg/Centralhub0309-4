-- Restore missing warehouse workflow columns that already exist in the canonical migration history.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS packing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS packed_by_user uuid REFERENCES auth.users(id);

-- Canonical operational lifecycle for CentralHub orders.
-- This is intentionally server-side so UI, voice picking, mobile app and future clients
-- all converge on the same customer-visible status sequence.
CREATE OR REPLACE FUNCTION public.canonicalize_order_operational_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Picking may not be skipped by stale client-side picked flags. If a confirmed/paid
  -- order is incorrectly pushed straight to packing, keep it in picking instead.
  IF OLD.order_status IN ('paid', 'confirmed') AND NEW.order_status = 'packing' THEN
    NEW.order_status := 'picking';
    NEW.status := 'picking';
    NEW.warehouse_status := 'picking';
    NEW.picking_started_at := COALESCE(NEW.picking_started_at, now());
    NEW.picking_completed_at := NULL;
    NEW.packing_started_at := NULL;
  END IF;

  IF NEW.order_status = 'picking' THEN
    NEW.status := 'picking';
    NEW.warehouse_status := 'picking';
    NEW.picking_started_at := COALESCE(NEW.picking_started_at, now());

  ELSIF NEW.order_status = 'packing' THEN
    NEW.status := 'packing';
    NEW.warehouse_status := 'packing';
    NEW.picking_completed_at := COALESCE(NEW.picking_completed_at, now());
    NEW.packing_started_at := COALESCE(NEW.packing_started_at, now());
    IF NEW.packing_status IS NULL THEN NEW.packing_status := 'pending'; END IF;

  ELSIF NEW.order_status = 'packed' THEN
    -- Customer-facing lifecycle does not expose a separate "packed" dead-end.
    -- Completing packing means the parcel is ready to ship.
    NEW.order_status := 'ready_to_ship';
    NEW.status := 'ready_to_ship';
    NEW.warehouse_status := 'ready_to_ship';
    NEW.fulfillment_status := 'ready_to_ship';
    NEW.packing_status := 'completed';
    NEW.packed_at := COALESCE(NEW.packed_at, now());
    NEW.ready_to_ship_at := COALESCE(NEW.ready_to_ship_at, now());

  ELSIF NEW.order_status = 'ready_to_ship' THEN
    NEW.status := 'ready_to_ship';
    NEW.warehouse_status := 'ready_to_ship';
    NEW.fulfillment_status := 'ready_to_ship';
    NEW.packing_status := 'completed';
    NEW.packed_at := COALESCE(NEW.packed_at, now());
    NEW.ready_to_ship_at := COALESCE(NEW.ready_to_ship_at, now());

  ELSIF NEW.order_status IN ('collected', 'in_transit') THEN
    -- Carrier collection/in-transit are shipment-detail states. Customers see SHIPPED.
    NEW.order_status := 'shipped';
    NEW.status := 'shipped';
    NEW.warehouse_status := 'dispatched';
    NEW.fulfillment_status := 'shipped';
    NEW.dispatched_at := COALESCE(NEW.dispatched_at, now());

  ELSIF NEW.order_status = 'shipped' THEN
    NEW.status := 'shipped';
    NEW.warehouse_status := 'dispatched';
    NEW.fulfillment_status := 'shipped';
    NEW.dispatched_at := COALESCE(NEW.dispatched_at, now());

  ELSIF NEW.order_status = 'completed'
        AND lower(COALESCE(NEW.fulfillment_status, '')) = 'delivered' THEN
    -- Preserve the explicit delivered stage on customer accounts.
    NEW.order_status := 'delivered';
    NEW.status := 'delivered';
    NEW.fulfillment_status := 'delivered';

  ELSIF NEW.order_status = 'delivered' THEN
    NEW.status := 'delivered';
    NEW.fulfillment_status := 'delivered';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_canonicalize_order_operational_status ON public.orders;
CREATE TRIGGER trg_zz_canonicalize_order_operational_status
BEFORE UPDATE OF order_status, warehouse_status, fulfillment_status, packing_status, packed_at, ready_to_ship_at
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.canonicalize_order_operational_status();

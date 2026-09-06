-- Synchronize all order status constraints across tables to prevent "Failed to update status" errors

-- 0. PREPARATION: Drop all existing status constraints first to allow data migration without trigger failures
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_status_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_warehouse_status_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_fulfillment_status_check;
ALTER TABLE public.order_status_history DROP CONSTRAINT IF EXISTS order_status_history_new_status_check;
ALTER TABLE public.order_status_history DROP CONSTRAINT IF EXISTS order_status_history_old_status_check;

-- 1. CONVERSION: Convert fulfillment_status from ENUM to TEXT to allow for more flexible status values
-- This resolves the "invalid input value for enum fulfillment_status" errors
DO $$
BEGIN
    -- Check if it's already text, if not, convert it
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'fulfillment_status' AND data_type = 'USER-DEFINED'
    ) THEN
        ALTER TABLE public.orders ALTER COLUMN fulfillment_status TYPE text USING fulfillment_status::text;
    END IF;
END $$;

-- 2. DATA MIGRATION: Map legacy statuses to new standardized ones
-- We do this BEFORE adding constraints to ensure existing data is valid
UPDATE public.orders SET order_status = 'pending_payment' WHERE order_status = 'pending';
UPDATE public.orders SET order_status = 'packing' WHERE order_status IN ('processing', 'ready_for_packing');

UPDATE public.order_status_history SET new_status = 'pending_payment' WHERE new_status = 'pending';
UPDATE public.order_status_history SET new_status = 'packing' WHERE new_status IN ('processing', 'ready_for_packing');

UPDATE public.order_status_history SET old_status = 'pending_payment' WHERE old_status = 'pending';
UPDATE public.order_status_history SET old_status = 'packing' WHERE old_status IN ('processing', 'ready_for_packing');

-- Standardize warehouse_status and fulfillment_status
UPDATE public.orders SET warehouse_status = 'packing' WHERE warehouse_status IN ('processing', 'ready_for_packing');
UPDATE public.orders SET fulfillment_status = order_status WHERE fulfillment_status IS NULL;
UPDATE public.orders SET fulfillment_status = 'packing' WHERE fulfillment_status IN ('processing', 'ready_for_packing');

-- Ensure packed_by_user column exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'packed_by_user') THEN
        ALTER TABLE public.orders ADD COLUMN packed_by_user uuid REFERENCES auth.users(id);
    END IF;
END $$;

-- 3. Standardize Order Statuses for Orders Table
ALTER TABLE public.orders ADD CONSTRAINT orders_order_status_check
  CHECK (order_status IN (
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

-- 4. Standardize Fulfillment Statuses for Orders Table
ALTER TABLE public.orders ADD CONSTRAINT orders_fulfillment_status_check
  CHECK (fulfillment_status IN (
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

-- 5. Standardize New Status for Order Status History
ALTER TABLE public.order_status_history ADD CONSTRAINT order_status_history_new_status_check
  CHECK (new_status IN (
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

-- 6. Standardize Old Status for Order Status History
ALTER TABLE public.order_status_history ADD CONSTRAINT order_status_history_old_status_check
  CHECK (old_status IS NULL OR old_status IN (
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

-- 7. Standardize Warehouse Status
ALTER TABLE public.orders ADD CONSTRAINT orders_warehouse_status_check
  CHECK (warehouse_status IN (
    'pending',
    'picking',
    'picked',
    'packing',
    'packed',
    'ready_to_ship',
    'dispatched'
  ));

-- 8. RECREATE FUNCTIONS: Update RPC functions to use TEXT instead of the old enum
CREATE OR REPLACE FUNCTION update_order_fulfillment_status(
  p_order_id uuid,
  p_status text,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE orders
  SET
    fulfillment_status = p_status,
    fulfillment_notes = COALESCE(p_notes, fulfillment_notes),
    packed_at = CASE WHEN p_status = 'packed' THEN now() ELSE packed_at END,
    ready_to_ship_at = CASE WHEN p_status = 'ready_to_ship' THEN now() ELSE ready_to_ship_at END,
    updated_at = now()
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION bulk_update_fulfillment_status(
  p_order_ids uuid[],
  p_status text,
  p_notes text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE orders
  SET
    fulfillment_status = p_status,
    fulfillment_notes = COALESCE(p_notes, fulfillment_notes),
    packed_at = CASE WHEN p_status = 'packed' THEN now() ELSE packed_at END,
    ready_to_ship_at = CASE WHEN p_status = 'ready_to_ship' THEN now() ELSE ready_to_ship_at END,
    updated_at = now()
  WHERE id = ANY(p_order_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

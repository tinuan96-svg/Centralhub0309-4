-- Add 'picked' to order_status constraints
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_order_status_check
  CHECK (order_status IN (
    'pending_payment', 'paid', 'confirmed', 'picking', 'picked', 'packing', 'packed',
    'ready_to_ship', 'shipment_booked', 'shipped', 'out_for_delivery',
    'delivered', 'completed', 'cancelled', 'refunded'
  ));

-- Add verified_quantity to order_items to support barcode verification during packing
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS verified_quantity integer DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id);

-- Add packing-specific fields to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS packing_started_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS packed_by_user uuid REFERENCES auth.users(id);

-- Create audit log table for warehouse actions if it doesn't exist
CREATE TABLE IF NOT EXISTS public.warehouse_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL, -- PICK_STARTED, ITEM_PICKED, PICKING_COMPLETED, BARCODE_SCANNED, BARCODE_VERIFIED, WRONG_BARCODE, PACKING_COMPLETED
  details jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on warehouse_logs
ALTER TABLE public.warehouse_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view warehouse logs" ON public.warehouse_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert warehouse logs" ON public.warehouse_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Function to check if an order is fully verified for packing
CREATE OR REPLACE FUNCTION public.is_order_fully_verified(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)
  INTO v_count
  FROM public.order_items
  WHERE order_id = p_order_id
    AND (verified_quantity < quantity);

  RETURN v_count = 0;
END;
$$;

-- Function to enforce packing verification before shipment creation
CREATE OR REPLACE FUNCTION public.check_order_packing_verification()
RETURNS trigger AS $$
BEGIN
  IF NEW.order_id IS NOT NULL THEN
    IF NOT public.is_order_fully_verified(NEW.order_id) THEN
      RAISE EXCEPTION 'Shipment cannot be created. Order items have not been fully barcode-verified during packing.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_packing_verification ON public.shipments;
CREATE TRIGGER trg_ensure_packing_verification
  BEFORE INSERT ON public.shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_order_packing_verification();


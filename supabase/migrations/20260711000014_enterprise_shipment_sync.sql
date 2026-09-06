-- ENTERPRISE SHIPMENT SYNCHRONIZATION SYSTEM
-- Objective: Single source of truth for shipments with reliable store-front sync

-- 1. EXTEND ORDERS TABLE (CENTRALHUB)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_url text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipment_label_url text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipment_booked_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier_name text DEFAULT 'DHL eCommerce UK';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipment_number text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS label_printed boolean DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_delivery timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS actual_delivery timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS last_tracking_status text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sync_updated_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS confirmed_order_number text;

-- 2. EXTEND SHIPMENTS TABLE (CENTRALHUB)
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS tracking_url text;
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS booked_at timestamptz DEFAULT now();

-- 3. CREATE SHIPMENT SYNC QUEUE
CREATE TABLE IF NOT EXISTS public.shipment_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL, -- CREATED, STATUS_UPDATE, DELIVERED, etc.
  store_id uuid NOT NULL REFERENCES public.stores(id),
  order_number text NOT NULL,
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retry')),
  retry_count integer DEFAULT 0,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipment_sync_queue_status ON public.shipment_sync_queue(status) WHERE status IN ('pending', 'retry');

-- 4. CREATE SHIPMENT SYNC LOGS (AUDIT TRAIL)
CREATE TABLE IF NOT EXISTS public.shipment_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  order_number text NOT NULL,
  shipment_number text,
  tracking_number text,
  event_type text NOT NULL,
  previous_status text,
  new_status text,
  sync_time interval,
  result text NOT NULL, -- success, failure
  error_message text,
  user_id uuid REFERENCES auth.users(id),
  webhook_id text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipment_sync_logs_order ON public.shipment_sync_logs(store_id, order_number);

-- 5. TRIGGER: AUTO-UPDATE ORDER WHEN SHIPMENT CHANGES
CREATE OR REPLACE FUNCTION public.handle_shipment_order_auto_update()
RETURNS trigger AS $$
BEGIN
  UPDATE public.orders
  SET
    tracking_number = NEW.tracking_number,
    tracking_url = NEW.tracking_url,
    shipment_label_url = NEW.label_url,
    shipment_booked_at = NEW.booked_at,
    courier_name = 'DHL eCommerce UK',
    carrier = NEW.carrier,
    service_type = NEW.service_type,
    shipment_number = NEW.shipment_number,
    label_printed = NEW.label_printed,
    estimated_delivery = NEW.estimated_delivery,
    actual_delivery = NEW.actual_delivery,
    last_tracking_status = NEW.status,
    updated_at = now()
  WHERE id = NEW.order_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shipment_order_auto_update ON public.shipments;
CREATE TRIGGER trg_shipment_order_auto_update
  AFTER INSERT OR UPDATE ON public.shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_shipment_order_auto_update();

-- 6. PERMISSIONS
GRANT ALL ON public.shipment_sync_queue TO authenticated;
GRANT ALL ON public.shipment_sync_logs TO authenticated;

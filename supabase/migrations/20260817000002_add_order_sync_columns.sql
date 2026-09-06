-- Add synchronization tracking columns to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sync_state text DEFAULT 'pending' CHECK (sync_state IN ('pending', 'synced', 'failed'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sync_error text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS centralhub_order_id text;

-- Backfill existing orders with a CentralHub ID if missing
UPDATE public.orders
SET centralhub_order_id = 'CH-' || LPAD(floor(random() * 1000000)::text, 6, '0')
WHERE centralhub_order_id IS NULL;

-- Create index for monitoring
CREATE INDEX IF NOT EXISTS idx_orders_sync_state ON public.orders(sync_state);
CREATE INDEX IF NOT EXISTS idx_orders_centralhub_id ON public.orders(centralhub_order_id);

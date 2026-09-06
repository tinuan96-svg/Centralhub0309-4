/*
# Add DHL Tracking Poller System

1. New Columns on shipments
- last_tracked_at (timestamptz, nullable) - when the poller last checked DHL tracking for this shipment
- tracking_error (text, nullable) - last error message from the DHL tracking API for this shipment
- tracking_retry_count (integer, default 0) - consecutive tracking failures; resets on success; poller skips after 5

2. New Function: trigger_dhl_tracking_poll()
- Uses pg_net to POST to the dhl-tracking-poller edge function
- Reads the Supabase URL and service role key from app_config
- Fire-and-forget - errors are swallowed so the cron job never crashes

3. New pg_cron Job: dhl-tracking-poll
- Runs every 10 minutes
- Calls trigger_dhl_tracking_poll()

4. Index
- Partial index on shipments(status) excluding terminal states so the poller query is fast

5. Security
- No RLS policy changes (existing policies on shipments remain)
- The function runs with SECURITY DEFINER so pg_cron can invoke pg_net
*/

-- 1. Add tracking control columns to shipments
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS last_tracked_at timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_error text,
  ADD COLUMN IF NOT EXISTS tracking_retry_count integer NOT NULL DEFAULT 0;

-- 2. Partial index for the poller query: active shipments with tracking numbers
CREATE INDEX IF NOT EXISTS idx_shipments_active_tracking
  ON public.shipments (updated_at)
  WHERE tracking_number IS NOT NULL
    AND status NOT IN ('delivered', 'cancelled', 'returned')
    AND COALESCE(tracking_retry_count, 0) < 5;

-- 3. Trigger function that invokes the edge function via pg_net
CREATE OR REPLACE FUNCTION public.trigger_dhl_tracking_poll()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supabase_url  text;
  v_service_key   text;
  v_func_url      text;
  v_request_id    bigint;
BEGIN
  SELECT value INTO v_supabase_url FROM public.app_config WHERE key = 'supabase_url';
  SELECT value INTO v_service_key  FROM public.app_config WHERE key = 'service_role_key';

  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    RETURN;
  END IF;

  v_func_url := v_supabase_url || '/functions/v1/dhl-tracking-poller';

  v_request_id := net.http_post(
    url     := v_func_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body    := jsonb_build_object('action', 'poll')
  );
END;
$$;

-- 4. Register the pg_cron job (drop first for idempotency)
DO $$
BEGIN
  PERFORM cron.unschedule('dhl-tracking-poll');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'dhl-tracking-poll',
  '*/10 * * * *',
  $$SELECT public.trigger_dhl_tracking_poll();$$
);

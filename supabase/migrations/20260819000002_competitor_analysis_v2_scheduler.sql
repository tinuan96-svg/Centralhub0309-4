-- migration: 20260819000002_competitor_analysis_v2_scheduler.sql
-- Description: Intelligent Competitor Analysis Upgrade - Step 3: pg_cron Scheduler

-- 1. Helper function to trigger the competitor price scanner
-- Uses SECURITY DEFINER to run as postgres (required for net extension access)
CREATE OR REPLACE FUNCTION public.trigger_competitor_price_scan()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  v_function_url text;
  v_anon_key text;
  v_request_id bigint;
BEGIN
  -- 1. Get the project URL and anon key
  -- In a production Supabase environment, we construction the URL from project ref
  -- For this environment, we use the known internal relay or static URL
  v_function_url := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/competitor-price-scanner';

  -- 2. Get the anon key from vault for authentication
  SELECT decrypted_secret INTO v_anon_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_ANON_KEY'
  LIMIT 1;

  IF v_anon_key IS NULL THEN
    v_anon_key := '';
  END IF;

  -- 3. Trigger the scan action
  -- The Edge Function handles batching (20 items) and next_scan_at calculation
  SELECT id INTO v_request_id
  FROM net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := jsonb_build_object('action', 'scan')
  );

  -- 4. Log the scheduler trigger in audit logs for monitoring
  INSERT INTO public.competitor_audit_logs (action, details)
  VALUES ('SCHEDULER_INVOKED', jsonb_build_object(
    'net_request_id', v_request_id,
    'timestamp', now()
  ));
END;
$$;

-- 2. Grant execute to postgres (cron runner)
GRANT EXECUTE ON FUNCTION public.trigger_competitor_price_scan() TO postgres;

-- 3. Schedule the job to run every 15 minutes
-- This checks for any products due for a scan (next_scan_at <= now())
-- Batch size of 20 per 15 mins = ~1,900 scans per day, scalable by frequency.
DO $$
BEGIN
  -- Unschedule existing to prevent duplicates
  PERFORM cron.unschedule('competitor-price-scan-scheduler');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

SELECT cron.schedule(
  'competitor-price-scan-scheduler',
  '*/15 * * * *', -- Every 15 minutes
  $$SELECT public.trigger_competitor_price_scan()$$
);

COMMENT ON FUNCTION public.trigger_competitor_price_scan IS 'Invokes the competitor-price-scanner Edge Function to process due scans in batches of 20.';

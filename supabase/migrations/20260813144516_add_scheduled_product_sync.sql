/*
# Add Scheduled Product Sync (Every 5 Minutes)

## Purpose
Creates a pg_cron job that calls the centralhub-product-sync edge function every 5 minutes.
This ensures product changes (price, stock, brand, visibility) propagate to all remote stores
(KeralaGrocery, MallusPices, PocketGrocery) automatically, without relying on webhooks or
manual triggers.

## Changes
1. Creates a helper function `trigger_product_sync()` that uses pg_net to POST to the
   centralhub-product-sync edge function with `{ action: "poll" }`.
2. Schedules the helper function to run every 5 minutes via pg_cron.
3. Grants execute on the helper function to the postgres role (cron runs as postgres).

## How it works
- Every 5 minutes, pg_cron calls `trigger_product_sync()`.
- The function sends an HTTP POST to the edge function using pg_net.
- The edge function fetches all products from the local database, maps them, and upserts
  them into each remote store's products table.
- Results are logged in the `sync_logs` table.

## Notes
- pg_cron and pg_net are already installed on this project.
- The edge function URL is constructed from the known project reference.
- The anon key is used for authentication (the function has verify_jwt=false).
- The job is named 'product-sync-every-5-min' for easy identification.
*/

-- Create a helper function that triggers the edge function via pg_net
CREATE OR REPLACE FUNCTION public.trigger_product_sync()
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
  v_function_url := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/centralhub-product-sync';
  
  -- Get the anon key from vault
  SELECT decrypted_secret INTO v_anon_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_ANON_KEY'
  LIMIT 1;
  
  IF v_anon_key IS NULL THEN
    v_anon_key := '';
  END IF;
  
  -- Make the HTTP POST request
  SELECT id INTO v_request_id
  FROM net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := jsonb_build_object('action', 'poll')
  );
  
  -- Log that we triggered the sync
  INSERT INTO public.sync_logs ("table", record_id, action, success, duration, error)
  VALUES ('products', 'scheduled', 'cron_trigger', true, 0, null);
END;
$$;

-- Grant execute to postgres (cron runs as postgres)
GRANT EXECUTE ON FUNCTION public.trigger_product_sync() TO postgres;

-- Schedule the job every 5 minutes
-- First unschedule any existing job with the same name
DO $$
BEGIN
  PERFORM cron.unschedule('product-sync-every-5-min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

-- Schedule the new job
SELECT cron.schedule(
  'product-sync-every-5-min',
  '*/5 * * * *',
  $$SELECT public.trigger_product_sync()$$
);

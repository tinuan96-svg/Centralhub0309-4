/*
# Fix Competitor Auto-Scan and WhatsApp Retry Cron Jobs

## Problem
1. competitor-auto-scan cron job is missing (previous migration failed silently)
2. whatsapp-retry-worker cron job hardcodes the service-role JWT in its command

## Solution
1. Create competitor-auto-scan using the existing ANON_KEY vault secret
2. Recreate whatsapp-retry-worker using the same ANON_KEY vault secret
   (The edge function uses SUPABASE_SERVICE_ROLE_KEY from its own env, not the
   caller's JWT — so the anon key is sufficient for authentication.)

## Idempotent
Both jobs are unscheduled first (if they exist), then rescheduled.
*/

-- Helper function to safely unschedule (ignore if not found)
CREATE OR REPLACE FUNCTION pg_temp.unschedule_if_exists(p_jobname text)
RETURNS void AS $$
BEGIN
  PERFORM cron.unschedule(p_jobname);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Job % does not exist or could not be unscheduled: %', p_jobname, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. COMPETITOR AUTO-SCAN
-- ============================================================
SELECT pg_temp.unschedule_if_exists('competitor-auto-scan');

DO $$
DECLARE
  v_anon_key text;
  v_project_ref text;
  v_url text;
BEGIN
  SELECT decrypted_secret INTO v_anon_key
  FROM vault.decrypted_secrets
  WHERE name = 'ANON_KEY'
  LIMIT 1;

  IF v_anon_key IS NULL THEN
    RAISE EXCEPTION 'ANON_KEY vault secret not found — cannot schedule competitor-auto-scan';
  END IF;

  -- Extract project ref from the JWT 'ref' claim
  v_project_ref := substring(v_anon_key from '"ref":"([^"]+)"');

  -- Final fallback: use the known project ref
  IF v_project_ref IS NULL OR v_project_ref = '' THEN
    v_project_ref := 'icnvrpnzjjcbvgcqgiua';
  END IF;

  v_url := 'https://' || v_project_ref || '.supabase.co/functions/v1/competitor-price-scanner';

  PERFORM cron.schedule(
    'competitor-auto-scan',
    '0 */6 * * *',
    format(
      $cmd$
        SELECT net.http_post(
          url := '%s',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer %s'
          ),
          body := '{"action": "scan"}'::jsonb
        ) AS request_id;
      $cmd$,
      v_url,
      v_anon_key
    )
  );
END $$;

-- ============================================================
-- 2. WHATSAPP RETRY WORKER — remove hardcoded JWT
-- ============================================================
SELECT pg_temp.unschedule_if_exists('whatsapp-retry-worker');

DO $$
DECLARE
  v_anon_key text;
  v_project_ref text;
  v_url text;
BEGIN
  SELECT decrypted_secret INTO v_anon_key
  FROM vault.decrypted_secrets
  WHERE name = 'ANON_KEY'
  LIMIT 1;

  IF v_anon_key IS NULL THEN
    RAISE EXCEPTION 'ANON_KEY vault secret not found — cannot schedule whatsapp-retry-worker';
  END IF;

  v_project_ref := substring(v_anon_key from '"ref":"([^"]+)"');

  IF v_project_ref IS NULL OR v_project_ref = '' THEN
    v_project_ref := 'icnvrpnzjjcbvgcqgiua';
  END IF;

  v_url := 'https://' || v_project_ref || '.supabase.co/functions/v1/whatsapp-retry-worker';

  PERFORM cron.schedule(
    'whatsapp-retry-worker',
    '*/2 * * * *',
    format(
      $cmd$
        SELECT net.http_post(
          url := '%s',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer %s'
          ),
          body := '{}'::jsonb
        ) AS request_id;
      $cmd$,
      v_url,
      v_anon_key
    )
  );
END $$;

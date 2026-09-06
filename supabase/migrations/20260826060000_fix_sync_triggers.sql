-- FIX SYNC TRIGGERS: ordering_key, UUID validation, and MalluSpices type mismatch
-- Objective: Ensure stable, idempotent, and type-safe product synchronization.

-- 1. Helper function for UUID validation
CREATE OR REPLACE FUNCTION public.is_valid_uuid(p_id text)
RETURNS boolean AS $$
BEGIN
  RETURN p_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Update notify_malluspices_product_webhook to include ordering_key and validate UUID
CREATE OR REPLACE FUNCTION public.notify_malluspices_product_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_record     jsonb;
  v_payload    jsonb;
  v_event_type text;
  v_url        text := 'https://ixzbnifmsxunlarhfimp.supabase.co/functions/v1/centralhub-realtime';
  v_secret     text;
  v_headers    jsonb;
  v_req_id     bigint;
  v_product_id text;
  v_ordering_key text;
BEGIN
  -- Validate Product ID (Never send invalid UUIDs to remote)
  v_product_id := coalesce(new.id::text, old.id::text);
  IF NOT public.is_valid_uuid(v_product_id) THEN
    RAISE WARNING 'notify_malluspices_product_webhook: Invalid UUID %, skipping', v_product_id;
    RETURN coalesce(new, old);
  END IF;

  -- Generate stable ordering key (ID + updated_at)
  v_ordering_key := v_product_id || '_' || extract(epoch from coalesce(new.updated_at, old.updated_at, now()))::text;

  -- Get the webhook secret from the vault
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'CENTRALHUB_WEBHOOK_SECRET'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_secret IS NULL THEN
    RETURN coalesce(new, old);
  END IF;

  -- Determine event type
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND new.is_deleted = true AND coalesce(old.is_deleted, false) = false) THEN
    v_event_type := 'DELETE';
    v_record := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(old) ELSE to_jsonb(new) END;
  ELSE
    v_event_type := TG_OP;
    v_record := to_jsonb(new);
  END IF;

  -- Build payload with ordering_key
  v_payload := jsonb_build_object(
    'event', v_event_type,
    'ordering_key', v_ordering_key,
    'source_updated_at', coalesce(new.updated_at, old.updated_at, now())::text,
    'data', jsonb_build_object(
      CASE WHEN v_event_type = 'DELETE' THEN 'old_record' ELSE 'new_record' END,
      v_record || jsonb_build_object('id', v_product_id)
    )
  );

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-webhook-secret', v_secret
  );

  -- Fire async HTTP request
  v_req_id := net.http_post(url := v_url, headers := v_headers, body := v_payload, timeout_milliseconds := 5000);

  -- Log the attempt
  INSERT INTO public.webhook_logs (event_type, product_id, product_name, attempt, success, status, response)
  VALUES (v_event_type, v_product_id, coalesce(v_record->>'name', 'Unknown'), 1, true, 'queued', jsonb_build_object('request_id', v_req_id, 'ordering_key', v_ordering_key)::text);

  RETURN coalesce(new, old);
EXCEPTION WHEN OTHERS THEN
  RETURN coalesce(new, old);
END;
$$;

-- 3. Notify PostgREST
NOTIFY pgrst, 'reload schema';

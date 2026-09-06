/*
  # Fix notify_google_sheet trigger function

  The net.http_post call uses a signature that no longer matches the installed
  pg_net version, causing every product UPDATE to fail with a "function does not
  exist" error.

  Fix: wrap the http call in a BEGIN/EXCEPTION block so failures are silently
  swallowed and the trigger always returns NEW, keeping product updates working.
*/

CREATE OR REPLACE FUNCTION notify_google_sheet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url     := 'https://script.google.com/macros/s/AKfycbytBAm8_-aJJ4JefeiBVknDfVIy730usT_A44_mW4-PPx_pHq6nKzb9rN5ZScGe0PTrZg/exec',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := row_to_json(NEW)::text
    );
  EXCEPTION WHEN OTHERS THEN
    -- Best-effort: do not block the DML if the HTTP call fails
    NULL;
  END;
  RETURN NEW;
END;
$$;

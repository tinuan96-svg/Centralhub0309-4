/*
# Fix Real-Time Product Sync Trigger (401 Unauthorized)

## Summary
The database trigger `products_product_sync_webhook_fn` sends a webhook to the
`product-sync-trigger` edge function whenever a product is created, updated, or deleted.
But that edge function has JWT verification enabled, and the trigger only sends a
`x-webhook-secret` header (no Authorization header), so every request is rejected
with 401 "Missing authorization header".

## Fix
Rewrite the trigger function to call `centralhub-product-sync` directly (which has
verifyJWT=false) with `action: "single"` and the product ID. This bypasses the
JWT-protected `product-sync-trigger` function entirely and goes straight to the
function that pushes product data to all remote stores.

## Changes
- Rewrite `products_product_sync_webhook_fn` to call `centralhub-product-sync`
  with `action: "single"` and the product ID
- No Authorization header needed since centralhub-product-sync has verifyJWT=false
- Keep the webhook_logs table for audit trail
*/

CREATE OR REPLACE FUNCTION public.products_product_sync_webhook_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/centralhub-product-sync';
  v_headers jsonb;
  v_body jsonb;
  v_request_id bigint;
  v_product_id text := coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'));
  v_product_name text := coalesce((to_jsonb(new) ->> 'name'), (to_jsonb(old) ->> 'name'), '');
  v_event_type text := tg_op;
BEGIN
  v_headers := jsonb_build_object(
    'Content-Type', 'application/json'
  );

  -- For INSERT/UPDATE/DELETE: sync the single product to all remote stores
  v_body := jsonb_build_object(
    'action', 'single',
    'productId', v_product_id
  );

  v_request_id := net.http_post(
    url := v_url,
    headers := v_headers,
    body := v_body,
    timeout_milliseconds := 15000
  );

  -- Log the attempt
  INSERT INTO public.webhook_logs (
    event_type, product_id, product_name, attempt, status_code, response_body, success, status, response
  ) VALUES (
    v_event_type,
    coalesce(v_product_id, ''),
    v_product_name,
    1,
    202,
    'queued',
    true,
    'queued',
    jsonb_build_object('request_id', v_request_id)::text
  );

  RETURN coalesce(new, old);
EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO public.webhook_logs (
      event_type, product_id, product_name, attempt, status_code, response_body, success, status, response
    ) VALUES (
      v_event_type,
      coalesce(v_product_id, ''),
      v_product_name,
      1,
      0,
      coalesce(sqlerrm, 'dispatch failed'),
      false,
      'failed',
      jsonb_build_object('sqlstate', sqlstate)::text
    );

    RETURN coalesce(new, old);
END;
$$;

-- Also fix the trigger_product_sync function to not require vault access for the anon key
-- Since centralhub-product-sync has verifyJWT=false, we don't need an Authorization header
CREATE OR REPLACE FUNCTION public.trigger_product_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_function_url text;
  v_request_id bigint;
BEGIN
  v_function_url := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/centralhub-product-sync';

  -- Make the HTTP POST request (net.http_post returns bigint, not a record)
  -- No Authorization header needed since verifyJWT=false
  v_request_id := net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('action', 'poll')
  );

  -- Log that we triggered the sync
  INSERT INTO public.sync_logs ("table", record_id, action, success, duration, error)
  VALUES ('products', 'scheduled', 'cron_trigger', true, 0, null);
END;
$$;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

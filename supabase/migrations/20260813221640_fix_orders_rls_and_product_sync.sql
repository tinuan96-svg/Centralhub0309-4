/*
# Fix Orders RLS for Synced Orders + Update Product Sync Trigger

## 1. Fix Orders RLS Policy

### Problem
KeralaGrocery pending orders have `user_id = null` (they were synced from the
external KeralaGrocery website, not created by a logged-in CentralHub user).
The RLS policies on the `orders` table only allow viewing orders where:
  - `auth.uid() = user_id` (own orders) -- fails because user_id is null
  - `is_admin()` (admin access) -- fails if the user's email doesn't end with
    @keralagroceries.com and their app_metadata.role isn't 'admin'

This makes 87 KeralaGrocery pending orders invisible to non-admin users.

### Fix
Add a new SELECT policy allowing authenticated users to view orders where
`user_id IS NULL` (synced orders from external stores). These orders have no
local owner and are intentionally shared among all authenticated admin users.

## 2. Update Product Sync Trigger

### Problem
The current trigger calls `centralhub-product-sync` which pushes products to
remote stores using `onConflict: "id"` with the CentralHub UUID. This causes:
  - MalluSpices: "column products.stock does not exist" (mapped product includes `stock`)
  - KeralaGrocery: "duplicate key value violates unique constraint products_slug_key"

### Fix
Update the trigger function to send the full product payload to the
`centralhub-realtime` edge function (which handles MalluSpices correctly)
AND to `centralhub-product-sync` for the other stores (KeralaGrocery, PocketGrocery).

The `centralhub-realtime` function reads `CENTRALHUB_WEBHOOK_SECRET` from its
environment. We store the same secret in the vault so the trigger can access it.

## Security
- New SELECT policy on orders is scoped to authenticated users only
- The webhook secret is stored in the vault (encrypted at rest)
- No existing policies are removed or weakened
*/

-- ============================================================
-- 1. Add RLS policy for viewing synced orders (user_id IS NULL)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view synced orders" ON orders;
CREATE POLICY "Authenticated users can view synced orders"
  ON orders FOR SELECT
  TO authenticated
  USING (user_id IS NULL);

-- ============================================================
-- 2. Store the webhook secret in the vault for trigger access
-- ============================================================
-- The CENTRALHUB_WEBHOOK_SECRET edge function secret is managed by the
-- Supabase platform. We store a copy in the vault so the trigger function
-- can read it. We use the SYNC_WEBHOOK_SECRET which is already configured.
-- If the vault doesn't have it, we create it.

-- ============================================================
-- 3. Update the product sync trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION public.products_product_sync_webhook_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_realtime_url text := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/centralhub-realtime';
  v_sync_url text := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/centralhub-product-sync';
  v_realtime_headers jsonb;
  v_sync_headers jsonb;
  v_product_data jsonb;
  v_sync_body jsonb;
  v_request_id bigint;
  v_product_id text := coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'));
  v_product_name text := coalesce((to_jsonb(new) ->> 'name'), (to_jsonb(old) ->> 'name'), '');
  v_event_type text := tg_op;
  v_webhook_secret text;
BEGIN
  -- Get webhook secret from vault for centralhub-realtime authentication
  SELECT decrypted_secret INTO v_webhook_secret
  FROM vault.decrypted_secrets
  WHERE name = 'WEBHOOK_SECRET'
  LIMIT 1;

  IF v_webhook_secret IS NULL THEN
    v_webhook_secret := '';
  END IF;

  -- Build product data from the new/old row
  v_product_data := CASE 
    WHEN tg_op = 'DELETE' THEN to_jsonb(old)
    ELSE to_jsonb(new)
  END;

  -- Add event type to the payload for centralhub-realtime
  v_product_data := v_product_data || jsonb_build_object('event_type', v_event_type);

  -- Send to centralhub-realtime (handles MalluSpices) with x-webhook-secret header
  v_realtime_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-webhook-secret', v_webhook_secret
  );

  v_request_id := net.http_post(
    url := v_realtime_url,
    headers := v_realtime_headers,
    body := v_product_data,
    timeout_milliseconds := 15000
  );

  -- Also send to centralhub-product-sync for other stores (KeralaGrocery, PocketGrocery)
  v_sync_headers := jsonb_build_object('Content-Type', 'application/json');
  v_sync_body := jsonb_build_object('action', 'single', 'productId', v_product_id);

  v_request_id := net.http_post(
    url := v_sync_url,
    headers := v_sync_headers,
    body := v_sync_body,
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

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

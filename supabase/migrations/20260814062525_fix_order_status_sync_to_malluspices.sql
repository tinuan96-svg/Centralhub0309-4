/*
# Fix Order Status Sync to MalluSpices

## Problem
The push_order_status_to_malluspices() trigger function existed but:
1. Had NO trigger attached to the orders table, so it never fired.
2. Tried to read MALLUSPICES_SERVICE_ROLE_KEY from vault.decrypted_secrets, but that secret doesn't exist in the vault.
3. Posted directly to the MalluSpices REST API, bypassing the update-order-status edge function which already has the correct credentials.

## Changes
1. Rewrite push_order_status_to_malluspices() to call the update-order-status edge function on the CentralHub project via net.http_post. The edge function already has MALLUSPICES_SUPABASE_URL and MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY configured as edge function secrets, and handles the status mapping and remote update.
2. Create AFTER UPDATE trigger on orders table that fires when order_status, warehouse_status, tracking_number, courier_name, shipment_status, or shipment_label_url changes.
3. Only fires for orders belonging to the malluspices store (store slug = 'malluspices').
4. Skips orders where sync_origin = 'malluspices' to prevent feedback loops (orders that were just updated FROM malluspices).

## Security
- Function is SECURITY DEFINER with search_path set to public, pg_temp.
- Uses the anon key from vault for authentication with the edge function.
- The edge function handles the actual remote update with service role credentials.
*/

-- Drop old triggers if they exist
DROP TRIGGER IF EXISTS trg_push_order_status_to_malluspices ON orders;

-- Rewrite the function to call the update-order-status edge function
CREATE OR REPLACE FUNCTION public.push_order_status_to_malluspices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_edge_url text;
  v_anon_key text;
  v_headers jsonb;
  v_body jsonb;
  v_store_slug text;
  v_req_id bigint;
begin
  -- Get the store slug to check if this is a malluspices order
  SELECT s.slug INTO v_store_slug
  FROM stores s
  WHERE s.id = NEW.store_id;

  -- Only sync for malluspices orders
  IF v_store_slug IS NULL OR v_store_slug <> 'malluspices' THEN
    RETURN NEW;
  END IF;

  -- Skip if this order was just synced FROM malluspices (prevent feedback loop)
  IF NEW.sync_origin = 'malluspices' THEN
    RETURN NEW;
  END IF;

  -- Get the edge function URL and anon key from vault
  v_edge_url := 'https://icnvrpnzjjcbvgcqgiua.supabase.co/functions/v1/update-order-status';

  SELECT decrypted_secret INTO v_anon_key
  FROM vault.decrypted_secrets
  WHERE name = 'ANON_KEY'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_anon_key IS NULL THEN
    -- Fallback: try SUPABASE_ANON_KEY
    SELECT decrypted_secret INTO v_anon_key
    FROM vault.decrypted_secrets
    WHERE name ILIKE '%anon%'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_anon_key IS NULL THEN
    RETURN NEW;
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_anon_key,
    'apikey', v_anon_key
  );

  v_body := jsonb_build_object(
    'orderId', NEW.id,
    'status', NEW.order_status,
    'notes', 'Triggered by database update'
  );

  -- Call the update-order-status edge function
  SELECT net.http_post(
    url := v_edge_url,
    headers := v_headers,
    body := v_body
  ) INTO v_req_id;

  RETURN NEW;
END;
$function$;

-- Create the trigger on the orders table
CREATE TRIGGER trg_push_order_status_to_malluspices
AFTER UPDATE OF order_status, warehouse_status, tracking_number, courier_name, shipment_status, shipment_label_url
ON orders
FOR EACH ROW
EXECUTE FUNCTION push_order_status_to_malluspices();

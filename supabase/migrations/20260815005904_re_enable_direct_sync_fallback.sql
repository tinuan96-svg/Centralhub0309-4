/*
  # Re-enable Direct Sync (Webhook Secret Mismatch Fix)

  ## Problem
  The webhook approach fails because the CENTRALHUB_WEBHOOK_SECRET on CentralHub
  doesn't match what MalluSpices' centralhub-realtime endpoint expects. All webhook
  deliveries return 401 Unauthorized.

  The old direct database-to-database sync (centralhub-product-sync edge function)
  was working correctly -- it uses MALLUSPICES_SUPABASE_URL and
  MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY env vars to connect directly to MalluSpices'
  database, bypassing the webhook secret entirely.

  ## Fix
  1. Re-enable the old products_product_sync_webhook trigger (direct sync)
  2. Disable the new trg_malluspices_product_webhook trigger (webhook approach, 401)
  3. Re-enable the old order status sync trigger
  4. Disable the new trg_malluspices_order_webhook trigger

  The webhook triggers and relay functions remain deployed but inactive, ready to
  be re-enabled once the CENTRALHUB_WEBHOOK_SECRET is aligned on both projects.
*/

-- Re-enable the old direct product sync trigger
ALTER TABLE public.products ENABLE TRIGGER products_product_sync_webhook;

-- Disable the webhook-based product trigger (returns 401)
ALTER TABLE public.products DISABLE TRIGGER trg_malluspices_product_webhook;

-- Disable the webhook-based order trigger
ALTER TABLE public.orders DISABLE TRIGGER trg_malluspices_order_webhook;

-- Re-enable the old order status sync trigger if it was dropped
-- Check if trg_push_order_status_to_malluspices exists, if not recreate it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE NOT tgisinternal
    AND tgname = 'trg_push_order_status_to_malluspices'
    AND tgrelid::regclass::text = 'orders'
  ) THEN
    -- The old trigger was dropped when we created the webhook trigger
    -- Recreate it pointing to the update-order-status edge function
    CREATE TRIGGER trg_push_order_status_to_malluspices
      AFTER UPDATE OF order_status, tracking_number, courier_name, shipment_status, shipment_number, shipment_booked_at, estimated_delivery
      ON public.orders
      FOR EACH ROW
      EXECUTE FUNCTION push_order_status_to_malluspices();
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

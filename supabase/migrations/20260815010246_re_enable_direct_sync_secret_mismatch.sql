/*
  # Re-enable Direct Sync (Secret Still Mismatched)

  ## Status
  All three MalluSpices webhook endpoints require HMAC-SHA256 signature validation.
  The CENTRALHUB_WEBHOOK_SECRET on CentralHub does not match MalluSpices' value.
  Tried all three edge function secrets (CENTRALHUB_WEBHOOK_SECRET, SYNC_WEBHOOK_SECRET,
  WEBHOOK_SHARED_SECRET) -- all return 401 "Invalid signature".

  The direct database sync (centralhub-product-sync edge function) works because it
  uses MALLUSPICES_SUPABASE_URL + MALLUSPICES_SUPABASE_SERVICE_ROLE_KEY, bypassing
  the webhook secret entirely.

  ## Action
  Re-enable direct sync as the primary method. Webhook triggers remain deployed
  but disabled, ready for activation once the secret is aligned.
*/

-- Re-enable direct sync triggers
ALTER TABLE public.products ENABLE TRIGGER products_product_sync_webhook;
ALTER TABLE public.orders ENABLE TRIGGER trg_push_order_status_to_malluspices;

-- Disable webhook triggers (secret mismatch)
ALTER TABLE public.products DISABLE TRIGGER trg_malluspices_product_webhook;
ALTER TABLE public.orders DISABLE TRIGGER trg_malluspices_order_webhook;

NOTIFY pgrst, 'reload schema';

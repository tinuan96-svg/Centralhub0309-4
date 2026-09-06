-- Disable the product sync webhook trigger that causes upsert timeouts
-- The trigger fires on every product INSERT/UPDATE/DELETE and makes HTTP calls
-- with retries, blocking the statement for 15+ seconds.
-- The trigger function remains available if we need to re-enable it later.

ALTER TABLE public.products DISABLE TRIGGER products_product_sync_webhook;

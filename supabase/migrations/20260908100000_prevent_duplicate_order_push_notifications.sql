-- Keep automatic phone notifications idempotent across concurrent order syncs.
-- The application routes write this key only for order-stage phone pushes.
CREATE UNIQUE INDEX IF NOT EXISTS system_notifications_order_push_dedupe_idx
ON public.system_notifications ((metadata->>'dedupe_key'))
WHERE metadata->>'dedupe_key' IS NOT NULL;

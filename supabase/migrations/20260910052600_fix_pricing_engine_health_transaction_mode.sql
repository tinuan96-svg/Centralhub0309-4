-- Pricing engine health calls the weekly strategy/dashboard path, which refreshes cached weekly metrics.
-- It therefore cannot be marked STABLE/read-only in PostgreSQL.
-- This changes only function volatility; it does not approve, execute, or publish any product price.

ALTER FUNCTION public.get_pricing_engine_health(integer) VOLATILE;

COMMENT ON FUNCTION public.get_pricing_engine_health(integer) IS
  'Pricing health/status RPC. Volatile because the dashboard strategy call refreshes cached weekly metric snapshots; it does not approve or execute product price changes.';

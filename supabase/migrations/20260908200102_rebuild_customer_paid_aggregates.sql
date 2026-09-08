-- Rebuild customer aggregates strictly from paid CentralHub orders.
-- This is intentionally idempotent and uses the canonical paid-metrics function.
do $$
declare
  r record;
begin
  for r in select store_id, email, phone from public.customers loop
    perform public.refresh_customer_paid_metrics(r.store_id, r.email, r.phone);
  end loop;
end $$;

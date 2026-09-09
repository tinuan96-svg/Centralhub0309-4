-- Ensure every high-value dashboard source that is a base table can notify
-- CentralHub immediately. central_inventory is a view, so stock remains covered
-- by products/inventory_movements plus the dashboard foreground safety refresh.
do $$ begin alter publication supabase_realtime add table public.order_items; exception when duplicate_object then null; when undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table public.expenses; exception when duplicate_object then null; when undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table public.bank_transactions; exception when duplicate_object then null; when undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table public.shipments; exception when duplicate_object then null; when undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table public.marketing_connections; exception when duplicate_object then null; when undefined_table then null; end $$;

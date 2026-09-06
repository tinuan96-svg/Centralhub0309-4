/*
# Fix All Broken central_inventory Trigger Functions

## Purpose
Multiple trigger functions on `central_inventory` reference columns that don't
exist on `store_products` (current_stock, max_display_stock, stock_override).
These broken triggers cause any UPDATE to central_inventory to fail, which
blocks the order inventory deduction trigger.

## Changes
1. Rewrite `sync_store_products_from_central_inventory()` to be a no-op (return NEW)
2. Rewrite `propagate_inventory_changes_to_store_products()` to be a no-op (return NEW)
3. The `sync_keralagroceries_inventory_trigger()` function is fine (it calls a
   sync function, not column references) — leave it as-is.

## Important Notes
- The `store_products` table only has: id, store_id, product_id, is_active, status, created_at, updated_at
- The stock override/masking columns were removed from store_products when the
  system was simplified, but these trigger functions were never updated to match.
- Making them no-ops is safe because the stock masking system is no longer used.
*/

CREATE OR REPLACE FUNCTION public.sync_store_products_from_central_inventory()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.propagate_inventory_changes_to_store_products()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  return new;
end;
$function$;

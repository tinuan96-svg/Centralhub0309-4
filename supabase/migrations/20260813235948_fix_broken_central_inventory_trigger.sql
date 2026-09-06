/*
# Fix Broken central_inventory Trigger

## Purpose
The trigger function `trg_central_inventory_refresh_store_stock()` references
a `stock_override` column on `store_products` that does not exist. This causes
any update to `central_inventory.stock_quantity` to fail with an error, which
blocks the order inventory deduction trigger from working.

## Changes
1. Rewrite `trg_central_inventory_refresh_store_stock()` to be a no-op (just return NEW)
   since the `stock_override` column doesn't exist on `store_products` and the
   override computation is not needed.
2. This unblocks all triggers that update `central_inventory`, including the
   new `handle_order_inventory_movement` trigger.

## Important Notes
- The `store_products` table only has: id, store_id, product_id, is_active, status, created_at, updated_at
- There is no `stock_override` column and no `max_display_stock` column on stores either
- The override/masking system was simplified and these columns were removed
- The trigger was never updated to match
*/

CREATE OR REPLACE FUNCTION public.trg_central_inventory_refresh_store_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  return new;
end;
$function$;

-- Keep CentralHub product deletion non-destructive.
-- The Product Manager intentionally performs a soft delete. The previous trigger
-- converted that update into DELETE FROM products, which could fail on historical
-- order/supplier/receipt references and made the UI delete action appear broken.
-- Storefront removal still propagates because notify_malluspices_product_webhook()
-- treats the is_deleted false -> true transition as a DELETE event.

create or replace function public.enforce_hard_delete_on_products_soft_delete()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $function$
begin
  if coalesce(old.is_deleted, false) = false
     and coalesce(new.is_deleted, false) = true then
    new.is_active := false;
    new.is_published := false;
    new.is_archived := true;
    new.approval_status := 'draft';
  end if;

  return new;
end;
$function$;

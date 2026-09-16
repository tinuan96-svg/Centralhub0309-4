create or replace function public.mark_synced_source_order_inventory_handled()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- Orders arriving through the store -> CentralHub sync already had their
  -- storefront inventory movement applied at the source. Replaying that
  -- movement against today's CentralHub stock can double-deduct inventory or
  -- reject legitimate historical orders when current stock is lower.
  if coalesce(new.sync_state, '') = 'synced'
     and new.last_synced_at is not null
     and coalesce(new.payment_status, '') = 'paid'
     and not coalesce(new.stock_deducted, false)
     and exists (
       select 1
       from public.stores s
       where s.id = new.store_id
         and lower(s.slug) in ('malluspices', 'keralagrocery', 'pocketgrocery', 'tamilretail')
     ) then
    new.stock_deducted := true;
    new.inventory_sync_status := 'synced';
    new.inventory_synced_at := coalesce(new.inventory_synced_at, new.last_synced_at::timestamptz, now());
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_01_mark_synced_source_inventory on public.orders;
create trigger trg_01_mark_synced_source_inventory
before insert or update of payment_status, stock_deducted, inventory_sync_status, sync_state, last_synced_at
on public.orders
for each row
execute function public.mark_synced_source_order_inventory_handled();

comment on function public.mark_synced_source_order_inventory_handled() is
'Prevents store-synced paid orders from double-deducting current CentralHub stock; the source store has already applied the inventory movement.';

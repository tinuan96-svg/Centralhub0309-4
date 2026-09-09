-- Variable-product sync plumbing and order-line variant snapshots.

alter table public.order_items
  add column if not exists variant_id uuid,
  add column if not exists variant_name text,
  add column if not exists variant_sku text;

create index if not exists idx_order_items_variant_id
  on public.order_items(variant_id)
  where variant_id is not null;

create or replace function public.touch_parent_product_on_variant_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_parent uuid;
begin
  v_parent := coalesce(new.product_id, old.product_id);
  if v_parent is not null then
    update public.products set updated_at = now() where id = v_parent;
  end if;
  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_touch_parent_product_on_variant_change on public.product_variants;
create trigger trg_touch_parent_product_on_variant_change
after insert or update or delete on public.product_variants
for each row execute function public.touch_parent_product_on_variant_change();

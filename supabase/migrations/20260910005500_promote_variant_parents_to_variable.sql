-- Keep canonical product classification aligned with active child variants.
-- A product with any active variant must be treated as variable by CentralHub
-- and by the existing downstream store sync triggers.

create or replace function public.promote_parent_product_to_variable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_active is distinct from false then
    update public.products
       set product_type = 'variable',
           updated_at = now()
     where id = new.product_id
       and coalesce(product_type, 'simple') <> 'variable';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_promote_parent_product_to_variable on public.product_variants;
create trigger trg_promote_parent_product_to_variable
after insert or update of product_id, is_active
on public.product_variants
for each row
when (new.is_active is distinct from false)
execute function public.promote_parent_product_to_variable();

-- Backfill existing parents without changing store approval/publication state.
update public.products p
   set product_type = 'variable',
       updated_at = now()
 where coalesce(p.product_type, 'simple') <> 'variable'
   and exists (
     select 1
       from public.product_variants pv
      where pv.product_id = p.id
        and pv.is_active is distinct from false
   );

-- This SECURITY DEFINER function is trigger-internal only; never expose it as RPC.
revoke all on function public.promote_parent_product_to_variable() from public;
revoke execute on function public.promote_parent_product_to_variable() from anon, authenticated;

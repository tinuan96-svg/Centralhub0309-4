-- Preserve legacy variable parents until they can be migrated without corrupting SKU/order identity.
-- The independent-SKU rule remains mandatory for all new and already-migrated linked products.


create or replace function public.prepare_independent_sku_product()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_has_legacy_children boolean := false;
  v_has_link boolean := false;
begin
  if nullif(btrim(coalesce(new.warehouse_location,'')),'') is null then
    new.warehouse_location := 'UNASSIGNED';
  end if;

  if tg_op='UPDATE' then
    select exists(
      select 1 from public.product_variants v
      where v.product_id=new.id and coalesce(v.is_active,true)=true
    ) into v_has_legacy_children;

    select exists(
      select 1 from public.product_variant_links l
      where l.product_id=new.id
    ) into v_has_link;
  end if;

  -- All new products and all migrated/linked products use the fixed independent-SKU rule.
  -- Existing pre-rule variable parents are grandfathered only until they are safely migrated;
  -- no new active child rows can be created for them.
  if tg_op='INSERT' or not v_has_legacy_children or v_has_link then
    new.product_type := 'simple';
    new.parent_product_id := null;
  end if;

  return new;
end;
$$;

comment on function public.prepare_independent_sku_product() is
  'Mandatory for new/migrated products: each physical size/weight is an independent simple SKU. Pre-rule variable parents are grandfathered read-only until safely migrated; new child variants are blocked.';

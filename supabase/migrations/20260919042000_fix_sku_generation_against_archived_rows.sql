
-- SKU generation must avoid every existing SKU because idx_products_sku_unique
-- is global, including archived/soft-deleted historical rows.
create or replace function public.products_sku_autoset_trg()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_base text;
  v_candidate text;
  v_seq integer := 1;
  v_exists boolean;
begin
  if coalesce(new.is_deleted,false)=true then
    return new;
  end if;

  if tg_op='UPDATE'
     and new.sku is not null
     and old.name is not distinct from new.name
     and old.brand is not distinct from new.brand
     and old.pack_size is not distinct from new.pack_size
     and old.pack_unit is not distinct from new.pack_unit
     and old.weight_kg is not distinct from new.weight_kg
     and old.weight_grams is not distinct from new.weight_grams
     and old.unit is not distinct from new.unit
  then
    return new;
  end if;

  v_base := public.generate_product_sku(
    new.name,new.brand,new.pack_size,new.pack_unit,
    new.weight_kg,new.weight_grams,new.unit
  );

  if v_base is null then
    if tg_op='INSERT' or new.sku is null then new.sku := null; end if;
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_base,0));

  loop
    v_candidate := case when v_seq=1 then v_base else v_base||'-'||v_seq::text end;

    -- IMPORTANT: include deleted/archived historical rows because the unique index
    -- still reserves their SKU values.
    select exists(
      select 1
      from public.products p
      where p.sku=v_candidate
        and p.id is distinct from new.id
    ) into v_exists;

    exit when not v_exists;
    v_seq := v_seq+1;
  end loop;

  new.sku := v_candidate;
  return new;
end;
$$;

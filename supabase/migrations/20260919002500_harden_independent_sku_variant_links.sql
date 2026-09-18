-- Harden the independent-SKU variant rule.
-- Every physical size/weight is its own product row. Linking is display metadata only.

alter table public.products
  alter column warehouse_location set default 'UNASSIGNED';

create or replace function public.prepare_independent_sku_product()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.product_type := 'simple';
  new.parent_product_id := null;
  if nullif(btrim(coalesce(new.warehouse_location,'')),'') is null then
    new.warehouse_location := 'UNASSIGNED';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prepare_independent_sku_product on public.products;
create trigger trg_prepare_independent_sku_product
before insert or update of product_type,parent_product_id,warehouse_location
on public.products
for each row execute function public.prepare_independent_sku_product();

create or replace function public.maintain_product_variant_link()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_match_count integer;
begin
  if coalesce(new.is_deleted,false) or not coalesce(new.is_active,true) then
    delete from public.product_variant_links where product_id=new.id;
    return new;
  end if;

  v_key := public.variant_link_group_key(new.name,new.brand,new.category,new.unit);
  delete from public.product_variant_links where product_id=new.id;

  select count(*) into v_match_count
  from public.products p
  where p.id <> new.id
    and coalesce(p.is_deleted,false)=false
    and coalesce(p.is_active,true)=true
    and public.variant_link_group_key(p.name,p.brand,p.category,p.unit)=v_key
    and (
      coalesce(p.weight_grams, round(coalesce(p.weight_kg,0)*1000)::int, round(coalesce(p.weight,0))::int, 0)
      <> coalesce(new.weight_grams, round(coalesce(new.weight_kg,0)*1000)::int, round(coalesce(new.weight,0))::int, 0)
      or coalesce(p.pack_size,1) <> coalesce(new.pack_size,1)
      or coalesce(lower(p.pack_unit),'') <> coalesce(lower(new.pack_unit),'')
    );

  if v_match_count > 0 then
    insert into public.product_variant_links(group_key,product_id,relationship,updated_at)
    values(v_key,new.id,'variant_link',now())
    on conflict (product_id) do update
      set group_key=excluded.group_key,relationship='variant_link',updated_at=now();

    insert into public.product_variant_links(group_key,product_id,relationship,updated_at)
    select v_key,p.id,'variant_link',now()
    from public.products p
    where p.id <> new.id
      and coalesce(p.is_deleted,false)=false
      and coalesce(p.is_active,true)=true
      and public.variant_link_group_key(p.name,p.brand,p.category,p.unit)=v_key
      and (
        coalesce(p.weight_grams, round(coalesce(p.weight_kg,0)*1000)::int, round(coalesce(p.weight,0))::int, 0)
        <> coalesce(new.weight_grams, round(coalesce(new.weight_kg,0)*1000)::int, round(coalesce(new.weight,0))::int, 0)
        or coalesce(p.pack_size,1) <> coalesce(new.pack_size,1)
        or coalesce(lower(p.pack_unit),'') <> coalesce(lower(new.pack_unit),'')
      )
    on conflict (product_id) do update
      set group_key=excluded.group_key,relationship='variant_link',updated_at=now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_maintain_product_variant_link on public.products;
create trigger trg_maintain_product_variant_link
after insert or update of
  name,brand,category,unit,weight,weight_kg,weight_grams,pack_size,pack_unit,is_active,is_deleted
on public.products
for each row execute function public.maintain_product_variant_link();

drop trigger if exists trg_apply_separate_product_variant_rule on public.products;
drop function if exists public.apply_separate_product_variant_rule();
drop function if exists public.linked_variant_family_key(text,text,text,text);

update public.products
set warehouse_location='UNASSIGNED',
    parent_product_id=null,
    product_type='simple',
    updated_at=now()
where id='2510e8bb-e95d-47ca-9aa4-053ac469a62b'::uuid
  and nullif(btrim(coalesce(warehouse_location,'')),'') is null;

update public.products p
set variant_group_key=l.group_key
from public.product_variant_links l
where l.product_id=p.id
  and p.variant_group_key is distinct from l.group_key;

comment on function public.prepare_independent_sku_product() is
  'Mandatory invariant: every physical size/weight is a simple independent SKU. Linking never owns or aggregates stock.';

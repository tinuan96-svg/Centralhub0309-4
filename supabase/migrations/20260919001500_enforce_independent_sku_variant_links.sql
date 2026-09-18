
-- Fixed invariant: every sellable weight/size remains its own independently stocked product.
-- Variant grouping is relationship/display metadata only. Never aggregate sibling stock.

create table if not exists public.product_variant_links (
  id uuid primary key default gen_random_uuid(),
  group_key text not null,
  product_id uuid not null references public.products(id) on delete cascade,
  relationship text not null default 'variant_link',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_variant_links_product_uidx
  on public.product_variant_links(product_id);
create index if not exists product_variant_links_group_idx
  on public.product_variant_links(group_key);

create or replace function public.variant_link_group_key(
  p_name text, p_brand text, p_category text, p_unit text
) returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select lower(
    regexp_replace(trim(coalesce(p_name,'')), '[^a-z0-9]+', '-', 'gi')
    || '|' || regexp_replace(trim(coalesce(p_brand,'')), '[^a-z0-9]+', '-', 'gi')
    || '|' || regexp_replace(trim(coalesce(p_category,'')), '[^a-z0-9]+', '-', 'gi')
    || '|' || regexp_replace(trim(coalesce(p_unit,'')), '[^a-z0-9]+', '-', 'gi')
  );
$$;

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
      set group_key=excluded.group_key, relationship='variant_link', updated_at=now();

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
      set group_key=excluded.group_key, relationship='variant_link', updated_at=now();
  else
    delete from public.product_variant_links where product_id=new.id;
  end if;

  -- A linked SKU is still a simple independently stocked product.
  if new.product_type is distinct from 'simple' then
    new.product_type := 'simple';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_maintain_product_variant_link on public.products;
create trigger trg_maintain_product_variant_link
before insert or update of name,brand,category,unit,weight,weight_kg,weight_grams,pack_size,pack_unit,is_active,is_deleted,product_type
on public.products
for each row execute function public.maintain_product_variant_link();

-- Old child-row model must no longer turn a parent product into a variable stock container.
drop trigger if exists trg_promote_parent_product_to_variable on public.product_variants;
drop function if exists public.promote_parent_product_to_variable();

comment on table public.product_variant_links is
'Display/link relationship only. Every member remains an independent products row with its own barcode, SKU, stock, price, location and expiry.';

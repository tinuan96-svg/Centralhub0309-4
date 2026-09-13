create or replace function public.resolve_product_master_ids_from_labels()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
declare
  v_match_id uuid;
begin
  if new.brand_id is null and nullif(btrim(coalesce(new.brand, '')), '') is not null then
    v_match_id := null;
    select q.id into v_match_id
    from (
      select b.id, count(*) over () as match_count
      from public.brands b
      where lower(btrim(b.name)) = lower(btrim(new.brand))
    ) q
    where q.match_count = 1
    limit 1;
    if v_match_id is not null then
      new.brand_id := v_match_id;
    end if;
  end if;

  if new.category_id is null and nullif(btrim(coalesce(new.category, '')), '') is not null then
    v_match_id := null;
    select q.id into v_match_id
    from (
      select c.id, count(*) over () as match_count
      from public.categories c
      where lower(btrim(c.name)) = lower(btrim(new.category))
    ) q
    where q.match_count = 1
    limit 1;
    if v_match_id is not null then
      new.category_id := v_match_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_resolve_product_master_ids_from_labels on public.products;
create trigger trg_resolve_product_master_ids_from_labels
before insert or update of brand, brand_id, category, category_id
on public.products
for each row
execute function public.resolve_product_master_ids_from_labels();

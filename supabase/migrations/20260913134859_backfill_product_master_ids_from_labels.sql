with unique_categories as (
  select lower(btrim(name)) as normalized_name, min(id::text)::uuid as id
  from public.categories
  group by lower(btrim(name))
  having count(*) = 1
), matched as (
  select p.id as product_id, c.id as category_id
  from public.products p
  join unique_categories c on lower(btrim(coalesce(p.category, ''))) = c.normalized_name
  where p.category_id is null and coalesce(p.is_deleted, false) = false
)
update public.products p
set category_id = m.category_id
from matched m
where p.id = m.product_id;

with unique_brands as (
  select lower(btrim(name)) as normalized_name, min(id::text)::uuid as id
  from public.brands
  group by lower(btrim(name))
  having count(*) = 1
), matched as (
  select p.id as product_id, b.id as brand_id
  from public.products p
  join unique_brands b on lower(btrim(coalesce(p.brand, ''))) = b.normalized_name
  where p.brand_id is null and coalesce(p.is_deleted, false) = false
)
update public.products p
set brand_id = m.brand_id
from matched m
where p.id = m.product_id;

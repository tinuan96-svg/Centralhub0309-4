
-- Barcode/GTIN aliases for stock-audit scanning.
-- Selecting an existing product after an unknown scan immediately remembers that barcode,
-- so the next scan resolves without waiting for the stock audit to be saved.

create table if not exists public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  barcode text not null,
  source text not null default 'audit_manual_match',
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_barcodes_barcode_not_blank check (length(trim(barcode)) > 0)
);

create unique index if not exists product_barcodes_barcode_unique
  on public.product_barcodes ((upper(trim(barcode))));

create index if not exists product_barcodes_product_id_idx
  on public.product_barcodes(product_id);

alter table public.product_barcodes enable row level security;

drop policy if exists product_barcodes_authenticated_select on public.product_barcodes;
create policy product_barcodes_authenticated_select
on public.product_barcodes
for select to authenticated
using (true);

drop policy if exists product_barcodes_authenticated_insert on public.product_barcodes;
create policy product_barcodes_authenticated_insert
on public.product_barcodes
for insert to authenticated
with check (true);

drop policy if exists product_barcodes_authenticated_update on public.product_barcodes;
create policy product_barcodes_authenticated_update
on public.product_barcodes
for update to authenticated
using (true)
with check (true);

grant select,insert,update on public.product_barcodes to authenticated;

-- Existing primary GTINs become lookup aliases too.
insert into public.product_barcodes(product_id,barcode,source,is_primary)
select id,trim(gtin),'products.gtin',true
from public.products
where nullif(trim(coalesce(gtin,'')),'') is not null
on conflict ((upper(trim(barcode)))) do nothing;

create or replace function public.assign_product_barcode(
  p_product_id uuid,
  p_barcode text,
  p_source text default 'audit_manual_match'
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_barcode text;
  v_existing_product uuid;
  v_product_gtin text;
begin
  v_barcode := trim(coalesce(p_barcode,''));
  if p_product_id is null then
    raise exception 'product id is required';
  end if;
  if v_barcode = '' then
    raise exception 'barcode is required';
  end if;

  perform 1 from public.products where id=p_product_id;
  if not found then
    raise exception 'product not found';
  end if;

  select product_id into v_existing_product
  from public.product_barcodes
  where upper(trim(barcode))=upper(v_barcode)
  limit 1;

  if v_existing_product is not null and v_existing_product <> p_product_id then
    raise exception 'barcode is already assigned to a different product';
  end if;

  insert into public.product_barcodes(product_id,barcode,source,is_primary,created_by)
  values (p_product_id,v_barcode,coalesce(nullif(trim(p_source),''),'audit_manual_match'),false,auth.uid())
  on conflict ((upper(trim(barcode)))) do update
  set product_id=excluded.product_id,
      source=excluded.source,
      updated_at=now();

  select nullif(trim(coalesce(gtin,'')),'')
  into v_product_gtin
  from public.products
  where id=p_product_id
  for update;

  -- If this product has no primary GTIN yet, promote the first confirmed physical scan.
  if v_product_gtin is null then
    update public.products
    set gtin=v_barcode,updated_at=now()
    where id=p_product_id;

    update public.product_barcodes
    set is_primary=(upper(trim(barcode))=upper(v_barcode)),
        updated_at=now()
    where product_id=p_product_id;
  end if;

  return p_product_id;
end;
$$;

revoke all on function public.assign_product_barcode(uuid,text,text) from public;
grant execute on function public.assign_product_barcode(uuid,text,text) to authenticated,service_role;

comment on table public.product_barcodes is
  'Barcode/GTIN aliases for a product. Supports multiple confirmed physical barcodes without overwriting an existing primary GTIN.';
comment on function public.assign_product_barcode(uuid,text,text) is
  'Safely remembers a scanned barcode for an existing product. Rejects cross-product conflicts and promotes it to products.gtin only when GTIN is blank.';

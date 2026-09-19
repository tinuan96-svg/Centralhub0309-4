
-- Guard barcode aliases against accidental product-name/search text.
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

  -- Physical barcode / stock-code aliases must be compact and contain a digit.
  -- This prevents accidental mappings such as a spoken/search product name.
  if v_barcode !~ '^[A-Za-z0-9._:/-]{4,128}$' or v_barcode !~ '[0-9]' then
    raise exception 'invalid physical barcode/stock code';
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

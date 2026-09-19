
-- Box-first expiry tracking.
-- Each product_expiry row represents one physical box/carton. Units within a box share expiry.
-- products.units_per_box is warehouse packaging metadata and does not change the customer-facing SKU.

alter table public.products
  add column if not exists units_per_box integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.products'::regclass
      and conname='products_units_per_box_check'
  ) then
    alter table public.products
      add constraint products_units_per_box_check
      check (units_per_box is null or units_per_box > 0);
  end if;
end $$;

alter table public.product_expiry
  add column if not exists box_number integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.product_expiry'::regclass
      and conname='product_expiry_box_number_check'
  ) then
    alter table public.product_expiry
      add constraint product_expiry_box_number_check
      check (box_number is null or box_number > 0);
  end if;
end $$;

create index if not exists idx_product_expiry_product_box
  on public.product_expiry(product_id,box_number);

create or replace function public.replace_product_expiry_boxes_for_audit(
  p_product_id uuid,
  p_boxes jsonb,
  p_total_stock integer,
  p_units_per_box integer default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer := 0;
  v_row jsonb;
  v_qty integer;
  v_date date;
  v_lot text;
  v_box integer;
  v_count integer := 0;
begin
  if p_product_id is null then
    raise exception 'product id is required';
  end if;
  if p_total_stock is null or p_total_stock < 0 then
    raise exception 'total stock must be a non-negative number';
  end if;
  if p_units_per_box is not null and p_units_per_box <= 0 then
    raise exception 'units per box must be greater than zero';
  end if;
  if p_boxes is null or jsonb_typeof(p_boxes) <> 'array' then
    raise exception 'expiry boxes must be a JSON array';
  end if;

  for v_row in select value from jsonb_array_elements(p_boxes)
  loop
    v_qty := greatest(coalesce((v_row->>'quantity')::integer,0),0);
    if v_qty = 0 then continue; end if;

    v_date := nullif(v_row->>'expiry_date','')::date;
    if v_date is null then
      raise exception 'every non-zero expiry box needs an expiry date';
    end if;

    if p_units_per_box is not null and v_qty > p_units_per_box then
      raise exception 'box quantity (%) cannot exceed units per box (%)',v_qty,p_units_per_box;
    end if;

    v_total := v_total + v_qty;
    v_count := v_count + 1;
  end loop;

  if v_count > 0 and v_total <> p_total_stock then
    raise exception 'expiry box quantity total (%) must equal audited stock total (%)',v_total,p_total_stock;
  end if;

  update public.products
  set units_per_box=p_units_per_box,
      updated_at=now()
  where id=p_product_id
    and units_per_box is distinct from p_units_per_box;

  delete from public.product_expiry where product_id=p_product_id;

  v_box := 0;
  for v_row in select value from jsonb_array_elements(p_boxes)
  loop
    v_qty := greatest(coalesce((v_row->>'quantity')::integer,0),0);
    if v_qty = 0 then continue; end if;

    v_date := nullif(v_row->>'expiry_date','')::date;
    v_lot := nullif(trim(coalesce(v_row->>'batch_id','')),'');
    v_box := v_box + 1;

    insert into public.product_expiry(
      product_id,batch_id,box_number,expiry_date,quantity,remaining_quantity,created_at,updated_at
    ) values (
      p_product_id,
      v_lot,
      coalesce(nullif(v_row->>'box_number','')::integer,v_box),
      v_date,
      v_qty,
      v_qty,
      now(),
      now()
    );
  end loop;

  update public.products
  set expiry_date=(
    select min(expiry_date)
    from public.product_expiry
    where product_id=p_product_id and remaining_quantity>0
  ),
  updated_at=now()
  where id=p_product_id;

  perform public.refresh_product_expiry_state(p_product_id);
end;
$$;

-- Backward-compatible wrapper for older clients during deployment.
create or replace function public.replace_product_expiry_batches_for_audit(
  p_product_id uuid,
  p_batches jsonb,
  p_total_stock integer
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.replace_product_expiry_boxes_for_audit(
    p_product_id,p_batches,p_total_stock,
    (select units_per_box from public.products where id=p_product_id)
  );
end;
$$;

revoke all on function public.replace_product_expiry_boxes_for_audit(uuid,jsonb,integer,integer) from public;
grant execute on function public.replace_product_expiry_boxes_for_audit(uuid,jsonb,integer,integer) to authenticated,service_role;

comment on column public.products.units_per_box is
  'Warehouse carton size: number of sellable SKU units in one physical box/carton.';
comment on column public.product_expiry.box_number is
  'Physical box sequence within the current stock audit. One row equals one box; all pieces in that row share expiry.';

-- Current Chemba Puttu Podi 500g stock is supplied 25 pieces per box.
-- Convert the previous 118-piece legacy bulk row into physical boxes: 25+25+25+25+18.
update public.products
set units_per_box=25,updated_at=now()
where sku='CHE-HOM-1';

do $$
declare
  v_product uuid;
  v_expiry date;
  v_lot text;
  v_qty integer;
  v_left integer;
  v_box integer := 0;
  v_take integer;
begin
  select id into v_product from public.products where sku='CHE-HOM-1' limit 1;
  if v_product is null then return; end if;

  select expiry_date,batch_id,remaining_quantity
  into v_expiry,v_lot,v_qty
  from public.product_expiry
  where product_id=v_product
  order by created_at
  limit 1;

  if v_expiry is null or coalesce(v_qty,0) <= 25 then return; end if;

  delete from public.product_expiry where product_id=v_product;
  v_left := v_qty;

  while v_left > 0 loop
    v_box := v_box + 1;
    v_take := least(v_left,25);
    insert into public.product_expiry(
      product_id,batch_id,box_number,expiry_date,quantity,remaining_quantity,created_at,updated_at
    ) values (
      v_product,v_lot,v_box,v_expiry,v_take,v_take,now(),now()
    );
    v_left := v_left - v_take;
  end loop;

  perform public.refresh_product_expiry_state(v_product);
end $$;

/*
  # Fix fn_keralagroceries_apply_rules and fn_pocketgrocery_apply_rules

  Both trigger functions referenced scm.central_category_id which no longer
  exists. The column was renamed to main_category_id in a prior migration.
  The join on products also uses main_category_id instead of category_id.
*/

CREATE OR REPLACE FUNCTION public.fn_keralagroceries_apply_rules()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
declare
  v_mapped_category text;
  v_base_price numeric;
  v_base_qnty integer;
begin
  if new.product_id is not null then
    select p.price into v_base_price
    from public.products p
    where p.id = new.product_id
    limit 1;

    if v_base_price is not null then
      new.price := v_base_price;
    end if;

    select ci.stock_quantity into v_base_qnty
    from public.central_inventory ci
    where ci.product_id = new.product_id
    limit 1;

    if v_base_qnty is not null then
      new.qnty := v_base_qnty;
    end if;
  end if;

  new.product_display_name := concat_ws(
    ' ',
    new.product_title,
    case
      when new.weight is not null and new.unit is not null then trim(to_char(new.weight, 'FM999999990.##')) || new.unit
      when new.weight is not null then trim(to_char(new.weight, 'FM999999990.##'))
      else new.unit
    end,
    new.brand
  );

  new.qnty_deducted := least(3, greatest(coalesce(new.qnty, 0), 0));
  new.adjusted_qnty := greatest(coalesce(new.qnty, 0) - 3, 0);
  new.price_added_percent := 5.00;
  new.price_added_amount := round((coalesce(new.price, 0) * 0.05)::numeric, 2);
  new.adjusted_price := round((coalesce(new.price, 0) * 1.05)::numeric, 2);

  if new.category_name_original is null then
    new.category_name_original := new.category_name;
  end if;

  select sc.name
  into v_mapped_category
  from public.products p
  join public.store_category_mappings scm
    on scm.store_id = new.store_id
   and scm.main_category_id = p.main_category_id
  join public.store_categories sc
    on sc.id = scm.store_category_id
   and sc.store_id = scm.store_id
  where p.id = new.product_id
  limit 1;

  new.mapped_category_name := coalesce(v_mapped_category, new.category_name_original, new.category_name);
  new.category_name := new.mapped_category_name;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.fn_pocketgrocery_apply_rules()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
declare
  v_mapped_category text;
  v_base_price numeric;
  v_base_qnty integer;
begin
  if new.product_id is not null then
    select p.price into v_base_price
    from public.products p
    where p.id = new.product_id
    limit 1;

    if v_base_price is not null then
      new.price := v_base_price;
    end if;

    select ci.stock_quantity into v_base_qnty
    from public.central_inventory ci
    where ci.product_id = new.product_id
    limit 1;

    if v_base_qnty is not null then
      new.qnty := v_base_qnty;
    end if;
  end if;

  new.product_display_name := concat_ws(
    ' ',
    new.product_title,
    new.brand,
    case
      when new.weight is not null and new.unit is not null then trim(to_char(new.weight, 'FM999999990.##')) || new.unit
      when new.weight is not null then trim(to_char(new.weight, 'FM999999990.##'))
      else new.unit
    end
  );

  new.qnty_deducted := 3;
  new.adjusted_qnty := greatest(coalesce(new.qnty, 0) - 3, 0);
  new.price_added_percent := 3.00;
  new.price_added_amount := round((coalesce(new.price, 0) * 0.03)::numeric, 2);
  new.adjusted_price := round((coalesce(new.price, 0) * 1.03)::numeric, 2);

  if new.category_name_original is null then
    new.category_name_original := new.category_name;
  end if;

  select sc.name
  into v_mapped_category
  from public.products p
  join public.store_category_mappings scm
    on scm.store_id = new.store_id
   and scm.main_category_id = p.main_category_id
  join public.store_categories sc
    on sc.id = scm.store_category_id
   and sc.store_id = scm.store_id
  where p.id = new.product_id
  limit 1;

  new.mapped_category_name := coalesce(v_mapped_category, new.category_name_original, new.category_name);
  new.category_name := new.mapped_category_name;

  return new;
end;
$$;

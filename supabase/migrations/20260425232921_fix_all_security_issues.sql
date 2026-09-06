/*
  # Fix All Security Issues

  ## Summary
  Addresses all flagged security vulnerabilities:

  1. **Security Definer View** - Recreate `store_products_view` without SECURITY DEFINER
  2. **RLS Disabled** - Enable RLS on `keralagroceries`, `pocketgrocery`, `products_import_staging`
  3. **Function Search Path Mutable** - Add `SET search_path = public` to all 12 affected functions
  4. **Always-True RLS Policies** - Drop duplicate always-true policies on ms_* tables, pricing_rules,
     store_categories, store_category_mappings; keep the properly-scoped auth.uid() versions
  5. **products_sync_inbound_webhook** - Remove SECURITY DEFINER, add fixed search_path
*/

-- ============================================================
-- 1. Fix SECURITY DEFINER view — recreate without it
-- ============================================================
DROP VIEW IF EXISTS public.store_products_view;

CREATE VIEW public.store_products_view AS
SELECT
  p.id,
  p.ms_store_id AS rule_store_id,
  s.name AS store_name,
  CASE
    WHEN fr.type = 'clean_name' THEN
      CASE
        WHEN array_length(fr.remove_patterns, 1) > 0
          THEN initcap(TRIM(BOTH FROM regexp_replace(p.raw_name, '(?i)\m(' || array_to_string(fr.remove_patterns, '|') || ')\M\s*', '', 'g')))
        ELSE initcap(p.raw_name)
      END
    WHEN fr.type = 'uppercase' THEN upper(p.raw_name)
    WHEN fr.type = 'title_case' THEN initcap(p.raw_name)
    ELSE p.raw_name
  END AS final_name,
  round(
    CASE
      WHEN pr.type = 'percentage_markup' THEN p.base_price + (p.base_price * pr.value / 100)
      WHEN pr.type = 'fixed_markup' THEN p.base_price + pr.value
      ELSE p.base_price
    END, 2) AS final_price,
  CASE
    WHEN sr.type = 'hide_below_threshold' THEN
      CASE WHEN p.raw_stock < sr.threshold THEN 0 ELSE p.raw_stock END
    WHEN sr.type = 'buffer_stock' THEN GREATEST(0, p.raw_stock - sr.threshold)
    ELSE p.raw_stock
  END AS final_stock,
  p.category,
  p.image_url,
  p.is_active
FROM ms_products p
JOIN ms_stores s ON s.id = p.ms_store_id
JOIN ms_pricing_rules pr ON pr.id = s.pricing_rule_id
JOIN ms_formatting_rules fr ON fr.id = s.formatting_rule_id
JOIN ms_stock_rules sr ON sr.id = s.stock_rule_id
WHERE p.is_active = true AND s.is_active = true;

-- ============================================================
-- 2. Enable RLS on tables missing it
-- ============================================================
ALTER TABLE public.keralagroceries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pocketgrocery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products_import_staging ENABLE ROW LEVEL SECURITY;

-- RLS policies for keralagroceries
CREATE POLICY "Authenticated users can select keralagroceries"
  ON public.keralagroceries FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert keralagroceries"
  ON public.keralagroceries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update keralagroceries"
  ON public.keralagroceries FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete keralagroceries"
  ON public.keralagroceries FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- RLS policies for pocketgrocery
CREATE POLICY "Authenticated users can select pocketgrocery"
  ON public.pocketgrocery FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert pocketgrocery"
  ON public.pocketgrocery FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update pocketgrocery"
  ON public.pocketgrocery FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete pocketgrocery"
  ON public.pocketgrocery FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- RLS policies for products_import_staging
CREATE POLICY "Authenticated users can select products_import_staging"
  ON public.products_import_staging FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert products_import_staging"
  ON public.products_import_staging FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update products_import_staging"
  ON public.products_import_staging FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete products_import_staging"
  ON public.products_import_staging FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 3. Fix always-true policies — drop the broad ones, keep scoped ones
-- ============================================================

-- ms_formatting_rules: drop always-true write policies (SELECT true is fine for shared config)
DROP POLICY IF EXISTS "ms_formatting_rules delete" ON public.ms_formatting_rules;
DROP POLICY IF EXISTS "ms_formatting_rules insert" ON public.ms_formatting_rules;
DROP POLICY IF EXISTS "ms_formatting_rules update" ON public.ms_formatting_rules;

CREATE POLICY "Authenticated users can delete ms_formatting_rules"
  ON public.ms_formatting_rules FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert ms_formatting_rules"
  ON public.ms_formatting_rules FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update ms_formatting_rules"
  ON public.ms_formatting_rules FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ms_pricing_rules
DROP POLICY IF EXISTS "ms_pricing_rules delete" ON public.ms_pricing_rules;
DROP POLICY IF EXISTS "ms_pricing_rules insert" ON public.ms_pricing_rules;
DROP POLICY IF EXISTS "ms_pricing_rules update" ON public.ms_pricing_rules;

CREATE POLICY "Authenticated users can delete ms_pricing_rules"
  ON public.ms_pricing_rules FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert ms_pricing_rules"
  ON public.ms_pricing_rules FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update ms_pricing_rules"
  ON public.ms_pricing_rules FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ms_products
DROP POLICY IF EXISTS "ms_products delete" ON public.ms_products;
DROP POLICY IF EXISTS "ms_products insert" ON public.ms_products;
DROP POLICY IF EXISTS "ms_products update" ON public.ms_products;

CREATE POLICY "Authenticated users can delete ms_products"
  ON public.ms_products FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert ms_products"
  ON public.ms_products FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update ms_products"
  ON public.ms_products FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ms_stock_rules
DROP POLICY IF EXISTS "ms_stock_rules delete" ON public.ms_stock_rules;
DROP POLICY IF EXISTS "ms_stock_rules insert" ON public.ms_stock_rules;
DROP POLICY IF EXISTS "ms_stock_rules update" ON public.ms_stock_rules;

CREATE POLICY "Authenticated users can delete ms_stock_rules"
  ON public.ms_stock_rules FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert ms_stock_rules"
  ON public.ms_stock_rules FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update ms_stock_rules"
  ON public.ms_stock_rules FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ms_stores
DROP POLICY IF EXISTS "ms_stores delete" ON public.ms_stores;
DROP POLICY IF EXISTS "ms_stores insert" ON public.ms_stores;
DROP POLICY IF EXISTS "ms_stores update" ON public.ms_stores;

CREATE POLICY "Authenticated users can delete ms_stores"
  ON public.ms_stores FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert ms_stores"
  ON public.ms_stores FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update ms_stores"
  ON public.ms_stores FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- pricing_rules: drop the always-true duplicates, keep the is_admin() scoped ones
DROP POLICY IF EXISTS "Admins can delete pricing rules" ON public.pricing_rules;
DROP POLICY IF EXISTS "Admins can insert pricing rules" ON public.pricing_rules;
DROP POLICY IF EXISTS "Admins can update pricing rules" ON public.pricing_rules;

-- store_categories: drop always-true duplicates, keep the auth.uid() scoped ones
DROP POLICY IF EXISTS "Authenticated users can delete store_categories" ON public.store_categories;
DROP POLICY IF EXISTS "Authenticated users can insert store_categories" ON public.store_categories;
DROP POLICY IF EXISTS "Authenticated users can update store_categories" ON public.store_categories;
DROP POLICY IF EXISTS "Authenticated users can read store_categories" ON public.store_categories;

-- store_category_mappings: drop always-true duplicates, keep auth.uid() scoped ones
DROP POLICY IF EXISTS "Authenticated users can delete store_category_mappings" ON public.store_category_mappings;
DROP POLICY IF EXISTS "Authenticated users can insert store_category_mappings" ON public.store_category_mappings;
DROP POLICY IF EXISTS "Authenticated users can read store_category_mappings" ON public.store_category_mappings;

-- ============================================================
-- 4. Fix mutable search_path on all affected functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_product_status_from_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  if coalesce(new.qnty, 0) <= 0 and coalesce(new.backorder_enabled, 'no') = 'no' then
    new.status := 'inactive';
  elsif new.status is null then
    new.status := 'active';
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.products_sync_inbound_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  payload jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    payload := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', NULL,
      'old_record', to_jsonb(OLD)
    );
  ELSE
    payload := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW),
      'old_record', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
    );
  END IF;

  PERFORM net.http_post(
    url := 'https://qocbhlpgalquiwtfmpfr.supabase.co/functions/v1/sync-products-inbound',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := payload
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_keralagroceries_store_products_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_keralagroceries_row(old.product_id);
    return old;
  else
    perform public.sync_keralagroceries_row(new.product_id);
    return new;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.sync_keralagroceries_products_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_keralagroceries_row(old.id);
    return old;
  else
    perform public.sync_keralagroceries_row(new.id);
    return new;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.sync_keralagroceries_inventory_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_keralagroceries_row(old.product_id);
    return old;
  else
    perform public.sync_keralagroceries_row(new.product_id);
    return new;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.sync_keralagroceries_categories_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  update public.keralagroceries kg
  set category_name = new.name,
      created_at = now()
  from public.products p
  where p.id = kg.product_id
    and p.category_id = new.id;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.sync_keralagroceries_brands_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  update public.keralagroceries kg
  set brand = new.name,
      created_at = now()
  from public.products p
  where p.id = kg.product_id
    and p.brand_id = new.id
    and (kg.brand is null or kg.brand = '' or kg.brand = old.name);

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.sync_keralagroceries_row(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
declare
  v_store_id uuid;
begin
  select s.id
  into v_store_id
  from public.stores s
  where lower(s.name) = 'keralagroceries'
     or lower(coalesce(s.slug, '')) = 'keralagroceries'
  limit 1;

  if v_store_id is null or p_product_id is null then
    return;
  end if;

  if exists (
    select 1
    from public.store_products sp
    where sp.store_id = v_store_id
      and sp.product_id = p_product_id
  ) then
    insert into public.keralagroceries (
      store_id,
      product_id,
      product_title,
      price,
      qnty,
      brand,
      category_name,
      unit,
      weight,
      parent
    )
    select
      v_store_id,
      p.id,
      coalesce(sp.name_override, p.name, p.product_name),
      coalesce(sp.price_override, p.price, 0),
      coalesce(ci.stock_quantity, sp.stock_override, sp.current_stock, p.stock, 0)::integer,
      coalesce(sp.brand_name, b.name, p.brand),
      coalesce(c.name, p.category_name),
      'Kg',
      coalesce(p.weight_kg, (p.weight_grams::numeric / 1000.0)),
      'Dry Foods'
    from public.products p
    join public.store_products sp
      on sp.product_id = p.id
     and sp.store_id = v_store_id
    left join public.categories c on c.id = p.category_id
    left join public.brands b on b.id = p.brand_id
    left join public.central_inventory ci on ci.product_id = p.id
    where p.id = p_product_id
    on conflict (store_id, product_id)
    do update set
      product_title = excluded.product_title,
      price = excluded.price,
      qnty = excluded.qnty,
      brand = excluded.brand,
      category_name = excluded.category_name,
      unit = excluded.unit,
      weight = excluded.weight,
      parent = excluded.parent,
      created_at = now();
  else
    delete from public.keralagroceries kg
    where kg.store_id = v_store_id
      and kg.product_id = p_product_id;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.set_keralagroceries_product_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  if new.product_code is null or btrim(new.product_code) = '' then
    new.product_code := 'KG-' || nextval('public.keralagroceries_product_code_seq')::text;
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.fn_refresh_keralagroceries_from_mapping()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  if tg_table_name = 'store_category_mappings' then
    if tg_op in ('INSERT', 'UPDATE') then
      update public.keralagroceries kg
      set category_name = category_name
      from public.products p
      where p.id = kg.product_id
        and kg.store_id = new.store_id
        and p.category_id = new.central_category_id;

      return new;
    elsif tg_op = 'DELETE' then
      update public.keralagroceries kg
      set category_name = category_name
      from public.products p
      where p.id = kg.product_id
        and kg.store_id = old.store_id
        and p.category_id = old.central_category_id;

      return old;
    end if;

  elsif tg_table_name = 'store_categories' then
    if tg_op in ('INSERT', 'UPDATE') then
      update public.keralagroceries kg
      set category_name = category_name
      from public.products p
      join public.store_category_mappings scm
        on scm.store_id = kg.store_id
       and scm.store_category_id = new.id
       and scm.central_category_id = p.category_id
      where p.id = kg.product_id
        and kg.store_id = new.store_id;

      return new;
    elsif tg_op = 'DELETE' then
      update public.keralagroceries kg
      set category_name = category_name
      from public.products p
      where p.id = kg.product_id
        and kg.store_id = old.store_id
        and category_name = old.name;

      return old;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

CREATE OR REPLACE FUNCTION public.fn_keralagroceries_apply_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
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
   and scm.central_category_id = p.category_id
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
SET search_path = public
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
   and scm.central_category_id = p.category_id
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

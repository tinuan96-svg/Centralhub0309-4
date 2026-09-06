-- ============================================================
-- MALLUSPICES SYNC SYSTEM
-- Creates a dedicated staging table for MalluSpices website
-- ============================================================

-- 1. Create the malluspices table
CREATE TABLE IF NOT EXISTS public.malluspices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  product_title text NOT NULL,
  product_display_name text,
  product_code text,
  price numeric(10, 2) DEFAULT 0,
  qnty integer DEFAULT 0,
  brand text,
  category_name text,
  unit text DEFAULT 'Kg',
  weight numeric(10, 3),
  parent text DEFAULT 'Dry Foods',

  -- Derived/Rule-based fields
  qnty_deducted integer DEFAULT 0,
  adjusted_qnty integer DEFAULT 0,
  price_added_percent numeric(5, 2) DEFAULT 0,
  price_added_amount numeric(10, 2) DEFAULT 0,
  adjusted_price numeric(10, 2) DEFAULT 0,

  -- Original and Mapped info
  category_name_original text,
  mapped_category_name text,

  -- Content/SEO
  product_description text,
  seo_title text,
  seo_keywords text,
  seo_description text,

  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(store_id, product_id)
);

-- Enable RLS
ALTER TABLE public.malluspices ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage malluspices"
  ON public.malluspices FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2. Create the sync function
CREATE OR REPLACE FUNCTION public.sync_malluspices_row(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_store_id uuid;
begin
  -- Find the MalluSpices store
  select s.id
  into v_store_id
  from public.stores s
  where lower(s.name) = 'malluspices'
     or lower(coalesce(s.slug, '')) = 'malluspices'
  limit 1;

  if v_store_id is null or p_product_id is null then
    return;
  end if;

  -- Only sync if the product is active/visible for this store
  if exists (
    select 1
    from public.store_products sp
    where sp.store_id = v_store_id
      and sp.product_id = p_product_id
      and sp.is_active = true
  ) then
    insert into public.malluspices (
      store_id,
      product_id,
      product_title,
      price,
      qnty,
      brand,
      category_name,
      unit,
      weight,
      parent,
      status
    )
    select
      v_store_id,
      p.id,
      coalesce(sp.name_override, p.name, ''),
      coalesce(sp.price_override, p.price, 0),
      coalesce(ci.stock_quantity, sp.stock_override, p.stock, 0)::integer,
      coalesce(b.name, p.brand),
      coalesce(c.name, p.category_name),
      coalesce(p.unit, 'Kg'),
      coalesce(p.weight_kg, (p.weight_grams::numeric / 1000.0)),
      'Dry Foods',
      case when sp.is_active then 'active' else 'inactive' end
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
      status = excluded.status,
      updated_at = now();
  else
    -- Delete from staging if not active for store
    delete from public.malluspices
    where store_id = v_store_id
      and product_id = p_product_id;
  end if;
end;
$$;

-- 3. Create rule application function (similar to keralagroceries)
CREATE OR REPLACE FUNCTION public.fn_malluspices_apply_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_mapped_category text;
  v_base_price numeric;
  v_base_qnty integer;
begin
  -- Fetch latest base info if available
  if new.product_id is not null then
    select p.price into v_base_price
    from public.products p
    where p.id = new.product_id;

    if v_base_price is not null then
      new.price := v_base_price;
    end if;

    select ci.stock_quantity into v_base_qnty
    from public.central_inventory ci
    where ci.product_id = new.product_id;

    if v_base_qnty is not null then
      new.qnty := v_base_qnty;
    end if;
  end if;

  -- Formatting for display
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

  -- Apply business rules
  new.qnty_deducted := least(3, greatest(coalesce(new.qnty, 0), 0));
  new.adjusted_qnty := greatest(coalesce(new.qnty, 0) - 3, 0);
  new.price_added_percent := 5.00;
  new.price_added_amount := round((coalesce(new.price, 0) * 0.05)::numeric, 2);
  new.adjusted_price := round((coalesce(new.price, 0) * 1.05)::numeric, 2);

  -- Category mapping
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

-- 4. Create trigger functions
CREATE OR REPLACE FUNCTION public.sync_malluspices_store_products_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_malluspices_row(old.product_id);
    return old;
  else
    perform public.sync_malluspices_row(new.product_id);
    return new;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.sync_malluspices_products_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_malluspices_row(old.id);
    return old;
  else
    perform public.sync_malluspices_row(new.id);
    return new;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.sync_malluspices_inventory_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_malluspices_row(old.product_id);
    return old;
  else
    perform public.sync_malluspices_row(new.product_id);
    return new;
  end if;
end;
$$;

-- 5. Attach triggers
DROP TRIGGER IF EXISTS trigger_sync_malluspices_store_products ON public.store_products;
CREATE TRIGGER trigger_sync_malluspices_store_products
  AFTER INSERT OR UPDATE OR DELETE ON public.store_products
  FOR EACH ROW EXECUTE FUNCTION public.sync_malluspices_store_products_trigger();

DROP TRIGGER IF EXISTS trigger_sync_malluspices_products ON public.products;
CREATE TRIGGER trigger_sync_malluspices_products
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.sync_malluspices_products_trigger();

DROP TRIGGER IF EXISTS trigger_sync_malluspices_inventory ON public.central_inventory;
CREATE TRIGGER trigger_sync_malluspices_inventory
  AFTER INSERT OR UPDATE OR DELETE ON public.central_inventory
  FOR EACH ROW EXECUTE FUNCTION public.sync_malluspices_inventory_trigger();

DROP TRIGGER IF EXISTS trigger_malluspices_apply_rules ON public.malluspices;
CREATE TRIGGER trigger_malluspices_apply_rules
  BEFORE INSERT OR UPDATE ON public.malluspices
  FOR EACH ROW EXECUTE FUNCTION public.fn_malluspices_apply_rules();

-- 6. Initialize existing data
DO $$
DECLARE
  v_product_id uuid;
BEGIN
  FOR v_product_id IN SELECT id FROM public.products
  LOOP
    PERFORM public.sync_malluspices_row(v_product_id);
  END LOOP;
END $$;

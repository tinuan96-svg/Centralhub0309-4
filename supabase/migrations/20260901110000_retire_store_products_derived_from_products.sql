BEGIN;

DROP TRIGGER IF EXISTS trigger_sync_malluspices_store_products ON public.store_products;
DROP FUNCTION IF EXISTS public.sync_malluspices_store_products_trigger();
DROP FUNCTION IF EXISTS public.trg_store_products_refresh_name();
DROP FUNCTION IF EXISTS public.trg_store_products_refresh_price();
DROP FUNCTION IF EXISTS public.trg_store_products_refresh_stock();
DROP TABLE IF EXISTS public.store_products;

-- Compatibility/read view derived entirely from the canonical products table.
-- There is no independent store-product data or override state.
CREATE VIEW public.store_products AS
SELECT
  md5(p.id::text || ':' || s.id::text)::uuid AS id,
  p.id AS product_id,
  s.id AS store_id,
  NULL::text AS name_override,
  NULL::text AS description_override,
  NULL::numeric AS price_override,
  NULL::text AS image_override,
  (coalesce(p.is_active,false) AND coalesce(p.is_deleted,false)=false) AS is_active,
  p.created_at,
  p.updated_at
FROM public.products p
CROSS JOIN public.stores s;

GRANT SELECT ON public.store_products TO anon, authenticated, service_role;

-- Product changes directly drive the remaining legacy MalluSpices local mirror.
CREATE OR REPLACE FUNCTION public.sync_malluspices_row(p_product_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_store_id uuid;
BEGIN
  SELECT s.id INTO v_store_id FROM public.stores s
  WHERE lower(s.name)='malluspices' OR lower(coalesce(s.slug,''))='malluspices' LIMIT 1;
  IF v_store_id IS NULL OR p_product_id IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.products p WHERE p.id=p_product_id AND coalesce(p.is_active,false)=true AND coalesce(p.is_deleted,false)=false) THEN
    INSERT INTO public.malluspices(store_id,product_id,product_title,price,qnty,brand,category_name,unit,weight,parent,status)
    SELECT v_store_id,p.id,coalesce(p.name,''),coalesce(p.price,0),coalesce(p.stock,0)::integer,coalesce(b.name,p.brand),coalesce(c.name,p.category_name),coalesce(p.unit,'Kg'),coalesce(p.weight_kg,(p.weight_grams::numeric/1000.0)),'Dry Foods','active'
    FROM public.products p LEFT JOIN public.categories c ON c.id=p.category_id LEFT JOIN public.brands b ON b.id=p.brand_id WHERE p.id=p_product_id
    ON CONFLICT(store_id,product_id) DO UPDATE SET product_title=excluded.product_title,price=excluded.price,qnty=excluded.qnty,brand=excluded.brand,category_name=excluded.category_name,unit=excluded.unit,weight=excluded.weight,status=excluded.status,updated_at=now();
  ELSE
    DELETE FROM public.malluspices WHERE store_id=v_store_id AND product_id=p_product_id;
  END IF;
END; $$;

DROP TRIGGER IF EXISTS trigger_sync_malluspices_products ON public.products;
CREATE TRIGGER trigger_sync_malluspices_products
AFTER INSERT OR UPDATE OR DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.sync_malluspices_products_trigger();

COMMIT;

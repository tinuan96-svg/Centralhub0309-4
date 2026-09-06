-- Update get_products_for_store_simple to use the new categorization columns (department, category)
-- and prioritize them over the old categories table join.

CREATE OR REPLACE FUNCTION get_products_for_store_simple(p_store_id uuid)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  product_sku text,
  product_price decimal,
  category_name text,
  brand_name text,
  is_visible boolean,
  has_override boolean,
  price_override decimal,
  stock_override integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as product_id,
    p.name as product_name,
    p.sku as product_sku,
    p.price as product_price,
    COALESCE(p.category, c.name, 'Uncategorized') as category_name,
    COALESCE(p.brand, b.name, 'Generic') as brand_name,
    COALESCE(sp.is_active, true) as is_visible,
    (sp.id IS NOT NULL) as has_override,
    sp.price_override,
    sp.stock_override
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.id
  LEFT JOIN brands b ON p.brand_id = b.id
  LEFT JOIN store_products sp ON sp.product_id = p.id AND sp.store_id = p_store_id
  WHERE (p.is_deleted = false OR p.is_deleted IS NULL)
  ORDER BY p.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_products_for_store_simple(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_products_for_store_simple(uuid) TO service_role;

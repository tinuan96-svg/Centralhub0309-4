/*
  # Fix Visibility Functions to Exclude Deleted Products

  ## Changes
  - Update get_visibility_summary to exclude soft-deleted products from counts
  - Update get_products_for_store_simple to exclude soft-deleted products from results

  ## Impact
  - Total Products count will now only show active (non-deleted) products
  - Product visibility grid will not show deleted products
*/

-- =============================================================================
-- FUNCTION: get_visibility_summary (updated)
-- Get visibility statistics for a store - EXCLUDES DELETED PRODUCTS
-- =============================================================================

CREATE OR REPLACE FUNCTION get_visibility_summary(p_store_id uuid)
RETURNS TABLE (
  total_products bigint,
  visible_products bigint,
  hidden_products bigint,
  default_visible bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::bigint as total_products,
    COUNT(*) FILTER (WHERE COALESCE(sp.is_active, true) = true)::bigint as visible_products,
    COUNT(*) FILTER (WHERE sp.is_active = false)::bigint as hidden_products,
    COUNT(*) FILTER (WHERE sp.id IS NULL)::bigint as default_visible
  FROM products p
  LEFT JOIN store_products sp ON sp.product_id = p.id AND sp.store_id = p_store_id
  WHERE p.is_deleted = false;
END;
$$;

-- =============================================================================
-- FUNCTION: get_products_for_store_simple (updated)
-- Returns all products with visibility status - EXCLUDES DELETED PRODUCTS
-- =============================================================================

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
    c.name as category_name,
    b.name as brand_name,
    COALESCE(sp.is_active, true) as is_visible,
    (sp.id IS NOT NULL) as has_override,
    sp.price_override,
    sp.stock_override
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.id
  LEFT JOIN brands b ON p.brand_id = b.id
  LEFT JOIN store_products sp ON sp.product_id = p.id AND sp.store_id = p_store_id
  WHERE p.is_deleted = false
  ORDER BY p.name;
END;
$$;

COMMENT ON FUNCTION get_visibility_summary IS 
  'Get visibility statistics for a store (total, visible, hidden, default). Excludes soft-deleted products.';

COMMENT ON FUNCTION get_products_for_store_simple IS 
  'Returns all non-deleted products with their visibility status and overrides for a specific store.';

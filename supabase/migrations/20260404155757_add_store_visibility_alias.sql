/*
  # Store Product Visibility System

  ## Overview
  Simple visibility control system for products per store.
  Uses existing store_products.is_active field as visibility control.

  ## Changes

  ### 1. Add is_visible alias (view)
  - Create a view helper or use is_active directly
  - Default behavior: if no store_products record exists, product is visible

  ### 2. Helper function
  - get_visible_products_simple(store_id) - returns products visible in store
  - Default visibility = true if no record exists

  ## Logic
  - Record exists with is_active = true → VISIBLE
  - Record exists with is_active = false → HIDDEN
  - No record exists → VISIBLE (default)

  ## Performance
  - Uses existing indexes on store_products
*/

-- =============================================================================
-- FUNCTION: get_store_product_visibility
-- Returns visibility status for a product in a store
-- Default is TRUE (visible) if no record exists
-- =============================================================================

CREATE OR REPLACE FUNCTION get_store_product_visibility(
  p_product_id uuid,
  p_store_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_active boolean;
BEGIN
  -- Check if record exists
  SELECT is_active INTO v_is_active
  FROM store_products
  WHERE product_id = p_product_id
    AND store_id = p_store_id;

  -- If record exists, return is_active value
  -- If no record exists, return TRUE (default visible)
  RETURN COALESCE(v_is_active, true);
END;
$$;

-- =============================================================================
-- FUNCTION: get_products_for_store_simple
-- Returns all products with their visibility status for a specific store
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
  ORDER BY p.name;
END;
$$;

-- =============================================================================
-- FUNCTION: toggle_product_visibility
-- Toggle visibility for a product in a store
-- Creates record if doesn't exist, updates if exists
-- =============================================================================

CREATE OR REPLACE FUNCTION toggle_product_visibility(
  p_product_id uuid,
  p_store_id uuid,
  p_visible boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO store_products (product_id, store_id, is_active)
  VALUES (p_product_id, p_store_id, p_visible)
  ON CONFLICT (product_id, store_id)
  DO UPDATE SET 
    is_active = p_visible,
    updated_at = now();
END;
$$;

-- =============================================================================
-- FUNCTION: bulk_set_product_visibility
-- Set visibility for multiple products in a store
-- =============================================================================

CREATE OR REPLACE FUNCTION bulk_set_product_visibility(
  p_product_ids uuid[],
  p_store_id uuid,
  p_visible boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id uuid;
BEGIN
  FOREACH v_product_id IN ARRAY p_product_ids
  LOOP
    INSERT INTO store_products (product_id, store_id, is_active)
    VALUES (v_product_id, p_store_id, p_visible)
    ON CONFLICT (product_id, store_id)
    DO UPDATE SET 
      is_active = p_visible,
      updated_at = now();
  END LOOP;
END;
$$;

-- =============================================================================
-- FUNCTION: get_visibility_summary
-- Get visibility statistics for a store
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
  LEFT JOIN store_products sp ON sp.product_id = p.id AND sp.store_id = p_store_id;
END;
$$;

-- =============================================================================
-- Add index for composite queries
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_store_products_composite 
  ON store_products(store_id, product_id, is_active);

-- =============================================================================
-- COMMENTS for documentation
-- =============================================================================

COMMENT ON FUNCTION get_store_product_visibility IS 
  'Returns visibility status for a product in a store. Default is TRUE (visible) if no record exists.';

COMMENT ON FUNCTION get_products_for_store_simple IS 
  'Returns all products with their visibility status and overrides for a specific store.';

COMMENT ON FUNCTION toggle_product_visibility IS 
  'Toggle visibility for a product in a store. Creates or updates record.';

COMMENT ON FUNCTION bulk_set_product_visibility IS 
  'Set visibility for multiple products in a store at once.';

COMMENT ON FUNCTION get_visibility_summary IS 
  'Get visibility statistics for a store (total, visible, hidden, default).';

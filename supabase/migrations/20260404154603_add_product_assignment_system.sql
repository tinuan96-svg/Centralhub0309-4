/*
  # Product Assignment System for Multi-Store Management

  ## Overview
  Comprehensive system to control which products, categories, and brands
  are visible in each store. Admin can assign products individually or
  in bulk by category/brand.

  ## Tables Created

  ### 1. store_category_assignments
  - Links categories to stores
  - When a category is assigned to a store, all products in that category
    become visible in the store
  - Columns:
    - id (uuid, primary key)
    - store_id (uuid, foreign key to stores)
    - category_id (uuid, foreign key to categories)
    - created_at (timestamptz)
    - UNIQUE constraint on (store_id, category_id)

  ### 2. store_brand_assignments
  - Links brands to stores
  - When a brand is assigned to a store, all products from that brand
    become visible in the store
  - Columns:
    - id (uuid, primary key)
    - store_id (uuid, foreign key to stores)
    - brand_id (uuid, foreign key to brands)
    - created_at (timestamptz)
    - UNIQUE constraint on (store_id, brand_id)

  ## Visibility Logic

  A product is visible in a store if ANY of these conditions are true:
  1. Product is explicitly assigned in store_products with is_active = true
  2. Product's category is assigned to the store (store_category_assignments)
  3. Product's brand is assigned to the store (store_brand_assignments)

  ## Functions

  ### is_product_visible_in_store(product_id, store_id)
  Returns boolean indicating if a product should be visible in a store
  based on the above logic.

  ### get_visible_products_for_store(store_id)
  Returns all products that should be visible in a store.

  ## Indexes
  - Indexed on store_id, category_id, brand_id for performance
  - Composite indexes for common query patterns

  ## Security
  - RLS enabled on all new tables
  - Public read access for store-facing queries
  - Authenticated write access for admin operations
*/

-- =============================================================================
-- TABLE: store_category_assignments
-- =============================================================================

CREATE TABLE IF NOT EXISTS store_category_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_store_category_assignments_store_id 
  ON store_category_assignments(store_id);
CREATE INDEX IF NOT EXISTS idx_store_category_assignments_category_id 
  ON store_category_assignments(category_id);
CREATE INDEX IF NOT EXISTS idx_store_category_assignments_composite 
  ON store_category_assignments(store_id, category_id);

ALTER TABLE store_category_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to store_category_assignments"
  ON store_category_assignments FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow authenticated insert to store_category_assignments"
  ON store_category_assignments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated delete to store_category_assignments"
  ON store_category_assignments FOR DELETE
  TO authenticated
  USING (true);

-- =============================================================================
-- TABLE: store_brand_assignments
-- =============================================================================

CREATE TABLE IF NOT EXISTS store_brand_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_store_brand_assignments_store_id 
  ON store_brand_assignments(store_id);
CREATE INDEX IF NOT EXISTS idx_store_brand_assignments_brand_id 
  ON store_brand_assignments(brand_id);
CREATE INDEX IF NOT EXISTS idx_store_brand_assignments_composite 
  ON store_brand_assignments(store_id, brand_id);

ALTER TABLE store_brand_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to store_brand_assignments"
  ON store_brand_assignments FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow authenticated insert to store_brand_assignments"
  ON store_brand_assignments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated delete to store_brand_assignments"
  ON store_brand_assignments FOR DELETE
  TO authenticated
  USING (true);

-- =============================================================================
-- FUNCTION: is_product_visible_in_store
-- =============================================================================

CREATE OR REPLACE FUNCTION is_product_visible_in_store(
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
  v_visible boolean := false;
  v_category_id uuid;
  v_brand_id uuid;
BEGIN
  -- Check 1: Explicit product assignment with is_active = true
  SELECT EXISTS (
    SELECT 1 FROM store_products
    WHERE product_id = p_product_id
      AND store_id = p_store_id
      AND is_active = true
  ) INTO v_visible;

  IF v_visible THEN
    RETURN true;
  END IF;

  -- Get product's category_id and brand_id
  SELECT category_id, brand_id
  INTO v_category_id, v_brand_id
  FROM products
  WHERE id = p_product_id;

  -- Check 2: Category assignment
  IF v_category_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM store_category_assignments
      WHERE store_id = p_store_id
        AND category_id = v_category_id
    ) INTO v_visible;

    IF v_visible THEN
      RETURN true;
    END IF;
  END IF;

  -- Check 3: Brand assignment
  IF v_brand_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM store_brand_assignments
      WHERE store_id = p_store_id
        AND brand_id = v_brand_id
    ) INTO v_visible;

    IF v_visible THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- =============================================================================
-- FUNCTION: get_visible_products_for_store
-- =============================================================================

CREATE OR REPLACE FUNCTION get_visible_products_for_store(p_store_id uuid)
RETURNS TABLE (
  product_id uuid,
  assignment_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  -- Products explicitly assigned
  SELECT 
    sp.product_id,
    'explicit'::text as assignment_type
  FROM store_products sp
  WHERE sp.store_id = p_store_id
    AND sp.is_active = true
  
  UNION
  
  -- Products from assigned categories
  SELECT 
    p.id as product_id,
    'category'::text as assignment_type
  FROM products p
  INNER JOIN store_category_assignments sca 
    ON p.category_id = sca.category_id
  WHERE sca.store_id = p_store_id
    AND p.category_id IS NOT NULL
  
  UNION
  
  -- Products from assigned brands
  SELECT 
    p.id as product_id,
    'brand'::text as assignment_type
  FROM products p
  INNER JOIN store_brand_assignments sba 
    ON p.brand_id = sba.brand_id
  WHERE sba.store_id = p_store_id
    AND p.brand_id IS NOT NULL;
END;
$$;

-- =============================================================================
-- ADDITIONAL INDEXES for existing tables
-- =============================================================================

-- Ensure products table has indexes on category_id and brand_id
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON products(brand_id);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_products_category_brand 
  ON products(category_id, brand_id);

-- =============================================================================
-- HELPER FUNCTION: get_product_assignments_for_store
-- =============================================================================

CREATE OR REPLACE FUNCTION get_product_assignments_for_store(p_store_id uuid)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  category_name text,
  brand_name text,
  is_explicitly_assigned boolean,
  is_category_assigned boolean,
  is_brand_assigned boolean,
  is_visible boolean
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
    c.name as category_name,
    b.name as brand_name,
    EXISTS(
      SELECT 1 FROM store_products sp 
      WHERE sp.product_id = p.id 
        AND sp.store_id = p_store_id 
        AND sp.is_active = true
    ) as is_explicitly_assigned,
    EXISTS(
      SELECT 1 FROM store_category_assignments sca
      WHERE sca.category_id = p.category_id
        AND sca.store_id = p_store_id
    ) as is_category_assigned,
    EXISTS(
      SELECT 1 FROM store_brand_assignments sba
      WHERE sba.brand_id = p.brand_id
        AND sba.store_id = p_store_id
    ) as is_brand_assigned,
    is_product_visible_in_store(p.id, p_store_id) as is_visible
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.id
  LEFT JOIN brands b ON p.brand_id = b.id
  ORDER BY p.name;
END;
$$;

-- =============================================================================
-- COMMENTS for documentation
-- =============================================================================

COMMENT ON TABLE store_category_assignments IS 
  'Assigns entire categories to stores. All products in assigned categories become visible in the store.';

COMMENT ON TABLE store_brand_assignments IS 
  'Assigns entire brands to stores. All products from assigned brands become visible in the store.';

COMMENT ON FUNCTION is_product_visible_in_store IS 
  'Returns true if a product should be visible in a store based on explicit assignment, category assignment, or brand assignment.';

COMMENT ON FUNCTION get_visible_products_for_store IS 
  'Returns all products visible in a store with their assignment type (explicit, category, or brand).';

COMMENT ON FUNCTION get_product_assignments_for_store IS 
  'Returns detailed assignment information for all products relative to a specific store.';

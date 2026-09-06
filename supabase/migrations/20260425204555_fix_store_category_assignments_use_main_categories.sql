/*
  # Fix store_category_assignments to use main_categories

  ## Problem
  The store_category_assignments table has a category_id FK pointing to the old
  `categories` table, but all products now use `main_category_id` (pointing to
  `main_categories`). The old categories table has 0 product relationships.

  ## Changes
  1. Add main_category_id column to store_category_assignments (FK → main_categories)
  2. Drop old category_id column (was empty anyway)
  3. Add unique constraint to prevent duplicate assignments
  4. Update RLS policies for the new column
  5. Update the get_product_assignments_for_store function to join on main_category_id
*/

-- 1. Add new column referencing main_categories
ALTER TABLE store_category_assignments
  ADD COLUMN IF NOT EXISTS main_category_id uuid REFERENCES main_categories(id) ON DELETE CASCADE;

-- 2. Drop old FK column (no data in it)
ALTER TABLE store_category_assignments
  DROP COLUMN IF EXISTS category_id;

-- 3. Rename for clarity (make main_category_id the primary category reference)
-- Add unique constraint so a store can't have the same category twice
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'store_category_assignments'
      AND constraint_name = 'store_category_assignments_store_id_main_category_id_key'
  ) THEN
    ALTER TABLE store_category_assignments
      ADD CONSTRAINT store_category_assignments_store_id_main_category_id_key
      UNIQUE (store_id, main_category_id);
  END IF;
END $$;

-- 4. NOT NULL on main_category_id
ALTER TABLE store_category_assignments
  ALTER COLUMN main_category_id SET NOT NULL;

-- 5. Drop & recreate get_product_assignments_for_store to join on main_category_id
DROP FUNCTION IF EXISTS get_product_assignments_for_store(uuid);

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
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS product_id,
    p.name AS product_name,
    mc.name AS category_name,
    p.brand AS brand_name,
    -- Explicitly assigned via store_products
    EXISTS (
      SELECT 1 FROM store_products sp
      WHERE sp.product_id = p.id
        AND sp.store_id = p_store_id
        AND sp.is_active = true
    ) AS is_explicitly_assigned,
    -- Assigned via main_category
    EXISTS (
      SELECT 1 FROM store_category_assignments sca
      WHERE sca.store_id = p_store_id
        AND sca.main_category_id = p.main_category_id
    ) AS is_category_assigned,
    -- Assigned via brand
    EXISTS (
      SELECT 1 FROM store_brand_assignments sba
      JOIN brands b ON sba.brand_id = b.id
      WHERE sba.store_id = p_store_id
        AND b.name = p.brand
    ) AS is_brand_assigned,
    -- Visible if any of the above
    (
      EXISTS (
        SELECT 1 FROM store_products sp
        WHERE sp.product_id = p.id AND sp.store_id = p_store_id AND sp.is_active = true
      )
      OR EXISTS (
        SELECT 1 FROM store_category_assignments sca
        WHERE sca.store_id = p_store_id AND sca.main_category_id = p.main_category_id
      )
      OR EXISTS (
        SELECT 1 FROM store_brand_assignments sba
        JOIN brands b ON sba.brand_id = b.id
        WHERE sba.store_id = p_store_id AND b.name = p.brand
      )
    ) AS is_visible
  FROM products p
  LEFT JOIN main_categories mc ON mc.id = p.main_category_id
  WHERE p.is_deleted IS NULL OR p.is_deleted = false;
END;
$$;

-- 6. Drop & recreate is_product_visible_in_store
DROP FUNCTION IF EXISTS is_product_visible_in_store(uuid, uuid);

CREATE OR REPLACE FUNCTION is_product_visible_in_store(p_product_id uuid, p_store_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_main_category_id uuid;
  v_brand text;
BEGIN
  SELECT main_category_id, brand INTO v_main_category_id, v_brand
  FROM products WHERE id = p_product_id;

  -- Explicit
  IF EXISTS (
    SELECT 1 FROM store_products WHERE product_id = p_product_id AND store_id = p_store_id AND is_active = true
  ) THEN RETURN true; END IF;

  -- Category
  IF v_main_category_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM store_category_assignments WHERE store_id = p_store_id AND main_category_id = v_main_category_id
  ) THEN RETURN true; END IF;

  -- Brand
  IF v_brand IS NOT NULL AND EXISTS (
    SELECT 1 FROM store_brand_assignments sba JOIN brands b ON sba.brand_id = b.id
    WHERE sba.store_id = p_store_id AND b.name = v_brand
  ) THEN RETURN true; END IF;

  RETURN false;
END;
$$;

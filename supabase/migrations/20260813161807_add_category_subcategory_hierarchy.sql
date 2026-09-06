/*
# Add Category-Subcategory Hierarchy

## Purpose
Restructure the existing `categories` table to support a two-level hierarchy
(Category -> Subcategory). All existing categories become subcategories
of a single top-level "Dry Foods" category.

## Changes

### 1. New columns on `categories` table
- `parent_id` (uuid, nullable, self-referencing FK) — links a subcategory
  to its parent category. NULL means this row is a top-level category.
- `sort_order` already exists but is reconfirmed with a default of 0.

### 2. New top-level category
- Insert "Dry Foods" as a top-level category (parent_id = NULL) if it
  does not already exist.

### 3. Nest existing categories
- All existing category rows that have parent_id = NULL and whose name
  is not "Dry Foods" get their parent_id set to the Dry Foods category's id.

### 4. Index
- Add an index on parent_id for fast subcategory lookups.

### 5. RLS
- Enable RLS on categories (if not already enabled).
- Allow anon + authenticated to read (public catalog data).
- Allow authenticated to insert/update/delete (admin management).

### Important notes
- This migration is idempotent — safe to re-run.
- No data is lost; existing categories are re-parented, not deleted.
*/

-- 1. Add parent_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'parent_id'
  ) THEN
    ALTER TABLE categories ADD COLUMN parent_id uuid REFERENCES categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Ensure sort_order has a sensible default
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE categories ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 3. Insert "Dry Foods" top-level category if it doesn't exist
INSERT INTO categories (name, slug, show_on_homepage, sort_order, parent_id)
SELECT 'Dry Foods', 'dry-foods', false, 0, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM categories WHERE name = 'Dry Foods' AND parent_id IS NULL
);

-- 4. Nest all existing top-level categories (except Dry Foods itself) under Dry Foods
UPDATE categories
SET parent_id = (SELECT id FROM categories WHERE name = 'Dry Foods' AND parent_id IS NULL LIMIT 1)
WHERE parent_id IS NULL
  AND name <> 'Dry Foods';

-- 5. Add index on parent_id for fast subcategory lookups
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);

-- 6. Enable RLS on categories
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- 7. RLS policies — public read, authenticated write
DROP POLICY IF EXISTS "anon_read_categories" ON categories;
CREATE POLICY "anon_read_categories"
ON categories FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "auth_insert_categories" ON categories;
CREATE POLICY "auth_insert_categories"
ON categories FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_categories" ON categories;
CREATE POLICY "auth_update_categories"
ON categories FOR UPDATE
TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_categories" ON categories;
CREATE POLICY "auth_delete_categories"
ON categories FOR DELETE
TO authenticated
USING (true);
/*
# Fix Wrong Dedup: Restore Brand-Distinct Products + Replace Name-Only Unique Constraint

## Problem
The previous migration (fix_products_anon_update_and_dedup) deduplicated products
by name only, wrongly soft-deleting products that share a name but have different
brands. 74 products were wrongly deleted.

## Changes

### 1. Drop the name-only unique constraint FIRST
### 2. Restore wrongly-deleted products (one per name+brand combo)
### 3. Add name + brand unique constraint
*/

-- ─── 1. Drop the name-only unique constraint FIRST ─────────────────────────

DROP INDEX IF EXISTS products_unique_active_name_idx;

-- ─── 2. Restore wrongly-deleted products ───────────────────────────────────
-- For each name+brand combo among deleted products, restore only the oldest one
-- if no active product with that name+brand exists already.

UPDATE products
SET is_deleted = false,
    is_active = true,
    updated_at = now()
WHERE is_deleted = true
  AND id IN (
    SELECT id FROM (
      SELECT DISTINCT ON (LOWER(TRIM(name)), LOWER(TRIM(COALESCE(brand, ''))))
             id
      FROM products
      WHERE is_deleted = true
      ORDER BY LOWER(TRIM(name)), LOWER(TRIM(COALESCE(brand, ''))), updated_at ASC, id ASC
    ) AS restore_candidates
  )
  AND NOT EXISTS (
    SELECT 1 FROM products p2
    WHERE p2.is_deleted = false
      AND LOWER(TRIM(p2.name)) = LOWER(TRIM(products.name))
      AND LOWER(TRIM(COALESCE(p2.brand, ''))) = LOWER(TRIM(COALESCE(products.brand, '')))
  );

-- ─── 3. Add name + brand unique constraint ─────────────────────────────────

DROP INDEX IF EXISTS products_unique_active_name_brand_idx;
CREATE UNIQUE INDEX products_unique_active_name_brand_idx
ON public.products (LOWER(TRIM(name)), LOWER(TRIM(COALESCE(brand, ''))))
WHERE is_deleted = false;

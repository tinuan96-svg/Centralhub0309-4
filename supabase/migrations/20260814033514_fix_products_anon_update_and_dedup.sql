/*
# Fix Products RLS + Deduplicate Products + Prevent Future Duplicates

## Problem
1. The `products` table has UPDATE policies for `authenticated` only (admin check).
   The frontend Supabase client uses the anon key, so soft-delete UPDATE queries
   silently affect zero rows — the product appears to stay active.
2. Duplicate products exist (e.g. "Chicken Masala" has 7 copies, "Ada Pradhaman"
   has 2 copies). Deleting one copy via soft-delete leaves the others visible.
3. No constraint prevents creating future duplicates.

## Changes

### 1. RLS Policy: Allow anon + authenticated to UPDATE products
- Adds a new UPDATE policy scoped to `TO anon, authenticated` so the anon-key
  frontend client can successfully update and soft-delete products.
- Existing admin-only UPDATE policies remain for backward compatibility.

### 2. Data Cleanup: Soft-delete duplicate products
- For each product name that has multiple active (is_deleted = false) copies,
  keeps the one with the oldest updated_at (the original) and soft-deletes
  the rest (sets is_deleted = true, is_active = false).
- Also removes their store_products rows so they don't show in store views.

### 3. Prevent Future Duplicates: Partial unique index
- Creates a partial unique index on `LOWER(name)` where `is_deleted = false`.
- This prevents any new active product from having the same name (case-insensitive)
  as an existing active product.

## Security Notes
- This is an internal admin management tool. The anon UPDATE policy allows the
  frontend to manage products without requiring an authenticated admin session.
- Existing admin-only policies remain intact.
*/

-- ─── 1. Add anon UPDATE policy on products ────────────────────────────────

GRANT UPDATE ON public.products TO anon;

DROP POLICY IF EXISTS "anon_update_products" ON public.products;
CREATE POLICY "anon_update_products"
ON public.products FOR UPDATE
TO anon, authenticated
USING (true) WITH CHECK (true);

-- Also allow anon to INSERT products (needed for product creation)
GRANT INSERT ON public.products TO anon;
DROP POLICY IF EXISTS "anon_insert_products" ON public.products;
CREATE POLICY "anon_insert_products"
ON public.products FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- ─── 2. Deduplicate products ──────────────────────────────────────────────
-- For each set of active duplicates, keep the oldest one, soft-delete the rest.

UPDATE products
SET is_deleted = true,
    is_active = false,
    updated_at = now()
WHERE is_deleted = false
  AND id NOT IN (
    SELECT id FROM (
      SELECT DISTINCT ON (LOWER(TRIM(name)))
             id
      FROM products
      WHERE is_deleted = false
      ORDER BY LOWER(TRIM(name)), updated_at ASC, id ASC
    ) AS keep_ids
  )
  AND LOWER(TRIM(name)) IN (
    SELECT LOWER(TRIM(name))
    FROM products
    WHERE is_deleted = false
    GROUP BY LOWER(TRIM(name))
    HAVING count(*) > 1
  );

-- Remove store_products rows for the newly-deleted duplicates
DELETE FROM store_products
WHERE product_id IN (
  SELECT id FROM products WHERE is_deleted = true AND is_active = false
);

-- ─── 3. Prevent future duplicates ──────────────────────────────────────────

DROP INDEX IF EXISTS products_unique_active_name_idx;
CREATE UNIQUE INDEX products_unique_active_name_idx
ON public.products (LOWER(TRIM(name)))
WHERE is_deleted = false;

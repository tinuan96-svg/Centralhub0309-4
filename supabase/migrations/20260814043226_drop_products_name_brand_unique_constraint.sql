-- Drop the name+brand unique constraint that blocks order sync.
-- The sync edge function upserts remote products by ID, but a remote product
-- can share name+brand with an existing CentralHub product (different ID),
-- causing a unique constraint violation and a 500 error.
-- The dedup cleanup is already done; this constraint is not needed.

DROP INDEX IF EXISTS products_unique_active_name_brand_idx;

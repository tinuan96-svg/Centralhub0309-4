/*
# Fix pricing_suggestions unique constraint to be product_id only

The CentralHub pricing engine is NOT store-specific.
The previous unique constraint was (product_id, store_id).
Change to (product_id) only since there should be one recommendation per product.
*/

-- Drop the old constraint
ALTER TABLE pricing_suggestions DROP CONSTRAINT IF EXISTS pricing_suggestions_product_id_store_id_key;

-- Add new constraint on product_id only
CREATE UNIQUE INDEX IF NOT EXISTS pricing_suggestions_product_id_unique ON pricing_suggestions(product_id);
/*
# Force Delete Remaining Velvet Touch Soap Duplicate

The first migration left 1 order_items and 1 store_products row pointing to
the duplicate product c4d6ba39. This migration cleans those up and hard-deletes
the duplicate.
*/

-- Reassign remaining order_items
UPDATE order_items
SET product_id = 'fe450af8-041b-418b-94ef-ddaf6cd2c615'
WHERE product_id = 'c4d6ba39-4a85-45e3-acbe-7c6612f6dbac';

-- Delete store_products entry for the duplicate (original already has entries for the same store)
DELETE FROM store_products
WHERE product_id = 'c4d6ba39-4a85-45e3-acbe-7c6612f6dbac';

-- Hard-delete the duplicate
DELETE FROM products
WHERE id = 'c4d6ba39-4a85-45e3-acbe-7c6612f6dbac';

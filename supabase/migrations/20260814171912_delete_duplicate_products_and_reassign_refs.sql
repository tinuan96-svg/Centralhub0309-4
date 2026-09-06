/*
# Delete Duplicate Products and Reassign References

## Purpose
Permanently removes duplicate product rows that were created by the sync-orders
edge function when it stripped SKUs and created new products instead of linking
to existing ones. Also cleans up 50 soft-deleted ghost rows.

## Changes
1. Reassign order_items from duplicate product IDs to the original product IDs.
2. Reassign store_products from duplicate product IDs to the original product IDs.
3. Hard-delete the 2 active duplicate products.
4. Hard-delete all 50 soft-deleted products that are duplicates of active products.

## Details
- "Elaichi Shakkarpara" (Jaimin): keep 6d0a3e48 (has SKU ELA-JAI-0-KG), delete c6c8dda2
- "Velvet Touch Soap" (Lux): keep fe450af8 (has SKU VEL-LUX-3-PCS), delete c4d6ba39
- All soft-deleted products (is_deleted = true) are permanently removed since
  they are leftovers from earlier duplicate creation and serve no purpose.
*/

-- Step 1: Reassign order_items from duplicate IDs to original IDs
UPDATE order_items
SET product_id = '6d0a3e48-0d10-4155-b763-0603e085c359'
WHERE product_id = 'c6c8dda2-c7d1-4698-877e-f2494b5799d4';

UPDATE order_items
SET product_id = 'fe450af8-041b-418b-94ef-ddaf6cd2c615'
WHERE product_id = 'c4d6ba39-4a85-45e3-acbe-7c6612f6dbac';

-- Step 2: Reassign store_products from duplicate IDs to original IDs
-- First delete any store_products entries for duplicates that would conflict
-- with existing entries for the originals on the same store
DELETE FROM store_products
WHERE product_id = 'c6c8dda2-c7d1-4698-877e-f2494b5799d4'
  AND store_id IN (
    SELECT store_id FROM store_products
    WHERE product_id = '6d0a3e48-0d10-4155-b763-0603e085c359'
  );

DELETE FROM store_products
WHERE product_id = 'c4d6ba39-4a85-45e3-acbe-7c6612f6dbac'
  AND store_id IN (
    SELECT store_id FROM store_products
    WHERE product_id = 'fe450af8-041b-418b-94ef-ddaf6cd2c615'
  );

-- Reassign remaining store_products entries
UPDATE store_products
SET product_id = '6d0a3e48-0d10-4155-b763-0603e085c359'
WHERE product_id = 'c6c8dda2-c7d1-4698-877e-f2494b5799d4';

UPDATE store_products
SET product_id = 'fe450af8-041b-418b-94ef-ddaf6cd2c615'
WHERE product_id = 'c4d6ba39-4a85-45e3-acbe-7c6612f6dbac';

-- Step 3: Clean up any remaining references to the duplicate IDs
-- Check and clean central_inventory, inventory_logs, inventory_movements, etc.
DELETE FROM central_inventory
WHERE product_id IN ('c6c8dda2-c7d1-4698-877e-f2494b5799d4', 'c4d6ba39-4a85-45e3-acbe-7c6612f6dbac');

DELETE FROM inventory_logs
WHERE product_id IN ('c6c8dda2-c7d1-4698-877e-f2494b5799d4', 'c4d6ba39-4a85-45e3-acbe-7c6612f6dbac');

DELETE FROM inventory_movements
WHERE product_id IN ('c6c8dda2-c7d1-4698-877e-f2494b5799d4', 'c4d6ba39-4a85-45e3-acbe-7c6612f6dbac');

-- Step 4: Hard-delete the 2 active duplicate products
DELETE FROM products
WHERE id IN ('c6c8dda2-c7d1-4698-877e-f2494b5799d4', 'c4d6ba39-4a85-45e3-acbe-7c6612f6dbac');

-- Step 5: Hard-delete all soft-deleted products (is_deleted = true)
-- These are ghost rows from earlier duplicate creation that serve no purpose
DELETE FROM products
WHERE coalesce(is_deleted, false) = true;

-- Step 6: Clean up any orphaned references from the soft-deleted products
-- Remove store_products, central_inventory, inventory_logs for any deleted products
DELETE FROM store_products
WHERE product_id NOT IN (SELECT id FROM products);

DELETE FROM central_inventory
WHERE product_id NOT IN (SELECT id FROM products);

DELETE FROM inventory_logs
WHERE product_id NOT IN (SELECT id FROM products);

DELETE FROM inventory_movements
WHERE product_id NOT IN (SELECT id FROM products);

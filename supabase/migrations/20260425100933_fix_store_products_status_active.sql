/*
  # Fix store_products status for PocketGrocery

  All 128 existing store_products rows for PocketGrocery have status = 'incomplete'
  which was preventing them from being treated as active listings.
  This sets all active store_product rows to status = 'active'.
*/

UPDATE store_products
SET status = 'active'
WHERE status IS NULL OR status = 'incomplete';

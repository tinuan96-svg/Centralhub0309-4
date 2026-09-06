-- Fix 1: Correct 6 orders with inventory_sync_status='failed' and payment_status='pending'
-- These orders have fulfillment statuses (shipped/confirmed/packing) that imply payment,
-- but payment_status was overwritten to 'pending' by the old sync logic.
-- Set payment_status='paid' so inventory sync can proceed.
UPDATE orders
SET payment_status = 'paid',
    inventory_sync_status = 'pending',
    updated_at = now()
WHERE store_id = (SELECT id FROM stores WHERE slug = 'malluspices')
  AND inventory_sync_status = 'failed'
  AND payment_status = 'pending'
  AND order_status IN ('confirmed', 'shipped', 'packing');

-- Fix 2: Mark the 19 orders with no order_items for re-sync by resetting their
-- updated_at to an old timestamp so the incremental sync re-fetches them.
-- The sync function will then try the WooCommerce fallback tables.
UPDATE orders
SET updated_at = '2020-01-01 00:00:00+00'
WHERE store_id = (SELECT id FROM stores WHERE slug = 'malluspices')
  AND NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = orders.id)
  AND COALESCE(items, '[]'::jsonb) = '[]'::jsonb;

-- Fix 3: Also reset the lastSync checkpoint for malluspices so the next sync
-- re-fetches these orders. We do this by temporarily lowering the updated_at
-- of the most recent malluspices order that has items, so the gte filter
-- catches the 19 missing-item orders.
-- (The orders updated in Fix 2 already have updated_at = 2020-01-01 which is
-- older than any real order, so they will be picked up by the next sync.)

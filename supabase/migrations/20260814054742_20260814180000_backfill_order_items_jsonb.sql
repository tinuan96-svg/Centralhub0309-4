/*
# Backfill orders.items JSONB from order_items table

## Purpose
The sync-orders edge function was writing items to the `order_items` table but
leaving the `items` JSONB column on the `orders` table empty (`[]`). Many pages
in the app (picking detail, order detail, picking summary) read from the `items`
JSONB column directly, causing them to show "no items" for synced orders.

## What this migration does
1. For every order where `items` is an empty array (or null), fetch the
   corresponding rows from `order_items` and populate the `items` JSONB column
   with a denormalized copy.
2. This is a one-time backfill. The sync function has been updated to populate
   `items` going forward, so future synced orders will not need this.

## Safety
- Only updates orders where items is empty/null — does not touch orders that
  already have items in the JSONB column.
- Does not delete or modify any `order_items` rows.
- Read-only with respect to all other tables.
*/

UPDATE orders o
SET items = COALESCE((
  SELECT jsonb_agg(jsonb_build_object(
    'product_id', oi.product_id,
    'name', oi.product_name,
    'image', oi.product_image,
    'quantity', oi.quantity,
    'price', oi.unit_price,
    'subtotal', oi.total_price,
    'brand', oi.brand,
    'weight', oi.weight,
    'unit', oi.unit,
    'picked_quantity', oi.picked_quantity,
    'skip_reason', oi.skip_reason
  ))
  FROM order_items oi
  WHERE oi.order_id = o.id
), '[]'::jsonb)
WHERE COALESCE(o.items, '[]'::jsonb) = '[]'::jsonb
  AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id);
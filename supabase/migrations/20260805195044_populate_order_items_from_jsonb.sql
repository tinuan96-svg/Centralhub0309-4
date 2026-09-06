-- Add picking-related columns to order_items
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS picked_quantity integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_scanned_gtin text,
  ADD COLUMN IF NOT EXISTS picked_at timestamptz,
  ADD COLUMN IF NOT EXISTS skip_reason text,
  ADD COLUMN IF NOT EXISTS picked_by uuid;

-- Populate order_items from the JSONB items column on orders
-- Set product_id to NULL initially (remote product IDs don't match local products)
-- Then link to local products by name match
INSERT INTO order_items (order_id, product_id, product_name, product_image, quantity, unit_price, total_price, cost_price, brand, weight, unit)
SELECT
  o.id,
  p.id,  -- match by name to local products table
  elem->>'name',
  elem->>'image',
  COALESCE((elem->>'quantity')::int, 1),
  COALESCE((elem->>'price')::numeric, 0),
  COALESCE((elem->>'subtotal')::numeric, 0),
  NULLIF(elem->>'cost_price', '')::numeric,
  elem->>'brand',
  elem->>'weight',
  elem->>'unit'
FROM orders o
CROSS JOIN jsonb_array_elements(o.items) AS elem
LEFT JOIN LATERAL (
  SELECT id FROM products WHERE name ILIKE elem->>'name' LIMIT 1
) p ON true
WHERE o.items IS NOT NULL
  AND o.items != '[]'::jsonb
  AND NOT EXISTS (
    SELECT 1 FROM order_items oi WHERE oi.order_id = o.id
  );
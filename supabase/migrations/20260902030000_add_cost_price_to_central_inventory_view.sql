-- central_inventory is a compatibility view over products.
-- Keep products.cost_price as the canonical value while exposing it through
-- the view for dashboard/inventory queries that already use central_inventory.
CREATE OR REPLACE VIEW public.central_inventory AS
SELECT
  p.id,
  p.id AS product_id,
  p.stock AS stock_quantity,
  COALESCE(p.reserved_quantity, 0) AS reserved_quantity,
  COALESCE(p.low_stock_threshold, 5) AS low_stock_threshold,
  p.location_code,
  p.warehouse_zone,
  p.bin_location,
  p.name AS product_name,
  p.sku,
  p.updated_at,
  p.cost_price
FROM public.products p;

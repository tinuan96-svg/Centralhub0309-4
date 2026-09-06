-- Add SKU column to order_items for historical record keeping and better auditing
-- This ensures that even if a product is deleted, we know which SKU was ordered

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'sku') THEN
    ALTER TABLE public.order_items ADD COLUMN sku text;
  END IF;
END $$;

-- Create an index for faster searching by SKU in orders
CREATE INDEX IF NOT EXISTS idx_order_items_sku ON public.order_items(sku);

-- Backfill existing order items by joining with products
UPDATE public.order_items oi
SET sku = p.sku
FROM public.products p
WHERE oi.product_id = p.id AND oi.sku IS NULL;

COMMENT ON COLUMN public.order_items.sku IS 'The SKU of the product at the time of order.';

-- ============================================================
-- ENSURE ORDER_ITEMS TABLE
-- Creates the order_items table if it is missing from the database
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  product_image text,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(10, 2) NOT NULL DEFAULT 0,
  total_price numeric(10, 2) NOT NULL DEFAULT 0,
  cost_price numeric(10, 2),

  -- Picking fields
  picked_quantity integer DEFAULT 0,
  required_quantity integer,
  last_scanned_gtin text,
  picked_at timestamptz,
  picked_by uuid REFERENCES auth.users(id),
  skip_reason text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'order_items'
        AND policyname = 'Admins can manage all order items'
    ) THEN
        CREATE POLICY "Admins can manage all order items"
          ON public.order_items FOR ALL
          TO authenticated
          USING (true)
          WITH CHECK (true);
    END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);

-- Update required_quantity if missing
UPDATE public.order_items SET required_quantity = quantity WHERE required_quantity IS NULL;

-- Enable Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
EXCEPTION WHEN OTHERS THEN
  -- Ignore if table already in publication
  NULL;
END $$;

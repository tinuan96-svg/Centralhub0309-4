-- Add missing columns to orders table to prevent 400 errors and support inventory logic

DO $$
BEGIN
  -- 1. stock_deducted (Required for automated inventory deduction trigger)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'stock_deducted') THEN
    ALTER TABLE public.orders ADD COLUMN stock_deducted boolean DEFAULT false;
  END IF;

  -- 2. total_weight_kg (Used in shipping calculations)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'total_weight_kg') THEN
    ALTER TABLE public.orders ADD COLUMN total_weight_kg numeric(10, 3) DEFAULT 0.5;
  END IF;

  -- 3. picking_duration (Ensure this exists as it's used in performance metrics)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'picking_duration') THEN
    ALTER TABLE public.orders ADD COLUMN picking_duration integer;
  END IF;

  -- 4. warehouse_status (Ensure this exists for fulfillment flow)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'warehouse_status') THEN
    ALTER TABLE public.orders ADD COLUMN warehouse_status text DEFAULT 'pending';
  END IF;
END $$;

-- Update existing orders to have a default weight if missing
UPDATE public.orders SET total_weight_kg = 0.5 WHERE total_weight_kg IS NULL;

-- Ensure picking_duration is nullable
ALTER TABLE public.orders ALTER COLUMN picking_duration DROP NOT NULL;

-- Create index on stock_deducted for performance
CREATE INDEX IF NOT EXISTS idx_orders_stock_deducted ON public.orders(stock_deducted);

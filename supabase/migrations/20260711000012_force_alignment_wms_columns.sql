-- FORCE ALIGNMENT MIGRATION
-- objective: ensure all columns required by the fulfillment and shipping system exist

DO $$
BEGIN
    -- 1. ALIGN ORDERS TABLE
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'warehouse_status') THEN
        ALTER TABLE public.orders ADD COLUMN warehouse_status text DEFAULT 'pending';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'fulfillment_status') THEN
        -- Check if enum exists first
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fulfillment_status') THEN
            CREATE TYPE fulfillment_status AS ENUM ('pending', 'confirmed', 'packed', 'ready_to_ship', 'shipped', 'delivered');
        END IF;
        ALTER TABLE public.orders ADD COLUMN fulfillment_status fulfillment_status DEFAULT 'pending';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'stock_deducted') THEN
        ALTER TABLE public.orders ADD COLUMN stock_deducted boolean DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'total_weight_kg') THEN
        ALTER TABLE public.orders ADD COLUMN total_weight_kg numeric(10,3) DEFAULT 0.5;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'picking_duration') THEN
        ALTER TABLE public.orders ADD COLUMN picking_duration integer;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'packed_at') THEN
        ALTER TABLE public.orders ADD COLUMN packed_at timestamptz;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'ready_to_ship_at') THEN
        ALTER TABLE public.orders ADD COLUMN ready_to_ship_at timestamptz;
    END IF;

    -- 2. ALIGN PRODUCTS TABLE
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'weight_kg') THEN
        ALTER TABLE public.products ADD COLUMN weight_kg numeric(10,3);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'weight_grams') THEN
        ALTER TABLE public.products ADD COLUMN weight_grams integer;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'cost_price') THEN
        ALTER TABLE public.products ADD COLUMN cost_price numeric(10,2) DEFAULT 0;
    END IF;

END $$;

-- 3. ENSURE PERMISSIONS
GRANT ALL ON public.orders TO authenticated;
GRANT ALL ON public.products TO authenticated;
GRANT ALL ON public.order_items TO authenticated;
GRANT ALL ON public.shipments TO authenticated;

-- 4. CLEANUP
-- Ensure existing orders have a valid fulfillment_status if it was added as null
UPDATE public.orders SET fulfillment_status = 'pending' WHERE fulfillment_status IS NULL;
UPDATE public.orders SET warehouse_status = 'pending' WHERE warehouse_status IS NULL;

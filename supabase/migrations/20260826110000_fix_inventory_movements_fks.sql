-- FIX INVENTORY MOVEMENTS FOREIGN KEYS
-- Objective: Ensure PostgREST can resolve relationships for joins used in the Inventory Dashboard.
-- Cleanup: Remove orphaned records that violate integrity before applying constraints.

DO $$
BEGIN
    -- 1. CLEANUP orphaned data
    -- Remove movements referencing products that no longer exist
    DELETE FROM public.inventory_movements WHERE product_id NOT IN (SELECT id FROM public.products);

    -- Nullify invalid order references
    UPDATE public.inventory_movements SET order_id = NULL
    WHERE order_id IS NOT NULL AND order_id NOT IN (SELECT id FROM public.orders);

    -- Nullify invalid supplier references
    UPDATE public.inventory_movements SET supplier_id = NULL
    WHERE supplier_id IS NOT NULL AND supplier_id NOT IN (SELECT id FROM public.suppliers);

    -- Nullify invalid warehouse references
    UPDATE public.inventory_movements SET warehouse_id = NULL
    WHERE warehouse_id IS NOT NULL AND warehouse_id NOT IN (SELECT id FROM public.warehouses);

    -- 2. FIX product_id Reference
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'inventory_movements'
        AND constraint_name = 'inventory_movements_product_id_fkey'
    ) THEN
        ALTER TABLE public.inventory_movements
        ADD CONSTRAINT inventory_movements_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
    END IF;

    -- 3. FIX order_id Reference
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'inventory_movements'
        AND constraint_name = 'inventory_movements_order_id_fkey'
    ) THEN
        ALTER TABLE public.inventory_movements
        ADD CONSTRAINT inventory_movements_order_id_fkey
        FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
    END IF;

    -- 4. FIX supplier_id Reference
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'inventory_movements'
        AND constraint_name = 'inventory_movements_supplier_id_fkey'
    ) THEN
        ALTER TABLE public.inventory_movements
        ADD CONSTRAINT inventory_movements_supplier_id_fkey
        FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;
    END IF;

    -- 5. FIX warehouse_id Reference
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'inventory_movements'
        AND constraint_name = 'inventory_movements_warehouse_id_fkey'
    ) THEN
        ALTER TABLE public.inventory_movements
        ADD CONSTRAINT inventory_movements_warehouse_id_fkey
        FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;
    END IF;

END $$;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

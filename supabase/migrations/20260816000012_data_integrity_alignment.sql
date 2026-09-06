-- Data Integrity Alignment Script
-- Resolves inconsistencies between products, central_inventory, and store_products

-- 1. Create missing central_inventory rows for all active products
INSERT INTO public.central_inventory (product_id, stock_quantity, updated_at)
SELECT
    p.id,
    COALESCE(p.stock, 0),
    now()
FROM public.products p
LEFT JOIN public.central_inventory ci ON ci.product_id = p.id
WHERE (p.is_deleted IS NOT TRUE) AND ci.product_id IS NULL;

-- 2. Sync legacy products.stock with central_inventory source of truth
-- We prioritize central_inventory.stock_quantity if it exists
UPDATE public.products p
SET stock = ci.stock_quantity,
    updated_at = now()
FROM public.central_inventory ci
WHERE p.id = ci.product_id AND (p.stock IS DISTINCT FROM ci.stock_quantity);

-- 3. Auto-assign all active products to all configured stores
-- This ensures that any "orphan" products in the catalog become visible in all stores
-- and re-activates any that were previously assigned but marked inactive.
INSERT INTO public.store_products (product_id, store_id, is_active, updated_at)
SELECT
    p.id,
    s.id,
    true,
    now()
FROM public.products p
CROSS JOIN public.stores s
WHERE (p.is_deleted IS NOT TRUE)
ON CONFLICT (product_id, store_id)
DO UPDATE SET
    is_active = true,
    updated_at = now()
WHERE store_products.is_active IS NOT TRUE;

-- 4. Cleanup any orphaned store_products pointing to deleted products
DELETE FROM public.store_products
WHERE product_id IN (SELECT id FROM public.products WHERE is_deleted = true);

-- 5. Ensure inventory_logs can accept null product_id for system-wide sync logs
ALTER TABLE public.inventory_logs ALTER COLUMN product_id DROP NOT NULL;

-- 6. Final audit log entry for this alignment
INSERT INTO public.inventory_logs (
    type, movement_type, change, reason, notes, created_at
) VALUES (
    'SYNC', 'ADJUSTMENT', 0, 'Data Integrity Alignment',
    'Automated alignment of master catalog, central inventory, and store visibility',
    now()
);

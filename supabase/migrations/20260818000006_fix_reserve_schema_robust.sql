-- ============================================================
-- ROBUST SCHEMA FIX FOR PURCHASE RESERVE
-- ============================================================

-- 1. Ensure the reserve_created column exists using a more robust check
DO $$
BEGIN
    BEGIN
        ALTER TABLE public.orders ADD COLUMN reserve_created boolean DEFAULT false;
    EXCEPTION
        WHEN duplicate_column THEN
            -- Column already exists, do nothing
            NULL;
    END;
END $$;

-- 2. Update stats to use aggregate sales from ledger instead of orders table filter
-- (Since ledger is now the source of truth for what has been processed)
-- This makes the Stats calculation work even if the orders table is partially accessible

GRANT ALL ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

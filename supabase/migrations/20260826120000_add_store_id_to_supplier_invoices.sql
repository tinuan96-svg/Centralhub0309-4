-- ADD STORE_ID TO SUPPLIER INVOICES
-- Objective: Support multi-store isolation for invoice tracking and procurement planning.

DO $$
BEGIN
    -- 1. ADD store_id Column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_invoices' AND column_name = 'store_id') THEN
        ALTER TABLE public.supplier_invoices ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
    END IF;

    -- 2. UPDATE existing records (Backfill)
    -- Try to resolve store_id from linked po_drafts if available
    UPDATE public.supplier_invoices si
    SET store_id = pd.store_id
    FROM public.po_drafts pd
    WHERE si.po_draft_id = pd.id
    AND si.store_id IS NULL;

    -- 3. INDEX for performance
    CREATE INDEX IF NOT EXISTS idx_supplier_invoices_store ON public.supplier_invoices(store_id);

END $$;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

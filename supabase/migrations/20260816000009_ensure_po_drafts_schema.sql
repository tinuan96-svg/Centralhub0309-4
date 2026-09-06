-- ============================================================
-- ENSURE PO_DRAFTS SCHEMA
-- Purpose: Ensure the po_drafts table exists and has all required columns.
-- Also relaxes RLS slightly to ensure the Admin UI can always save drafts.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.po_drafts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
    draft_items jsonb NOT NULL DEFAULT '[]'::jsonb,
    total_amount numeric(12,2) NOT NULL DEFAULT 0,
    trigger_reason text,
    status text NOT NULL DEFAULT 'draft',
    converted_to_po_id uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_po_drafts_supplier_id ON public.po_drafts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_drafts_store_id ON public.po_drafts(store_id);
CREATE INDEX IF NOT EXISTS idx_po_drafts_status ON public.po_drafts(status);

-- Enable RLS
ALTER TABLE public.po_drafts ENABLE ROW LEVEL SECURITY;

-- Robust Policies (Admin and Authenticated access)
DO $$
BEGIN
    DROP POLICY IF EXISTS "Anyone authenticated can manage PO drafts" ON public.po_drafts;
    CREATE POLICY "Anyone authenticated can manage PO drafts"
    ON public.po_drafts FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

    DROP POLICY IF EXISTS "anon_manage_po_drafts" ON public.po_drafts;
    CREATE POLICY "anon_manage_po_drafts"
    ON public.po_drafts FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);
END $$;

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_po_drafts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_po_drafts_timestamp ON public.po_drafts;
CREATE TRIGGER trg_update_po_drafts_timestamp
    BEFORE UPDATE ON public.po_drafts
    FOR EACH ROW
    EXECUTE FUNCTION update_po_drafts_timestamp();

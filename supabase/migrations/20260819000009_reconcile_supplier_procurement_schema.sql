-- Reconcile Supplier Procurement Schema
-- This migration ensures that both versions of the procurement migrations work together
-- and that all columns required by the application services exist.

DO $$
BEGIN
    -- 1. Reconcile supplier_invoices statuses
    -- Remove the restrictive constraint if it exists
    ALTER TABLE IF EXISTS public.supplier_invoices DROP CONSTRAINT IF EXISTS supplier_invoices_status_check;

    -- Ensure status column exists and has a standard default
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_invoices' AND column_name = 'status') THEN
        ALTER TABLE public.supplier_invoices ADD COLUMN status text NOT NULL DEFAULT 'draft';
    END IF;

    -- 2. Add missing columns to supplier_invoices
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_invoices' AND column_name = 'amount_paid') THEN
        ALTER TABLE public.supplier_invoices ADD COLUMN amount_paid numeric(10,2) NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_invoices' AND column_name = 'file_url') THEN
        ALTER TABLE public.supplier_invoices ADD COLUMN file_url text;
    END IF;

    -- 3. Reconcile supplier_invoice_items columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_invoice_items' AND column_name = 'unit_cost') THEN
        ALTER TABLE public.supplier_invoice_items ADD COLUMN unit_cost numeric(10,2) NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_invoice_items' AND column_name = 'agreed_price') THEN
        ALTER TABLE public.supplier_invoice_items ADD COLUMN agreed_price numeric(10,2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_invoice_items' AND column_name = 'invoiced_price') THEN
        ALTER TABLE public.supplier_invoice_items ADD COLUMN invoiced_price numeric(10,2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_invoice_items' AND column_name = 'discrepancy_found') THEN
        ALTER TABLE public.supplier_invoice_items ADD COLUMN discrepancy_found boolean DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_invoice_items' AND column_name = 'is_verified') THEN
        ALTER TABLE public.supplier_invoice_items ADD COLUMN is_verified boolean DEFAULT false;
    END IF;

    -- 4. Sync unit_cost and agreed_price if one is missing but other is present
    UPDATE public.supplier_invoice_items SET agreed_price = unit_cost WHERE agreed_price = 0 AND unit_cost > 0;
    UPDATE public.supplier_invoice_items SET unit_cost = agreed_price WHERE unit_cost = 0 AND agreed_price > 0;

END $$;

-- 5. Final Status Constraint for Supplier Invoices (Comprehensive)
ALTER TABLE public.supplier_invoices ADD CONSTRAINT supplier_invoices_status_check
CHECK (status IN ('draft', 'received', 'approved', 'paid', 'disputed', 'cancelled', 'completed'));

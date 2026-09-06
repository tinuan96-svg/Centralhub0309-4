-- Procurement Engine Evidence and Auditing
-- This migration adds columns to backorder_plan_items to store the reasoning and components
-- of the procurement calculation for auditing and transparency.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'backorder_plan_items' AND column_name = 'lead_time_demand') THEN
        ALTER TABLE public.backorder_plan_items ADD COLUMN lead_time_demand numeric DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'backorder_plan_items' AND column_name = 'safety_stock') THEN
        ALTER TABLE public.backorder_plan_items ADD COLUMN safety_stock numeric DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'backorder_plan_items' AND column_name = 'forward_coverage_demand') THEN
        ALTER TABLE public.backorder_plan_items ADD COLUMN forward_coverage_demand numeric DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'backorder_plan_items' AND column_name = 'backorder_debt') THEN
        ALTER TABLE public.backorder_plan_items ADD COLUMN backorder_debt numeric DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'backorder_plan_items' AND column_name = 'on_po_quantity') THEN
        ALTER TABLE public.backorder_plan_items ADD COLUMN on_po_quantity numeric DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'backorder_plan_items' AND column_name = 'reasoning') THEN
        ALTER TABLE public.backorder_plan_items ADD COLUMN reasoning text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'backorder_plan_items' AND column_name = 'priority_score') THEN
        ALTER TABLE public.backorder_plan_items ADD COLUMN priority_score integer DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'backorder_plan_items' AND column_name = 'status_label') THEN
        ALTER TABLE public.backorder_plan_items ADD COLUMN status_label text;
    END IF;
END $$;

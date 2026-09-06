/*
# Phase 1 Procurement Enhancements

1. Changes
  - Add `import_instructions` (jsonb) to `suppliers` table.
  - Enhance `product_suppliers` with more supplier-specific fields:
    - `supplier_product_name` (text)
    - `supplier_barcode` (text)
    - `pack_size` (integer)
    - `case_quantity` (integer)
    - `vat_rate` (numeric)
    - `is_active` (boolean, default true)
*/

-- 1. Add import_instructions to suppliers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'import_instructions') THEN
    ALTER TABLE public.suppliers ADD COLUMN import_instructions jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- 2. Enhance product_suppliers with more fields
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_suppliers' AND column_name = 'supplier_product_name') THEN
    ALTER TABLE public.product_suppliers ADD COLUMN supplier_product_name text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_suppliers' AND column_name = 'supplier_barcode') THEN
    ALTER TABLE public.product_suppliers ADD COLUMN supplier_barcode text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_suppliers' AND column_name = 'pack_size') THEN
    ALTER TABLE public.product_suppliers ADD COLUMN pack_size integer DEFAULT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_suppliers' AND column_name = 'case_quantity') THEN
    ALTER TABLE public.product_suppliers ADD COLUMN case_quantity integer DEFAULT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_suppliers' AND column_name = 'vat_rate') THEN
    ALTER TABLE public.product_suppliers ADD COLUMN vat_rate numeric(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_suppliers' AND column_name = 'is_active') THEN
    ALTER TABLE public.product_suppliers ADD COLUMN is_active boolean DEFAULT true;
  END IF;
END $$;

-- Add indexes for fast lookup by supplier-specific barcode or SKU
CREATE INDEX IF NOT EXISTS idx_product_suppliers_sku ON product_suppliers(supplier_sku);
CREATE INDEX IF NOT EXISTS idx_product_suppliers_barcode ON product_suppliers(supplier_barcode);
CREATE INDEX IF NOT EXISTS idx_product_suppliers_active ON product_suppliers(is_active) WHERE is_active = true;

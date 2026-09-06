/*
# Supplier Procurement Upgrade

1. New Tables
  - `supplier_price_list_history` - Tracks every uploaded price list and overall change stats.
  - `supplier_invoices` - Records of Goods Received (GRN).
  - `supplier_invoice_items` - Individual scanned items within a GRN.

2. Table Enhancements
  - `product_suppliers`: Add `previous_cost_price` to track changes.
*/

-- 1. Supplier Price List History
CREATE TABLE IF NOT EXISTS supplier_price_list_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  file_name text,
  total_items integer DEFAULT 0,
  increased_prices integer DEFAULT 0,
  decreased_prices integer DEFAULT 0,
  new_items integer DEFAULT 0,
  applied_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- 2. Supplier Invoices (GRN)
CREATE TABLE IF NOT EXISTS supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  invoice_date date DEFAULT CURRENT_DATE,
  total_amount numeric(10,2) DEFAULT 0,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'cancelled')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Supplier Invoice Items (GRN Items)
CREATE TABLE IF NOT EXISTS supplier_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  supplier_sku text,
  product_name text,
  quantity integer NOT NULL DEFAULT 1,
  agreed_price numeric(10,2) DEFAULT 0, -- Price from our system
  invoiced_price numeric(10,2) DEFAULT 0, -- Price actually charged on invoice
  discrepancy_found boolean DEFAULT false,
  is_verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 4. Enhance product_suppliers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_suppliers' AND column_name = 'previous_cost_price') THEN
    ALTER TABLE public.product_suppliers ADD COLUMN previous_cost_price numeric(10,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_suppliers' AND column_name = 'last_price_update') THEN
    ALTER TABLE public.product_suppliers ADD COLUMN last_price_update timestamptz;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE supplier_price_list_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoice_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Allow all for now to ensure site functionality, matching existing patterns)
CREATE POLICY "Allow all on supplier_price_list_history" ON supplier_price_list_history FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on supplier_invoices" ON supplier_invoices FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on supplier_invoice_items" ON supplier_invoice_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier ON supplier_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_items_invoice ON supplier_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_items_product ON supplier_invoice_items(product_id);

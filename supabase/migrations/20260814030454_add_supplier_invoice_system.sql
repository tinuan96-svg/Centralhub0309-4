/*
# Supplier Invoice Processing System

## Purpose
Creates a full invoice processing workflow for supplier purchases. Invoices are
linked to PO drafts (from backorder planning) and/or suppliers directly. Each
invoice contains line items that can be matched against received goods. Invoices
flow through statuses: draft -> received -> approved -> paid (or disputed).

## New Tables

### 1. supplier_invoices
- `id` (uuid, PK)
- `invoice_number` (text, not null) — supplier's invoice reference number
- `supplier_id` (uuid, FK to suppliers, not null)
- `po_draft_id` (uuid, FK to po_drafts, nullable) — optional link to the PO draft that triggered this invoice
- `status` (text, not null, default 'draft') — one of: draft, received, approved, paid, disputed, cancelled
- `invoice_date` (date, not null) — date on the invoice
- `due_date` (date, nullable) — calculated from supplier payment_terms if not provided
- `subtotal` (numeric, not null, default 0) — sum of line items before tax
- `tax_amount` (numeric, not null, default 0)
- `shipping_cost` (numeric, not null, default 0)
- `total_amount` (numeric, not null, default 0) — subtotal + tax + shipping
- `amount_paid` (numeric, not null, default 0)
- `currency` (text, default 'USD')
- `notes` (text, nullable)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### 2. supplier_invoice_items
- `id` (uuid, PK)
- `invoice_id` (uuid, FK to supplier_invoices, not null, ON DELETE CASCADE)
- `product_id` (uuid, FK to products, nullable) — the product being invoiced
- `product_name` (text, not null) — denormalized for history
- `quantity` (integer, not null, default 0) — units ordered
- `received_quantity` (integer, not null, default 0) — units actually received
- `unit_cost` (numeric, not null, default 0) — cost per unit
- `pack_size` (integer, default 1)
- `packs` (integer, not null, default 0) — number of packs
- `line_total` (numeric, not null, default 0) — quantity * unit_cost
- `created_at` (timestamptz, default now())

## Security
- RLS enabled on both tables.
- Policies allow anon + authenticated CRUD (single-tenant admin app, no user-level isolation).
- All data is intentionally shared across the admin team.
*/

-- Main invoices table
CREATE TABLE IF NOT EXISTS supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  po_draft_id uuid REFERENCES po_drafts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  shipping_cost numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_supplier_invoices" ON supplier_invoices;
CREATE POLICY "anon_select_supplier_invoices" ON supplier_invoices FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_supplier_invoices" ON supplier_invoices;
CREATE POLICY "anon_insert_supplier_invoices" ON supplier_invoices FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_supplier_invoices" ON supplier_invoices;
CREATE POLICY "anon_update_supplier_invoices" ON supplier_invoices FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_supplier_invoices" ON supplier_invoices;
CREATE POLICY "anon_delete_supplier_invoices" ON supplier_invoices FOR DELETE
  TO anon, authenticated USING (true);

-- Invoice line items table
CREATE TABLE IF NOT EXISTS supplier_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  received_quantity integer NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  pack_size integer NOT NULL DEFAULT 1,
  packs integer NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE supplier_invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_supplier_invoice_items" ON supplier_invoice_items;
CREATE POLICY "anon_select_supplier_invoice_items" ON supplier_invoice_items FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_supplier_invoice_items" ON supplier_invoice_items;
CREATE POLICY "anon_insert_supplier_invoice_items" ON supplier_invoice_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_supplier_invoice_items" ON supplier_invoice_items;
CREATE POLICY "anon_update_supplier_invoice_items" ON supplier_invoice_items FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_supplier_invoice_items" ON supplier_invoice_items;
CREATE POLICY "anon_delete_supplier_invoice_items" ON supplier_invoice_items FOR DELETE
  TO anon, authenticated USING (true);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier_id ON supplier_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_status ON supplier_invoices(status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_po_draft_id ON supplier_invoices(po_draft_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_items_invoice_id ON supplier_invoice_items(invoice_id);

-- Auto-update updated_at on invoice changes
CREATE OR REPLACE FUNCTION update_supplier_invoice_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_supplier_invoice_updated_at ON supplier_invoices;
CREATE TRIGGER trg_supplier_invoice_updated_at
  BEFORE UPDATE ON supplier_invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_supplier_invoice_updated_at();

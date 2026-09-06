/*
  # VAT Management & Tax Compliance System

  1. Product Tax Configuration
    - Extend `products` table with VAT fields
      - `taxable` - Whether product is subject to VAT
      - `vat_rate` - VAT percentage (default 20%)
      - `tax_category` - standard/reduced/zero/exempt
  
  2. Sales VAT Tracking (Output VAT)
    - Extend `orders` table with VAT breakdown
      - `total_net` - Order total excluding VAT
      - `total_vat` - Total VAT charged
      - `total_gross` - Order total including VAT
      - `vat_breakdown` - JSON breakdown per rate
  
  3. Input VAT Tracking
    - Create `expenses` table
      - Track all business expenses
      - Capture input VAT from suppliers
      - Support invoice attachments
      - Link to suppliers and purchase orders
    
    - Extend `gateway_transactions` with VAT
      - VAT on payment gateway fees
  
  4. VAT Calculations & Reporting
    - Create `vat_calculations` table
      - Period-based VAT calculations
      - Output VAT vs Input VAT
      - Net VAT position
    
  5. Audit Trail
    - Create `vat_audit_log` table
      - Track all VAT-related changes
      - User actions and timestamps
      - Before/after values
  
  6. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users
  
  7. Performance
    - Indexes on frequently queried fields
    - JSON indexes for breakdowns
*/

-- =============================================
-- 1. EXTEND PRODUCTS TABLE WITH VAT FIELDS
-- =============================================
DO $$
BEGIN
  -- Add taxable flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'taxable'
  ) THEN
    ALTER TABLE products ADD COLUMN taxable boolean DEFAULT true;
  END IF;

  -- Add vat_rate
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'vat_rate'
  ) THEN
    ALTER TABLE products ADD COLUMN vat_rate decimal(5,2) DEFAULT 20.00;
  END IF;

  -- Add tax_category
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'tax_category'
  ) THEN
    ALTER TABLE products ADD COLUMN tax_category text DEFAULT 'standard' 
      CHECK (tax_category IN ('standard', 'reduced', 'zero', 'exempt'));
  END IF;
END $$;

-- =============================================
-- 2. EXTEND ORDERS TABLE WITH VAT FIELDS
-- =============================================
DO $$
BEGIN
  -- Add total_net
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'total_net'
  ) THEN
    ALTER TABLE orders ADD COLUMN total_net decimal(10,2) DEFAULT 0;
  END IF;

  -- Add total_vat
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'total_vat'
  ) THEN
    ALTER TABLE orders ADD COLUMN total_vat decimal(10,2) DEFAULT 0;
  END IF;

  -- Add total_gross
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'total_gross'
  ) THEN
    ALTER TABLE orders ADD COLUMN total_gross decimal(10,2) DEFAULT 0;
  END IF;

  -- Add vat_breakdown JSON
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'vat_breakdown'
  ) THEN
    ALTER TABLE orders ADD COLUMN vat_breakdown jsonb DEFAULT '{}';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_total_vat ON orders(total_vat);
CREATE INDEX IF NOT EXISTS idx_orders_vat_breakdown ON orders USING gin(vat_breakdown);

-- =============================================
-- 3. EXPENSES TABLE (INPUT VAT TRACKING)
-- =============================================
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  expense_type text NOT NULL CHECK (expense_type IN ('supplier_purchase', 'gateway_fees', 'packaging', 'shipping', 'operational', 'other')),
  vendor_name text NOT NULL,
  invoice_number text,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  amount_net decimal(10,2) NOT NULL,
  vat_rate decimal(5,2) NOT NULL DEFAULT 20.00,
  vat_amount decimal(10,2) NOT NULL DEFAULT 0,
  amount_gross decimal(10,2) NOT NULL,
  description text,
  invoice_attachment_url text,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_order_id uuid,
  payment_status text DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'partially_paid')),
  payment_date date,
  notes text,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_store ON expenses(store_id);
CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(expense_type);
CREATE INDEX IF NOT EXISTS idx_expenses_supplier ON expenses(supplier_id);
CREATE INDEX IF NOT EXISTS idx_expenses_invoice_date ON expenses(invoice_date);
CREATE INDEX IF NOT EXISTS idx_expenses_payment_status ON expenses(payment_status);

-- =============================================
-- 4. EXTEND GATEWAY TRANSACTIONS WITH VAT
-- =============================================
DO $$
BEGIN
  -- Add vat_on_fee
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'gateway_transactions' AND column_name = 'vat_on_fee'
  ) THEN
    ALTER TABLE gateway_transactions ADD COLUMN vat_on_fee decimal(10,2) DEFAULT 0;
  END IF;

  -- Add net_fee
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'gateway_transactions' AND column_name = 'net_fee'
  ) THEN
    ALTER TABLE gateway_transactions ADD COLUMN net_fee decimal(10,2) DEFAULT 0;
  END IF;
END $$;

-- =============================================
-- 5. VAT CALCULATIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS vat_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'custom')),
  
  -- Output VAT (Sales)
  total_sales_net decimal(12,2) NOT NULL DEFAULT 0,
  total_sales_vat decimal(12,2) NOT NULL DEFAULT 0,
  total_sales_gross decimal(12,2) NOT NULL DEFAULT 0,
  
  -- VAT breakdown by rate
  vat_20_percent_sales decimal(12,2) DEFAULT 0,
  vat_5_percent_sales decimal(12,2) DEFAULT 0,
  vat_0_percent_sales decimal(12,2) DEFAULT 0,
  exempt_sales decimal(12,2) DEFAULT 0,
  
  -- Input VAT (Purchases & Expenses)
  total_purchases_net decimal(12,2) NOT NULL DEFAULT 0,
  total_purchases_vat decimal(12,2) NOT NULL DEFAULT 0,
  total_purchases_gross decimal(12,2) NOT NULL DEFAULT 0,
  
  -- Net VAT Position
  net_vat_payable decimal(12,2) NOT NULL DEFAULT 0,
  vat_status text CHECK (vat_status IN ('payable', 'reclaimable', 'nil')),
  
  -- Metadata
  calculation_date timestamptz DEFAULT now(),
  submitted_to_hmrc boolean DEFAULT false,
  submission_date timestamptz,
  submitted_by text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(store_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_vat_calculations_store ON vat_calculations(store_id);
CREATE INDEX IF NOT EXISTS idx_vat_calculations_period ON vat_calculations(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_vat_calculations_status ON vat_calculations(vat_status);

-- =============================================
-- 6. VAT AUDIT LOG TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS vat_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('product', 'order', 'expense', 'vat_calculation', 'gateway_transaction')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete', 'vat_override', 'rate_change', 'category_change')),
  field_changed text,
  value_before text,
  value_after text,
  user_id text NOT NULL,
  user_email text,
  reason text,
  timestamp timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vat_audit_store ON vat_audit_log(store_id);
CREATE INDEX IF NOT EXISTS idx_vat_audit_entity ON vat_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_vat_audit_user ON vat_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_vat_audit_timestamp ON vat_audit_log(timestamp);

-- =============================================
-- 7. VAT RECONCILIATION TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS vat_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  reconciliation_date date NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  
  -- System calculations
  system_output_vat decimal(12,2) NOT NULL,
  system_input_vat decimal(12,2) NOT NULL,
  system_net_vat decimal(12,2) NOT NULL,
  
  -- Actual records
  actual_output_vat decimal(12,2),
  actual_input_vat decimal(12,2),
  actual_net_vat decimal(12,2),
  
  -- Discrepancies
  output_vat_difference decimal(12,2),
  input_vat_difference decimal(12,2),
  net_vat_difference decimal(12,2),
  
  -- Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'discrepancy', 'resolved')),
  discrepancy_notes text,
  resolved_by text,
  resolved_at timestamptz,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vat_reconciliation_store ON vat_reconciliation(store_id);
CREATE INDEX IF NOT EXISTS idx_vat_reconciliation_period ON vat_reconciliation(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_vat_reconciliation_status ON vat_reconciliation(status);

-- =============================================
-- 8. ENABLE ROW LEVEL SECURITY
-- =============================================
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_reconciliation ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 9. RLS POLICIES - EXPENSES
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view expenses" ON expenses;
CREATE POLICY "Authenticated users can view expenses"
  ON expenses FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert expenses" ON expenses;
CREATE POLICY "Authenticated users can insert expenses"
  ON expenses FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update expenses" ON expenses;
CREATE POLICY "Authenticated users can update expenses"
  ON expenses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete expenses" ON expenses;
CREATE POLICY "Authenticated users can delete expenses"
  ON expenses FOR DELETE TO authenticated USING (true);

-- =============================================
-- 10. RLS POLICIES - VAT CALCULATIONS
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view vat calculations" ON vat_calculations;
CREATE POLICY "Authenticated users can view vat calculations"
  ON vat_calculations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert vat calculations" ON vat_calculations;
CREATE POLICY "Authenticated users can insert vat calculations"
  ON vat_calculations FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update vat calculations" ON vat_calculations;
CREATE POLICY "Authenticated users can update vat calculations"
  ON vat_calculations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete vat calculations" ON vat_calculations;
CREATE POLICY "Authenticated users can delete vat calculations"
  ON vat_calculations FOR DELETE TO authenticated USING (true);

-- =============================================
-- 11. RLS POLICIES - VAT AUDIT LOG
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view vat audit log" ON vat_audit_log;
CREATE POLICY "Authenticated users can view vat audit log"
  ON vat_audit_log FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert vat audit log" ON vat_audit_log;
CREATE POLICY "Authenticated users can insert vat audit log"
  ON vat_audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- =============================================
-- 12. RLS POLICIES - VAT RECONCILIATION
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view vat reconciliation" ON vat_reconciliation;
CREATE POLICY "Authenticated users can view vat reconciliation"
  ON vat_reconciliation FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert vat reconciliation" ON vat_reconciliation;
CREATE POLICY "Authenticated users can insert vat reconciliation"
  ON vat_reconciliation FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update vat reconciliation" ON vat_reconciliation;
CREATE POLICY "Authenticated users can update vat reconciliation"
  ON vat_reconciliation FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete vat reconciliation" ON vat_reconciliation;
CREATE POLICY "Authenticated users can delete vat reconciliation"
  ON vat_reconciliation FOR DELETE TO authenticated USING (true);

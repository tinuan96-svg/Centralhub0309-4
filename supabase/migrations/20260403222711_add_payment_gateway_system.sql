/*
  # Payment Gateway Management System

  1. New Tables
    - `payment_gateways`
      - Gateway configuration per store (Stripe, PayPal, Razorpay, etc.)
      - Settlement cycles and status tracking
    
    - `gateway_fee_rules`
      - Fee structure per payment method
      - Supports percentage, fixed, or mixed fee models
      - International and currency conversion fees
      - Date-based rule effectiveness
    
    - `gateway_transactions`
      - Transaction-level tracking for every order
      - Fee application and payout reconciliation
      - Links orders to gateway payouts
    
    - `payout_batches`
      - Batch settlement tracking
      - Reconciliation status management
      - Mismatch detection

  2. Extensions to Existing Tables
    - `orders` - Add payment gateway fields
      - Gateway association
      - Fee tracking (estimated vs actual)
      - Payout status and margin calculations

  3. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users

  4. Performance
    - Indexes on frequently queried fields
    - Foreign key constraints for data integrity
*/

-- =============================================
-- 1. PAYMENT GATEWAYS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS payment_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  gateway_name text NOT NULL,
  settlement_cycle_days integer NOT NULL DEFAULT 2,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  api_key_encrypted text,
  webhook_secret text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(store_id, gateway_name)
);

CREATE INDEX IF NOT EXISTS idx_payment_gateways_store ON payment_gateways(store_id);
CREATE INDEX IF NOT EXISTS idx_payment_gateways_status ON payment_gateways(status) WHERE status = 'active';

-- =============================================
-- 2. GATEWAY FEE RULES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS gateway_fee_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid NOT NULL REFERENCES payment_gateways(id) ON DELETE CASCADE,
  payment_method text NOT NULL,
  fee_type text NOT NULL CHECK (fee_type IN ('percentage', 'fixed', 'mixed')),
  percentage_fee decimal(5,2) DEFAULT 0,
  fixed_fee decimal(10,2) DEFAULT 0,
  min_fee decimal(10,2),
  max_fee decimal(10,2),
  international_fee_percentage decimal(5,2),
  currency_conversion_fee decimal(5,2),
  effective_from date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gateway_fee_rules_gateway ON gateway_fee_rules(gateway_id);
CREATE INDEX IF NOT EXISTS idx_gateway_fee_rules_method ON gateway_fee_rules(payment_method);
CREATE INDEX IF NOT EXISTS idx_gateway_fee_rules_effective ON gateway_fee_rules(effective_from);

-- =============================================
-- 3. GATEWAY TRANSACTIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS gateway_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  gateway_id uuid REFERENCES payment_gateways(id) ON DELETE SET NULL,
  payment_method text NOT NULL,
  order_amount decimal(10,2) NOT NULL,
  fee_applied decimal(10,2) DEFAULT 0,
  expected_payout decimal(10,2) NOT NULL,
  actual_payout decimal(10,2),
  payout_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'failed', 'disputed')),
  reference_id text,
  batch_id uuid,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gateway_transactions_store ON gateway_transactions(store_id);
CREATE INDEX IF NOT EXISTS idx_gateway_transactions_order ON gateway_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_gateway_transactions_gateway ON gateway_transactions(gateway_id);
CREATE INDEX IF NOT EXISTS idx_gateway_transactions_status ON gateway_transactions(status);
CREATE INDEX IF NOT EXISTS idx_gateway_transactions_reference ON gateway_transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_gateway_transactions_payout_date ON gateway_transactions(payout_date);

-- =============================================
-- 4. PAYOUT BATCHES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS payout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  gateway_id uuid REFERENCES payment_gateways(id) ON DELETE SET NULL,
  batch_reference text NOT NULL,
  total_expected_amount decimal(12,2) NOT NULL DEFAULT 0,
  total_actual_amount decimal(12,2) NOT NULL DEFAULT 0,
  total_fees decimal(12,2) NOT NULL DEFAULT 0,
  transaction_count integer DEFAULT 0,
  settlement_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reconciled', 'mismatch', 'failed')),
  mismatch_amount decimal(12,2) DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(store_id, batch_reference)
);

CREATE INDEX IF NOT EXISTS idx_payout_batches_store ON payout_batches(store_id);
CREATE INDEX IF NOT EXISTS idx_payout_batches_gateway ON payout_batches(gateway_id);
CREATE INDEX IF NOT EXISTS idx_payout_batches_status ON payout_batches(status);
CREATE INDEX IF NOT EXISTS idx_payout_batches_settlement_date ON payout_batches(settlement_date);

-- =============================================
-- 5. EXTEND ORDERS TABLE
-- =============================================
DO $$
BEGIN
  -- Add gateway_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'gateway_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN gateway_id uuid REFERENCES payment_gateways(id) ON DELETE SET NULL;
  END IF;

  -- Add payment_method
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE orders ADD COLUMN payment_method text DEFAULT 'card';
  END IF;

  -- Add gateway_fee_estimated
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'gateway_fee_estimated'
  ) THEN
    ALTER TABLE orders ADD COLUMN gateway_fee_estimated decimal(10,2) DEFAULT 0;
  END IF;

  -- Add gateway_fee_actual
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'gateway_fee_actual'
  ) THEN
    ALTER TABLE orders ADD COLUMN gateway_fee_actual decimal(10,2);
  END IF;

  -- Add expected_payout
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'expected_payout'
  ) THEN
    ALTER TABLE orders ADD COLUMN expected_payout decimal(10,2);
  END IF;

  -- Add actual_payout
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'actual_payout'
  ) THEN
    ALTER TABLE orders ADD COLUMN actual_payout decimal(10,2);
  END IF;

  -- Add payout_status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'payout_status'
  ) THEN
    ALTER TABLE orders ADD COLUMN payout_status text DEFAULT 'pending';
  END IF;

  -- Add margin_after_gateway
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'margin_after_gateway'
  ) THEN
    ALTER TABLE orders ADD COLUMN margin_after_gateway decimal(10,2);
  END IF;
END $$;

-- Create index on orders.gateway_id
CREATE INDEX IF NOT EXISTS idx_orders_gateway ON orders(gateway_id);
CREATE INDEX IF NOT EXISTS idx_orders_payout_status ON orders(payout_status);

-- =============================================
-- 6. GATEWAY FEE STATISTICS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS gateway_fee_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  gateway_id uuid REFERENCES payment_gateways(id) ON DELETE CASCADE,
  payment_method text NOT NULL,
  avg_fee_percentage decimal(5,2) NOT NULL,
  total_transactions integer NOT NULL DEFAULT 0,
  last_calculated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, gateway_id, payment_method)
);

CREATE INDEX IF NOT EXISTS idx_gateway_fee_stats_store_gateway ON gateway_fee_statistics(store_id, gateway_id);

-- =============================================
-- 7. ENABLE ROW LEVEL SECURITY
-- =============================================
ALTER TABLE payment_gateways ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_fee_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_fee_statistics ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 8. RLS POLICIES - PAYMENT GATEWAYS
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view payment gateways" ON payment_gateways;
CREATE POLICY "Authenticated users can view payment gateways"
  ON payment_gateways FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert payment gateways" ON payment_gateways;
CREATE POLICY "Authenticated users can insert payment gateways"
  ON payment_gateways FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update payment gateways" ON payment_gateways;
CREATE POLICY "Authenticated users can update payment gateways"
  ON payment_gateways FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete payment gateways" ON payment_gateways;
CREATE POLICY "Authenticated users can delete payment gateways"
  ON payment_gateways FOR DELETE TO authenticated USING (true);

-- =============================================
-- 9. RLS POLICIES - GATEWAY FEE RULES
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view gateway fee rules" ON gateway_fee_rules;
CREATE POLICY "Authenticated users can view gateway fee rules"
  ON gateway_fee_rules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert gateway fee rules" ON gateway_fee_rules;
CREATE POLICY "Authenticated users can insert gateway fee rules"
  ON gateway_fee_rules FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update gateway fee rules" ON gateway_fee_rules;
CREATE POLICY "Authenticated users can update gateway fee rules"
  ON gateway_fee_rules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete gateway fee rules" ON gateway_fee_rules;
CREATE POLICY "Authenticated users can delete gateway fee rules"
  ON gateway_fee_rules FOR DELETE TO authenticated USING (true);

-- =============================================
-- 10. RLS POLICIES - GATEWAY TRANSACTIONS
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view gateway transactions" ON gateway_transactions;
CREATE POLICY "Authenticated users can view gateway transactions"
  ON gateway_transactions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert gateway transactions" ON gateway_transactions;
CREATE POLICY "Authenticated users can insert gateway transactions"
  ON gateway_transactions FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update gateway transactions" ON gateway_transactions;
CREATE POLICY "Authenticated users can update gateway transactions"
  ON gateway_transactions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete gateway transactions" ON gateway_transactions;
CREATE POLICY "Authenticated users can delete gateway transactions"
  ON gateway_transactions FOR DELETE TO authenticated USING (true);

-- =============================================
-- 11. RLS POLICIES - PAYOUT BATCHES
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view payout batches" ON payout_batches;
CREATE POLICY "Authenticated users can view payout batches"
  ON payout_batches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert payout batches" ON payout_batches;
CREATE POLICY "Authenticated users can insert payout batches"
  ON payout_batches FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update payout batches" ON payout_batches;
CREATE POLICY "Authenticated users can update payout batches"
  ON payout_batches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete payout batches" ON payout_batches;
CREATE POLICY "Authenticated users can delete payout batches"
  ON payout_batches FOR DELETE TO authenticated USING (true);

-- =============================================
-- 12. RLS POLICIES - GATEWAY FEE STATISTICS
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view gateway fee statistics" ON gateway_fee_statistics;
CREATE POLICY "Authenticated users can view gateway fee statistics"
  ON gateway_fee_statistics FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert gateway fee statistics" ON gateway_fee_statistics;
CREATE POLICY "Authenticated users can insert gateway fee statistics"
  ON gateway_fee_statistics FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update gateway fee statistics" ON gateway_fee_statistics;
CREATE POLICY "Authenticated users can update gateway fee statistics"
  ON gateway_fee_statistics FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete gateway fee statistics" ON gateway_fee_statistics;
CREATE POLICY "Authenticated users can delete gateway fee statistics"
  ON gateway_fee_statistics FOR DELETE TO authenticated USING (true);

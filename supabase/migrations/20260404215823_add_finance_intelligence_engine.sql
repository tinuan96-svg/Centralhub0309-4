/*
  # Add Finance Intelligence Engine

  1. New Tables
    - `reconciliation_records` - Track payout reconciliation
      - id, date, gateway, expected_amount, actual_amount, difference
      - status, matched_transaction_ids, notes, store_id
    
    - `cashflow_predictions` - AI-powered cashflow forecasting
      - id, store_id, prediction_date, predicted_balance
      - predicted_inflow, predicted_outflow, confidence_score
      - created_at

  2. Purpose
    - Match expected payouts with actual bank credits
    - Predict future cash positions using AI/ML
    - Enable proactive financial management
    - Track reconciliation accuracy

  3. Security
    - Enable RLS on all tables
    - Only authenticated users can access their store data
*/

-- Create reconciliation_records table
CREATE TABLE IF NOT EXISTS reconciliation_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  reconciliation_date date NOT NULL,
  gateway text NOT NULL,
  expected_amount numeric(15,2) NOT NULL DEFAULT 0,
  actual_amount numeric(15,2) NOT NULL DEFAULT 0,
  difference numeric(15,2) GENERATED ALWAYS AS (actual_amount - expected_amount) STORED,
  status text NOT NULL CHECK (status IN ('matched', 'mismatch', 'missing', 'pending')),
  matched_transaction_ids uuid[] DEFAULT ARRAY[]::uuid[],
  matched_order_ids uuid[] DEFAULT ARRAY[]::uuid[],
  notes text,
  settlement_period_start date,
  settlement_period_end date,
  currency text DEFAULT 'GBP',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create cashflow_predictions table
CREATE TABLE IF NOT EXISTS cashflow_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  prediction_date date NOT NULL,
  predicted_balance numeric(15,2) NOT NULL,
  predicted_inflow numeric(15,2) NOT NULL,
  predicted_outflow numeric(15,2) NOT NULL,
  confidence_score numeric(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  factors jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reconciliation_store_date ON reconciliation_records(store_id, reconciliation_date DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_status ON reconciliation_records(status) WHERE status != 'matched';
CREATE INDEX IF NOT EXISTS idx_reconciliation_gateway ON reconciliation_records(gateway);
CREATE INDEX IF NOT EXISTS idx_cashflow_store_date ON cashflow_predictions(store_id, prediction_date);

-- Enable RLS
ALTER TABLE reconciliation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow_predictions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for reconciliation_records
CREATE POLICY "Users can view own store reconciliation records"
  ON reconciliation_records FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT id FROM stores WHERE id = reconciliation_records.store_id
    )
  );

CREATE POLICY "Users can insert own store reconciliation records"
  ON reconciliation_records FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id IN (
      SELECT id FROM stores WHERE id = reconciliation_records.store_id
    )
  );

CREATE POLICY "Users can update own store reconciliation records"
  ON reconciliation_records FOR UPDATE
  TO authenticated
  USING (
    store_id IN (
      SELECT id FROM stores WHERE id = reconciliation_records.store_id
    )
  )
  WITH CHECK (
    store_id IN (
      SELECT id FROM stores WHERE id = reconciliation_records.store_id
    )
  );

-- RLS Policies for cashflow_predictions
CREATE POLICY "Users can view own store cashflow predictions"
  ON cashflow_predictions FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT id FROM stores WHERE id = cashflow_predictions.store_id
    )
  );

CREATE POLICY "Users can insert own store cashflow predictions"
  ON cashflow_predictions FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id IN (
      SELECT id FROM stores WHERE id = cashflow_predictions.store_id
    )
  );

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_reconciliation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_reconciliation_updated_at ON reconciliation_records;
CREATE TRIGGER trigger_update_reconciliation_updated_at
  BEFORE UPDATE ON reconciliation_records
  FOR EACH ROW
  EXECUTE FUNCTION update_reconciliation_updated_at();

-- Function to calculate expected payouts from orders
CREATE OR REPLACE FUNCTION calculate_expected_payout(
  p_store_id uuid,
  p_gateway text,
  p_start_date date,
  p_end_date date
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total numeric := 0;
BEGIN
  SELECT COALESCE(SUM(total), 0) INTO v_total
  FROM orders
  WHERE store_id = p_store_id
    AND payment_method = p_gateway
    AND status NOT IN ('cancelled', 'refunded')
    AND created_at::date BETWEEN p_start_date AND p_end_date;
  
  RETURN v_total;
END;
$$;

-- Function to find matching bank transactions
CREATE OR REPLACE FUNCTION find_matching_transactions(
  p_store_id uuid,
  p_gateway text,
  p_amount numeric,
  p_date date,
  p_tolerance_days integer DEFAULT 2,
  p_tolerance_percent numeric DEFAULT 1.0
)
RETURNS TABLE(transaction_id uuid, amount numeric, transaction_date date, description text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_min_amount numeric;
  v_max_amount numeric;
BEGIN
  v_min_amount := p_amount * (1 - p_tolerance_percent / 100);
  v_max_amount := p_amount * (1 + p_tolerance_percent / 100);
  
  RETURN QUERY
  SELECT 
    bt.id,
    bt.normalized_amount,
    bt.transaction_date,
    bt.description
  FROM bank_transactions bt
  WHERE bt.store_id = p_store_id
    AND bt.affects_balance = true
    AND bt.normalized_amount > 0
    AND (
      bt.category_normalized = 'sales_income'
      OR bt.merchant_normalized ILIKE '%' || p_gateway || '%'
    )
    AND bt.transaction_date BETWEEN (p_date - p_tolerance_days) AND (p_date + p_tolerance_days)
    AND bt.normalized_amount BETWEEN v_min_amount AND v_max_amount
  ORDER BY ABS(bt.normalized_amount - p_amount) ASC
  LIMIT 5;
END;
$$;

COMMENT ON TABLE reconciliation_records IS 'Tracks reconciliation between expected payouts and actual bank deposits';
COMMENT ON TABLE cashflow_predictions IS 'AI-generated cashflow forecasts based on historical trends';
COMMENT ON COLUMN reconciliation_records.difference IS 'Auto-calculated: actual_amount - expected_amount';
COMMENT ON COLUMN cashflow_predictions.confidence_score IS 'ML confidence score between 0 and 1';
